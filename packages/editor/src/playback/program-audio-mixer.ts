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
import {
  audioChainKey,
  buildAudioEffectChain,
  gateTargetGain,
  noiseGateOf,
  type AudioEffectChain,
  type MediaHandle,
} from '@timeline/media';
import { bindOutputTarget } from '../audio/audio-hardware';
import { sourceTimeForFrame } from './frame-math';
import { GrainPitchShift } from './grain-pitch';

const SEEK_EPSILON = 0.06;
const DRIFT_WHILE_PLAYING = 0.2;

interface AudioLane {
  clipId: ClipId;
  readonly assetId: MediaAssetId;
  readonly element: HTMLMediaElement;
  readonly source: MediaElementAudioSourceNode;
  readonly gate: GainNode;
  readonly gateAnalyser: AnalyserNode;
  readonly pitch: GrainPitchShift;
  readonly gain: GainNode;
  readonly panner: StereoPannerNode;
  chain: AudioEffectChain | null;
  fxKey: string | null;
}

/** Gate first, then EQ, dynamics, delay and reverb in clip order, then pitch. Gain stays on the lane gain node. */
function applyAudioChain(lane: AudioLane, clip: Clip): void {
  const key = audioChainKey(clip.effects.audio);
  if (lane.fxKey === key) return;
  lane.fxKey = key;
  lane.chain?.dispose();
  try {
    lane.gate.disconnect();
  } catch {
    // Not connected yet.
  }
  const chain = buildAudioEffectChain(lane.source.context, clip.effects.audio);
  lane.chain = chain;
  lane.gate.connect(chain.input);
  chain.output.connect(lane.pitch.input);
}

function updateNoiseGate(lane: AudioLane, clip: Clip, timeDomain: Uint8Array): void {
  const gate = noiseGateOf(clip.effects.audio);
  const now = lane.gate.context.currentTime;
  if (!gate) {
    if (lane.gate.gain.value !== 1) lane.gate.gain.setTargetAtTime(1, now, 0.01);
    return;
  }
  lane.gateAnalyser.getByteTimeDomainData(timeDomain as Uint8Array<ArrayBuffer>);
  let peak = 0;
  for (let i = 0; i < timeDomain.length; i++) {
    peak = Math.max(peak, Math.abs(timeDomain[i]! - 128) / 128);
  }
  const target = gateTargetGain(gate, peak);
  const opening = target > lane.gate.gain.value;
  const ms = opening ? Math.max(0.5, gate.attackMs) : Math.max(5, gate.releaseMs);
  lane.gate.gain.setTargetAtTime(target, now, ms / 1000 / 3);
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
  #unbindOutput: (() => void) | null = null;
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
      this.#unbindOutput?.();
      this.#unbindOutput = bindOutputTarget(ctx);
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
      const gate = ctx.createGain();
      const gateAnalyser = ctx.createAnalyser();
      gateAnalyser.fftSize = 256;
      const pitch = new GrainPitchShift(ctx);
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      source.connect(gateAnalyser);
      source.connect(gate);
      pitch.output.connect(gain);
      gain.connect(panner);
      panner.connect(this.#master);
      return {
        clipId,
        assetId,
        element,
        source,
        gate,
        gateAnalyser,
        pitch,
        gain,
        panner,
        chain: null,
        fxKey: null,
      };
    } catch {
      element.remove();
      return null;
    }
  }

  #destroyLane(lane: AudioLane): void {
    const url = lane.element.src;
    const sharesUrl = url !== '' && [...this.#lanes.values()].some((other) => other !== lane && other.element.src === url);
    lane.chain?.dispose();
    lane.pitch.dispose();
    lane.element.pause();
    if (!sharesUrl) {
      lane.element.removeAttribute('src');
      lane.element.load();
    }
    lane.element.remove();
  }

  #removeLane(clipId: ClipId): void {
    const lane = this.#lanes.get(clipId);
    if (!lane) return;
    this.#lanes.delete(clipId);
    this.#destroyLane(lane);
  }

  /**
   * Keep the element that is already playing this media. Tearing it down at a
   * razor cut restarts the decoder and makes the next piece (a pitch change,
   * another effect) stutter or drop out.
   */
  #reassignContinuations(
    clips: readonly Clip[],
    resolveHandle: (assetId: MediaAssetId) => MediaHandle | null,
  ): void {
    const wanted = new Set<ClipId>();
    for (const clip of clips) {
      if (clip.assetId) wanted.add(clip.id);
    }
    const spare: AudioLane[] = [];
    for (const [id, lane] of this.#lanes) {
      if (wanted.has(id)) continue;
      this.#lanes.delete(id);
      spare.push(lane);
    }
    for (const clip of clips) {
      if (!clip.assetId || this.#lanes.has(clip.id)) continue;
      const handle = resolveHandle(clip.assetId);
      if (!handle) continue;
      const index = spare.findIndex((lane) => lane.assetId === clip.assetId);
      if (index < 0) continue;
      const lane = spare.splice(index, 1)[0];
      if (!lane) continue;
      lane.clipId = clip.id;
      this.#lanes.set(clip.id, lane);
    }
    for (const lane of spare) this.#destroyLane(lane);
  }

  sync(options: {
    readonly clips: readonly Clip[];
    readonly sequence: Sequence;
    readonly frame: number;
    readonly resolveHandle: (assetId: MediaAssetId) => MediaHandle | null;
    readonly playing: boolean;
  }): void {
    const { clips, sequence, frame, resolveHandle, playing } = options;
    this.#reassignContinuations(clips, resolveHandle);
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
    this.#unbindOutput?.();
    this.#unbindOutput = null;
    void this.#context?.close();
    this.#context = null;
    this.#master = null;
    this.#analyser = null;
    this.#timeDomain = null;
  }
}
