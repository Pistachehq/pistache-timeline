import { type ClipId } from '@timeline/core';
import { createStore, type StoreApi } from 'zustand/vanilla';

/** What the Program Monitor is currently able to show at the playhead. */
export type ProgramStatus = 'empty' | 'gap' | 'offline' | 'loading' | 'ready';

/**
 * Transient playback state. The playhead updates every animation frame while
 * playing, so components should subscribe to it narrowly (or imperatively).
 */
export interface PlaybackState {
  /** Playhead position in sequence frames. */
  readonly playhead: number;
  readonly playing: boolean;
  /** Clip rendered by the Program Monitor, if any. */
  readonly programClipId: ClipId | null;
  readonly programStatus: ProgramStatus;

  setPlayhead(frame: number): void;
  setPlaying(playing: boolean): void;
  setProgram(clipId: ClipId | null, status: ProgramStatus): void;
}

export type PlaybackStore = StoreApi<PlaybackState>;

export function createPlaybackStore(): PlaybackStore {
  return createStore<PlaybackState>()((set, get) => ({
    playhead: 0,
    playing: false,
    programClipId: null,
    programStatus: 'empty',

    setPlayhead(frame) {
      const next = Math.max(0, Math.round(frame));
      if (next !== get().playhead) set({ playhead: next });
    },

    setPlaying(playing) {
      if (playing !== get().playing) set({ playing });
    },

    setProgram(programClipId, programStatus) {
      const state = get();
      if (state.programClipId !== programClipId || state.programStatus !== programStatus) {
        set({ programClipId, programStatus });
      }
    },
  }));
}
