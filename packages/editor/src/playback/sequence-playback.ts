import {
  type ActiveVideoClip,
  getActiveSequence,
  getAudibleClipsAt,
  getClipEnd,
  getSequenceDuration,
  getTopmostVideoClipAt,
  type ClipId,
  type Sequence,
} from '@timeline/core';
import { type MediaPlayer } from '@timeline/media';
import { type EditorServices } from '../runtime/services';
import { FrameClock } from './frame-math';
import { ProgramAudioMixer } from './program-audio-mixer';
import { teardownPlaybackAudioMeter } from './playback-audio-meter';

/**
 * Drives program playback: composited video in the monitor, mixed audio from
 * every audible clip at the playhead.
 */
export class SequencePlaybackController {
  readonly #services: EditorServices;
  readonly #video: MediaPlayer;
  readonly #mixer: ProgramAudioMixer;
  readonly #clock = new FrameClock();
  readonly #unsubscribers: (() => void)[] = [];
  #raf: number | null = null;
  #lastTick = 0;
  #ownPlayhead: number | null = null;
  #disposed = false;
  #videoClip: ActiveVideoClip | null = null;
  #boundVideoClipId: ClipId | null = null;
  #lastAudibleKey = '';

  constructor(services: EditorServices, videoPlayer: MediaPlayer, audioHost: HTMLElement) {
    this.#services = services;
    this.#video = videoPlayer;
    this.#mixer = new ProgramAudioMixer(audioHost);
    const { playback, project, media } = services.stores;

    this.#unsubscribers.push(
      playback.subscribe((state, previous) => {
        if (state.playing !== previous.playing) {
          if (state.playing) this.#start();
          else this.#stop();
        } else if (state.playhead !== previous.playhead && state.playhead !== this.#ownPlayhead) {
          this.#seek(state.playhead);
        }
      }),
      project.subscribe((state, previous) => {
        if (state.project !== previous.project) this.#refresh();
      }),
      media.subscribe((state, previous) => {
        if (state.entries !== previous.entries) this.#refresh();
      }),
    );
    this.#refresh();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelLoop();
    for (const unsubscribe of this.#unsubscribers) unsubscribe();
    this.#video.dispose();
    this.#mixer.dispose();
    teardownPlaybackAudioMeter();
    this.#services.stores.ui.getState().setPlaybackMeter(null, 0);
    this.#services.stores.playback.getState().setProgram(null, 'empty');
  }

  #sequence(): Sequence | undefined {
    return getActiveSequence(this.#services.stores.project.getState().project);
  }

  #audibleKey(sequence: Sequence, frame: number): string {
    const project = this.#services.stores.project.getState().project;
    return getAudibleClipsAt(sequence, frame, project.mediaAssets)
      .map((c) => c.id)
      .sort()
      .join('\0');
  }

  #syncAudio(sequence: Sequence, frame: number, playing: boolean): void {
    const project = this.#services.stores.project.getState().project;
    const { media } = this.#services.stores;
    const clips = getAudibleClipsAt(sequence, frame, project.mediaAssets);
    this.#mixer.sync({
      clips,
      sequence,
      frame,
      playing,
      resolveHandle: (assetId) => media.getState().entries[assetId]?.handle ?? null,
    });
  }

  #bind(sequence: Sequence, frame: number): ActiveVideoClip | null {
    const { playback, media } = this.#services.stores;
    const activeVideo = getTopmostVideoClipAt(sequence, frame);
    const prevVideoClipId = this.#boundVideoClipId;

    this.#videoClip = activeVideo;

    if (activeVideo?.clip.text) {
      playback.getState().setProgram(activeVideo.clip.id, 'ready');
    } else if (activeVideo) {
      const assetId = activeVideo.clip.assetId;
      const entry = assetId ? media.getState().entries[assetId] : undefined;
      if (entry?.status !== 'online' || !entry.handle) {
        playback.getState().setProgram(activeVideo.clip.id, entry?.status === 'resolving' ? 'loading' : 'offline');
      } else {
        playback.getState().setProgram(activeVideo.clip.id, 'ready');
      }
    } else {
      playback.getState().setProgram(null, Object.keys(sequence.clips).length ? 'gap' : 'empty');
    }

    this.#video.load(null);
    this.#video.pause();

    const videoClipId = activeVideo?.clip.id ?? null;
    if (videoClipId !== prevVideoClipId) {
      this.#boundVideoClipId = videoClipId;
    }

    const playing = playback.getState().playing;
    this.#syncAudio(sequence, frame, playing);
    this.#lastAudibleKey = this.#audibleKey(sequence, frame);

    return activeVideo;
  }

  #refresh(): void {
    const sequence = this.#sequence();
    if (!sequence) return;
    const { playhead, playing } = this.#services.stores.playback.getState();
    this.#boundVideoClipId = null;
    this.#lastAudibleKey = '';
    this.#bind(sequence, playhead);
    if (!playing) this.#mixer.pauseAll();
  }

  #seek(frame: number): void {
    const sequence = this.#sequence();
    if (!sequence) return;
    const playing = this.#services.stores.playback.getState().playing;
    const key = this.#audibleKey(sequence, frame);
    const top = getTopmostVideoClipAt(sequence, frame)?.clip.id ?? null;
    if (key !== this.#lastAudibleKey || top !== this.#boundVideoClipId) {
      this.#bind(sequence, frame);
    } else {
      this.#syncAudio(sequence, frame, playing);
    }
  }

  #start(): void {
    this.#clock.reset();
    this.#lastTick = performance.now();
    this.#seek(this.#services.stores.playback.getState().playhead);
    this.#cancelLoop();
    this.#raf = requestAnimationFrame(this.#tick);
  }

  #stop(): void {
    this.#cancelLoop();
    this.#mixer.pauseAll();
    this.#refresh();
  }

  #cancelLoop(): void {
    if (this.#raf !== null) cancelAnimationFrame(this.#raf);
    this.#raf = null;
  }

  readonly #tick = (now: number) => {
    const { playback } = this.#services.stores;
    const sequence = this.#sequence();
    if (!sequence || !playback.getState().playing) {
      this.#services.stores.ui.getState().setPlaybackMeter(null, 0);
      return;
    }

    const meterPeak = this.#mixer.readPeak();
    this.#services.stores.ui.getState().setPlaybackMeter(null, meterPeak);

    const elapsed = now - this.#lastTick;
    this.#lastTick = now;
    const end = getSequenceDuration(sequence);
    const current = playback.getState().playhead;

    let next = current;
    if (this.#videoClip) {
      next = this.#clock.advance(current, elapsed, sequence.frameRate);
      if (next >= getClipEnd(this.#videoClip.clip)) {
        next = getClipEnd(this.#videoClip.clip);
      }
    } else {
      next = this.#clock.advance(current, elapsed, sequence.frameRate);
    }

    if (next >= end) {
      this.#bind(sequence, end);
      this.#write(end);
      playback.getState().setPlaying(false);
      return;
    }

    const key = this.#audibleKey(sequence, next);
    const top = getTopmostVideoClipAt(sequence, next)?.clip.id ?? null;
    if (key !== this.#lastAudibleKey || top !== this.#boundVideoClipId) {
      this.#bind(sequence, next);
    } else {
      this.#syncAudio(sequence, next, true);
    }

    this.#write(next);
    this.#raf = requestAnimationFrame(this.#tick);
  };

  #write(frame: number): void {
    this.#ownPlayhead = Math.max(0, Math.round(frame));
    this.#services.stores.playback.getState().setPlayhead(frame);
  }
}
