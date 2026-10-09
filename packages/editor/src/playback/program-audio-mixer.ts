import {
  audioEffectGainDb,
  clipTransitionAudioMultiplier,
  combinedClipTrackLinearGain,
  effectiveClipLinearGain,
  findTrack,
  type Clip,
  type ClipId,
  type MediaAssetId,
  type Sequence,
} from '@timeline/core';
import { type MediaHandle } from '@timeline/media';
import { sourceTimeForFrame } from './frame-math';

const SEEK_EPSILON = 0.06;
const DRIFT_WHILE_PLAYING = 0.2;

interface AudioLane {
  readonly clipId: ClipId;
  readonly assetId: MediaAssetId;
  readonly element: HTMLMediaElement;
  readonly source: MediaElementAudioSourceNode;
  readonly gain: GainNode;
  readonly panner: StereoPannerNode;
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
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      source.connect(gain);
      gain.connect(panner);
      panner.connect(this.#master);
      return { clipId, assetId, element, source, gain, panner };
    } catch {
      element.remove();
      return null;
    }
  }

  #removeLane(clipId: ClipId): void {
    const lane = this.#lanes.get(clipId);
    if (!lane) return;
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

      const { linear, pan } = laneGain(sequence, clip, frame);
      lane.gain.gain.value = Math.max(0, linear);
      lane.panner.pan.value = Math.max(-1, Math.min(1, pan / 100));

      const seconds = sourceTimeForFrame(clip, frame, sequence.frameRate);
      const el = lane.element;

      if (playing) {
        if (el.paused) {
          if (Math.abs(el.currentTime - seconds) >= SEEK_EPSILON) el.currentTime = seconds;
          void el.play().catch(() => undefined);
        } else if (Math.abs(el.currentTime - seconds) > DRIFT_WHILE_PLAYING) {
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
