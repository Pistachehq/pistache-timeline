import {
  audioEffectGainDb,
  clipPitchAmount,
  clipTransitionAudioMultiplier,
  combinedClipTrackLinearGain,
  effectiveClipLinearGain,
  findTrack,
  playbackRateForSpeed,
  type Clip,
  type ClipId,
  type MediaAssetId,
  type Sequence,
} from '@timeline/core';
import { type MediaHandle } from '@timeline/media';
import { sourceTimeForFrame } from './frame-math';
import { GrainPitchShift } from './grain-pitch';

const SEEK_EPSILON = 0.06;
const DRIFT_WHILE_PLAYING = 0.2;

interface AudioLane {
  readonly clipId: ClipId;
  readonly assetId: MediaAssetId;
  readonly element: HTMLMediaElement;
  readonly source: MediaElementAudioSourceNode;
  readonly highpass: BiquadFilterNode;
  readonly lowpass: BiquadFilterNode;
  readonly compressor: DynamicsCompressorNode;
  readonly gate: GainNode;
  readonly gateAnalyser: AnalyserNode;
  readonly limiter: DynamicsCompressorNode;
  readonly pitch: GrainPitchShift;
  readonly gain: GainNode;
  readonly panner: StereoPannerNode;
  fxKey: string;
}

function disconnect(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    // The node is not connected yet.
  }
}

/** EQ, compressor, and limiter from the clip's audio effects. Gain stays on the lane gain node. */
function applyAudioChain(lane: AudioLane, clip: Clip): void {
  let highpassHz: number | null = null;
  let lowpassHz: number | null = null;
  let thresholdDb = 0;
  let ratio = 1;
  let attackMs = 10;
  let releaseMs = 120;
  let hasCompressor = false;
  let gateDb: number | null = null;
  let ceilingDb = 0;
  let hasLimiter = false;
  for (const effect of clip.effects.audio) {
    if (effect.kind === 'highpass') highpassHz = effect.frequencyHz;
    if (effect.kind === 'lowpass') lowpassHz = effect.frequencyHz;
    if (effect.kind === 'compressor') {
      hasCompressor = true;
      thresholdDb = effect.thresholdDb;
      ratio = effect.ratio;
      attackMs = effect.attackMs;
      releaseMs = effect.releaseMs;
    }
    if (effect.kind === 'noise-gate') gateDb = effect.thresholdDb;
    if (effect.kind === 'limiter') {
      hasLimiter = true;
      ceilingDb = effect.ceilingDb;
    }
  }
  const key = `${highpassHz ?? ''}|${lowpassHz ?? ''}|${hasCompressor ? `${thresholdDb},${ratio},${attackMs},${releaseMs}` : ''}|${gateDb ?? ''}|${hasLimiter ? ceilingDb : ''}`;
  if (lane.fxKey === key) return;
  lane.fxKey = key;

  if (highpassHz !== null) lane.highpass.frequency.value = highpassHz;
  if (lowpassHz !== null) lane.lowpass.frequency.value = lowpassHz;
  if (hasCompressor) {
    lane.compressor.threshold.value = thresholdDb;
    lane.compressor.knee.value = 6;
    lane.compressor.ratio.value = ratio;
    lane.compressor.attack.value = Math.min(1, Math.max(0, attackMs) / 1000);
    lane.compressor.release.value = Math.min(1, Math.max(0, releaseMs) / 1000);
  }
  if (hasLimiter) {
    lane.limiter.threshold.value = ceilingDb;
    lane.limiter.knee.value = 0;
    lane.limiter.ratio.value = 20;
    lane.limiter.attack.value = 0.003;
    lane.limiter.release.value = 0.05;
  }

  disconnect(lane.source);
  disconnect(lane.highpass);
  disconnect(lane.lowpass);
  disconnect(lane.compressor);
  disconnect(lane.gate);
  disconnect(lane.gateAnalyser);
  disconnect(lane.limiter);
  let node: AudioNode = lane.source;
  const link = (next: AudioNode) => {
    node.connect(next);
    node = next;
  };
  if (highpassHz !== null) link(lane.highpass);
  if (lowpassHz !== null) link(lane.lowpass);
  if (hasCompressor) link(lane.compressor);
  if (gateDb !== null) {
    node.connect(lane.gateAnalyser);
    link(lane.gate);
    lane.gate.gain.value = 1;
  }
  node.connect(lane.pitch.input);
  node = lane.pitch.output;
  if (hasLimiter) link(lane.limiter);
  node.connect(lane.gain);
}

function updateNoiseGate(lane: AudioLane, clip: Clip, timeDomain: Uint8Array): void {
  let gateDb: number | null = null;
  for (const effect of clip.effects.audio) {
    if (effect.kind === 'noise-gate') gateDb = effect.thresholdDb;
  }
  if (gateDb === null) return;
  lane.gateAnalyser.getByteTimeDomainData(timeDomain as Uint8Array<ArrayBuffer>);
  let peak = 0;
  for (let i = 0; i < timeDomain.length; i++) {
    peak = Math.max(peak, Math.abs(timeDomain[i]! - 128) / 128);
  }
  lane.gate.gain.value = peak >= 10 ** (gateDb / 20) ? 1 : 0;
}

function laneGain(sequence: Sequence, clip: Clip, frame: number): { linear: number; pan: number } {
  const track = findTrack(sequence, clip.trackId);
  let linear =
    track?.kind === 'audio'
      ? combinedClipTrackLinearGain(clip.audio, track.volume, track.muted)
      : effectiveClipLinearGain(clip);
  linear *= clipTransitionAudioMultiplier(clip, frame);
  linear *= 10 ** (audioEffectGainDb(clip.effects) / 20);
  return { linear, pan: clip.audio.pan };
}

