import { type MediaAssetId } from '@timeline/core';
import { type MediaHandle, type WaveformPeaks } from '@timeline/media';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type MediaStatus = 'resolving' | 'online' | 'offline' | 'error';

/** Runtime availability of an asset in this session. Not persisted. */
export interface MediaEntry {
  readonly status: MediaStatus;
  readonly handle: MediaHandle | null;
  /** Small encoded poster frame. */
  readonly thumbnail: string | null;
  /** Peak envelope for timeline waveforms (full file, sliced per clip). */
  readonly waveform: WaveformPeaks | null;
  readonly error: string | null;
}

export interface MediaState {
  readonly entries: Readonly<Record<MediaAssetId, MediaEntry>>;
  setEntry(id: MediaAssetId, entry: Partial<MediaEntry>): void;
  clear(): void;
}

export type MediaStore = StoreApi<MediaState>;

const EMPTY_ENTRY: MediaEntry = {
  status: 'resolving',
  handle: null,
  thumbnail: null,
  waveform: null,
  error: null,
};

export function createMediaStore(): MediaStore {
  return createStore<MediaState>()((set, get) => ({
    entries: {},

    setEntry(id, entry) {
      const current = get().entries[id] ?? EMPTY_ENTRY;
      set({ entries: { ...get().entries, [id]: { ...current, ...entry } } });
    },

    clear: () => set({ entries: {} }),
  }));
}
