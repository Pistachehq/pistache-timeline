import {

  type ActiveVideoClip,

  getActiveSequence,

  getClipEnd,

  getSequenceDuration,

  clipContributesEmbeddedAudio,

  getTopmostAudioClipAt,

  getTopmostVideoClipAt,

  type Clip,

  type ClipId,

  type MediaAssetId,

  type Sequence,

} from '@timeline/core';

import { type MediaPlayer } from '@timeline/media';

import { type EditorServices } from '../runtime/services';

import { FrameClock, frameForSourceTime, sourceTimeForFrame } from './frame-math';



/**

 * Drives the Program Monitor: topmost video for picture, topmost audio-track

 * clip (or the program video clip) for sound.

 */

export class SequencePlaybackController {

  readonly #services: EditorServices;

  readonly #video: MediaPlayer;

  readonly #audio: MediaPlayer;

  readonly #clock = new FrameClock();

  readonly #unsubscribers: (() => void)[] = [];

  #raf: number | null = null;

  #lastTick = 0;

  #ownPlayhead: number | null = null;

  #disposed = false;

  #videoClip: ActiveVideoClip | null = null;

  #audioClip: Clip | null = null;

  #loadedVideoAssetId: MediaAssetId | null = null;

  #loadedAudioAssetId: MediaAssetId | null = null;

  #boundVideoClipId: ClipId | null = null;

  #boundAudioClipId: ClipId | null = null;