/** Real-time mix of every audible clip (A-tracks + embedded video audio). */
export class ProgramAudioMixer {
  #context: AudioContext | null = null;
  #master: GainNode | null = null;
  #analyser: AnalyserNode | null = null;
  #lanes = new Map<ClipId, AudioLane>();
  #timeDomain: Uint8Array | null = null;
  #host: HTMLElement;

  constructor(host: HTMLElement) {
    this.#host = host;
  }

  #ensureContext(): AudioContext | null {
    if (this.#context) return this.#context;
    try {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      master.connect(analyser);
      analyser.connect(ctx.destination);
      void ctx.resume();
      this.#context = ctx;
      this.#master = master;
      this.#analyser = analyser;
      this.#timeDomain = new Uint8Array(analyser.fftSize);
      return ctx;
    } catch {
      return null;
    }
  }

  #createLane(clipId: ClipId, assetId: MediaAssetId, preferVideo: boolean): AudioLane | null {
    const ctx = this.#ensureContext();
    if (!ctx || !this.#master) return null;
    const element = preferVideo
      ? (document.createElement('video') as HTMLMediaElement)
      : document.createElement('audio');
    element.className = 'sr-only';
    element.preload = 'auto';
    if (element instanceof HTMLVideoElement) element.playsInline = true;
    this.#host.append(element);
    try {
      const source = ctx.createMediaElementSource(element);
      const highpass = ctx.createBiquadFilter();
      const lowpass = ctx.createBiquadFilter();
      const compressor = ctx.createDynamicsCompressor();
      const gate = ctx.createGain();
      const gateAnalyser = ctx.createAnalyser();
      gateAnalyser.fftSize = 256;
      const limiter = ctx.createDynamicsCompressor();
      const pitch = new GrainPitchShift(ctx);
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      highpass.type = 'highpass';
      lowpass.type = 'lowpass';
      gain.connect(panner);
      panner.connect(this.#master);
      return {
        clipId,
        assetId,
        element,
        source,
        highpass,
        lowpass,
        compressor,
        gate,
        gateAnalyser,
        limiter,
        pitch,
        gain,
        panner,
        fxKey: '',
      };
    } catch {
      element.remove();
      return null;
    }
  }

  #removeLane(clipId: ClipId): void {
    const lane = this.#lanes.get(clipId);
    if (!lane) return;
    lane.pitch.dispose();
    lane.element.pause();
    lane.element.removeAttribute('src');
    lane.element.load();
    lane.element.remove();
    this.#lanes.delete(clipId);
  }

  sync(options: {
    readonly clips: readonly Clip[];
    readonly sequence: Sequence;
    readonly frame: number;
    readonly resolveHandle: (assetId: MediaAssetId) => MediaHandle | null;
    readonly playing: boolean;
  }): void {
    const { clips, sequence, frame, resolveHandle, playing } = options;
    const active = new Set<ClipId>();

    for (const clip of clips) {
      active.add(clip.id);
      if (!clip.assetId) continue;
      let lane = this.#lanes.get(clip.id);
      const handle = resolveHandle(clip.assetId);
      if (!handle) continue;

      if (!lane || lane.assetId !== clip.assetId) {
        if (lane) this.#removeLane(clip.id);
        const created = this.#createLane(clip.id, clip.assetId, false);
        if (!created) continue;
        lane = created;
        this.#lanes.set(clip.id, lane);
      }

      const url = handle.url;
      if (lane.element.src !== url) {
        lane.element.src = url;
        lane.element.load();
      }

      applyAudioChain(lane, clip);
      lane.pitch.setAmount(clipPitchAmount(clip.effects.audio));
      if (this.#timeDomain) updateNoiseGate(lane, clip, this.#timeDomain);
      const { linear, pan } = laneGain(sequence, clip, frame);
      lane.gain.gain.value = Math.max(0, linear);
      lane.panner.pan.value = Math.max(-1, Math.min(1, pan / 100));

      const seconds = sourceTimeForFrame(clip, frame, sequence.frameRate);
      const el = lane.element;
      const rate = playbackRateForSpeed(clip.speed);
      const rateChanged = Math.abs(el.playbackRate - rate) > 0.001;
      if (rateChanged) el.playbackRate = rate;
      el.preservesPitch = true;
      const drift = DRIFT_WHILE_PLAYING * Math.max(1, rate);

      if (playing) {
        if (el.paused || rateChanged) {
          if (Math.abs(el.currentTime - seconds) >= SEEK_EPSILON) el.currentTime = seconds;
          if (el.paused) void el.play().catch(() => undefined);
        } else if (Math.abs(el.currentTime - seconds) > drift) {
          el.currentTime = seconds;
        }
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - seconds) >= SEEK_EPSILON) el.currentTime = seconds;
      }
    }

    for (const clipId of this.#lanes.keys()) {
      if (!active.has(clipId)) this.#removeLane(clipId);
    }
  }

  readPeak(): number {
    if (!this.#analyser || !this.#timeDomain) return 0;
    this.#analyser.getByteTimeDomainData(this.#timeDomain as Uint8Array<ArrayBuffer>);
    let peak = 0;
    for (let i = 0; i < this.#timeDomain.length; i++) {
      peak = Math.max(peak, Math.abs(this.#timeDomain[i]! - 128) / 128);
    }
    return peak;
  }

  pauseAll(): void {
    for (const lane of this.#lanes.values()) lane.element.pause();
  }

  dispose(): void {
    for (const clipId of [...this.#lanes.keys()]) this.#removeLane(clipId);
    void this.#context?.close();
    this.#context = null;
    this.#master = null;
    this.#analyser = null;
    this.#timeDomain = null;
  }
}
