import { type ClipId, type MediaAssetId } from '@timeline/core';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type SelectionMode = 'replace' | 'toggle' | 'add';

/** Transient selection state. Never persisted and never part of undo history. */
export interface SelectionState {
  readonly clipIds: readonly ClipId[];
  /** Asset shown in the Source Monitor / highlighted in the Project panel. */
  readonly assetId: MediaAssetId | null;

  selectClips(ids: readonly ClipId[], mode?: SelectionMode): void;
  clearClips(): void;
  /** Drops selected ids that no longer exist (e.g. after undo). */
  retainClips(exists: (id: ClipId) => boolean): void;
  selectAsset(id: MediaAssetId | null): void;
  reset(): void;
}

export type SelectionStore = StoreApi<SelectionState>;

const EMPTY: readonly ClipId[] = [];

export function createSelectionStore(): SelectionStore {
  return createStore<SelectionState>()((set, get) => ({
    clipIds: EMPTY,
    assetId: null,

    selectClips(ids, mode = 'replace') {
      const current = get().clipIds;
      if (mode === 'replace') {
        set({ clipIds: ids.length ? [...ids] : EMPTY });
        return;
      }
      const next = new Set(current);
      for (const id of ids) {
        if (mode === 'toggle' && next.has(id)) next.delete(id);
        else next.add(id);
      }
      set({ clipIds: next.size ? [...next] : EMPTY });
    },

    clearClips() {
      if (get().clipIds.length) set({ clipIds: EMPTY });
    },

    retainClips(exists) {
      const current = get().clipIds;
      const kept = current.filter(exists);
      if (kept.length !== current.length) set({ clipIds: kept.length ? kept : EMPTY });
    },

    selectAsset(id) {
      if (get().assetId !== id) set({ assetId: id });
    },

    reset() {
      set({ clipIds: EMPTY, assetId: null });
    },
  }));
}