  constructor(services: EditorServices, videoPlayer: MediaPlayer, audioPlayer: MediaPlayer) {

    this.#services = services;

    this.#video = videoPlayer;

    this.#audio = audioPlayer;

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

    videoPlayer.element.addEventListener('loadeddata', this.#onLoadedData);

    videoPlayer.element.addEventListener('seeked', this.#onLoadedData);

    audioPlayer.element.addEventListener('loadeddata', this.#onLoadedData);

    audioPlayer.element.addEventListener('seeked', this.#onLoadedData);

    this.#refresh();

  }



  dispose(): void {

    if (this.#disposed) return;

    this.#disposed = true;

    this.#cancelLoop();

    for (const unsubscribe of this.#unsubscribers) unsubscribe();

    this.#video.element.removeEventListener('loadeddata', this.#onLoadedData);

    this.#video.element.removeEventListener('seeked', this.#onLoadedData);

    this.#audio.element.removeEventListener('loadeddata', this.#onLoadedData);

    this.#audio.element.removeEventListener('seeked', this.#onLoadedData);

    this.#video.dispose();

    this.#audio.dispose();

    this.#services.stores.playback.getState().setProgram(null, 'empty');

  }



  readonly #onLoadedData = () => {

    if (!this.#services.stores.playback.getState().playing) this.#refresh();

  };



  #sequence(): Sequence | undefined {

    return getActiveSequence(this.#services.stores.project.getState().project);

  }



  #selectAudioClip(sequence: Sequence, frame: number, video: ActiveVideoClip | null): Clip | null {

    const onAudioTrack = getTopmostAudioClipAt(sequence, frame);

    if (onAudioTrack) return onAudioTrack.clip;

    if (video && clipContributesEmbeddedAudio(video.clip)) return video.clip;

    return null;

  }



  #syncClipsToFrame(frame: number, sequence: Sequence): void {
    if (this.#videoClip) {
      this.#video.seek(sourceTimeForFrame(this.#videoClip.clip, frame, sequence.frameRate));
    }
    if (this.#audioClip) {
      this.#audio.seek(sourceTimeForFrame(this.#audioClip, frame, sequence.frameRate));
    }
  }

  #bind(sequence: Sequence, frame: number): ActiveVideoClip | null {
    const { playback, media } = this.#services.stores;
    const activeVideo = getTopmostVideoClipAt(sequence, frame);
    const audioClip = this.#selectAudioClip(sequence, frame, activeVideo);
    const prevVideoClipId = this.#boundVideoClipId;
    const prevAudioClipId = this.#boundAudioClipId;

    this.#videoClip = activeVideo;
    this.#audioClip = audioClip;

    if (activeVideo) {
      const entry = media.getState().entries[activeVideo.clip.assetId];
      if (entry?.status !== 'online' || !entry.handle) {
        this.#video.load(null);
        this.#loadedVideoAssetId = null;
        playback.getState().setProgram(activeVideo.clip.id, entry?.status === 'resolving' ? 'loading' : 'offline');
        return null;
      }
      if (this.#loadedVideoAssetId !== activeVideo.clip.assetId) {
        this.#video.load(entry.handle);
        this.#loadedVideoAssetId = activeVideo.clip.assetId;
      }
      this.#video.setMuted(true);
      playback.getState().setProgram(activeVideo.clip.id, this.#video.ready ? 'ready' : 'loading');
    } else {
      if (this.#loadedVideoAssetId !== null) {
        this.#video.load(null);
        this.#loadedVideoAssetId = null;
      }
      playback.getState().setProgram(null, Object.keys(sequence.clips).length ? 'gap' : 'empty');
    }

    if (audioClip) {
      const entry = media.getState().entries[audioClip.assetId];
      if (entry?.status === 'online' && entry.handle) {
        if (this.#loadedAudioAssetId !== audioClip.assetId) {
          this.#audio.load(entry.handle);
          this.#loadedAudioAssetId = audioClip.assetId;
        }
        this.#audio.setVolume(audioClip.audio.volume / 100);
        this.#audio.setMuted(audioClip.audio.muted);
      } else {
        this.#audio.load(null);
        this.#loadedAudioAssetId = null;
      }
    } else if (this.#loadedAudioAssetId !== null) {
      this.#audio.load(null);
      this.#loadedAudioAssetId = null;
    }

    const videoClipId = activeVideo?.clip.id ?? null;
    const audioClipId = audioClip?.id ?? null;
    if (videoClipId !== prevVideoClipId || audioClipId !== prevAudioClipId) {
      this.#boundVideoClipId = videoClipId;
      this.#boundAudioClipId = audioClipId;
      this.#syncClipsToFrame(frame, sequence);
    }

    return activeVideo;
  }



  #refresh(): void {

    const sequence = this.#sequence();

    if (!sequence) return;

    const { playhead, playing } = this.#services.stores.playback.getState();

    this.#boundVideoClipId = null;
    this.#boundAudioClipId = null;
    this.#bind(sequence, playhead);

    if (playing) return;

    if (this.#videoClip) {

      this.#video.seek(sourceTimeForFrame(this.#videoClip.clip, playhead, sequence.frameRate));

    }

    if (this.#audioClip) {

      this.#audio.seek(sourceTimeForFrame(this.#audioClip, playhead, sequence.frameRate));

    }

  }



  #seek(frame: number): void {

    const sequence = this.#sequence();

    if (!sequence) return;

    this.#bind(sequence, frame);

    if (this.#videoClip) {

      this.#video.seek(sourceTimeForFrame(this.#videoClip.clip, frame, sequence.frameRate));

    }

    if (this.#audioClip) {

      this.#audio.seek(sourceTimeForFrame(this.#audioClip, frame, sequence.frameRate));

    }

    if (this.#services.stores.playback.getState().playing) {

      void this.#video.play().catch(() => undefined);

      void this.#audio.play().catch(() => undefined);

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

    this.#video.pause();

    this.#audio.pause();

    this.#refresh();

  }



  #cancelLoop(): void {

    if (this.#raf !== null) cancelAnimationFrame(this.#raf);

    this.#raf = null;

  }



  readonly #tick = (now: number) => {

    const { playback } = this.#services.stores;

    const sequence = this.#sequence();

    if (!sequence || !playback.getState().playing) return;

    const elapsed = now - this.#lastTick;

    this.#lastTick = now;



    const end = getSequenceDuration(sequence);

    const current = playback.getState().playhead;

    this.#bind(sequence, current);

    let next = current;



    if (this.#videoClip) {

      const clip = this.#videoClip.clip;

      if (this.#video.element.ended) {

        next = getClipEnd(clip);

      } else if (this.#video.paused) {
        const seconds = sourceTimeForFrame(clip, current, sequence.frameRate);
        this.#video.seek(seconds);
        if (this.#audioClip) {
          this.#audio.seek(sourceTimeForFrame(this.#audioClip, current, sequence.frameRate));
        }
        void this.#video.play().catch(() => undefined);
        void this.#audio.play().catch(() => undefined);
      } else if (this.#video.ready) {

        next = Math.max(current, frameForSourceTime(clip, this.#video.currentTime, sequence.frameRate));

      }

      if (next >= getClipEnd(clip)) {

        next = getClipEnd(clip);

        this.#video.pause();

        this.#audio.pause();

      }

    } else if (this.#audioClip) {

      const clip = this.#audioClip;

      if (this.#audio.element.ended) {

        next = getClipEnd(clip);

      } else if (this.#audio.paused) {

        this.#audio.seek(sourceTimeForFrame(clip, current, sequence.frameRate));

        void this.#audio.play().catch(() => undefined);

      } else if (this.#audio.ready) {

        next = Math.max(current, frameForSourceTime(clip, this.#audio.currentTime, sequence.frameRate));

      }

      if (next >= getClipEnd(clip)) {

        next = getClipEnd(clip);

        this.#audio.pause();

      }

    } else {

      next = this.#clock.advance(current, elapsed, sequence.frameRate);

    }



    if (next >= end) {

      this.#write(end);

      playback.getState().setPlaying(false);

      return;

    }

    this.#write(next);

    this.#raf = requestAnimationFrame(this.#tick);

  };



  #write(frame: number): void {

    this.#ownPlayhead = Math.max(0, Math.round(frame));

    this.#services.stores.playback.getState().setPlayhead(frame);

  }

}


