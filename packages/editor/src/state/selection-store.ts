import { type ClipId, type MediaAssetId } from '@timeline/core';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type SelectionMode = 'replace' | 'toggle' | 'add';

/** Transient selection state. Never persisted and never part of undo history. */
export interface SelectAssetsOptions {
  /** Keeps shift-range anchor when replacing selection. */
  readonly keepAnchor?: boolean;
}

export interface SelectionState {
  readonly clipIds: readonly ClipId[];
  readonly assetIds: readonly MediaAssetId[];
  /** Asset shown in the Source Monitor / primary highlight in the Project panel. */
  readonly assetId: MediaAssetId | null;
  readonly assetAnchorId: MediaAssetId | null;

  selectClips(ids: readonly ClipId[], mode?: SelectionMode): void;
  clearClips(): void;
  /** Drops selected ids that no longer exist (e.g. after undo). */
  retainClips(exists: (id: ClipId) => boolean): void;
  selectAssets(ids: readonly MediaAssetId[], mode?: SelectionMode, options?: SelectAssetsOptions): void;
  clearAssets(): void;
  retainAssets(exists: (id: MediaAssetId) => boolean): void;
  selectAsset(id: MediaAssetId | null): void;
  reset(): void;
}

export type SelectionStore = StoreApi<SelectionState>;

const EMPTY: readonly ClipId[] = [];
const EMPTY_ASSETS: readonly MediaAssetId[] = [];

export function createSelectionStore(): SelectionStore {
  return createStore<SelectionState>()((set, get) => ({
    clipIds: EMPTY,
    assetIds: EMPTY_ASSETS,
    assetId: null,
    assetAnchorId: null,

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

    selectAssets(ids, mode = 'replace', options) {
      const current = get().assetIds;
      if (mode === 'replace') {
        set({
          assetIds: ids.length ? [...ids] : EMPTY_ASSETS,
          assetId: ids.length ? ids[ids.length - 1]! : null,
          assetAnchorId: options?.keepAnchor
            ? get().assetAnchorId
            : ids.length
              ? ids[0]!
              : null,
        });
        return;
      }
      const next = new Set(current);
      for (const id of ids) {
        if (mode === 'toggle' && next.has(id)) next.delete(id);
        else next.add(id);
      }
      const list = next.size ? [...next] : EMPTY_ASSETS;
      const focus = ids.length ? ids[ids.length - 1]! : null;
      set({
        assetIds: list,
        assetId: focus && next.has(focus) ? focus : list[list.length - 1] ?? null,
      });
    },

    clearAssets() {
      if (get().assetIds.length) set({ assetIds: EMPTY_ASSETS, assetId: null, assetAnchorId: null });
    },

    retainAssets(exists) {
      const current = get().assetIds;
      const kept = current.filter(exists);
      if (kept.length === current.length) return;
      const assetId = get().assetId;
      const anchor = get().assetAnchorId;
      set({
        assetIds: kept.length ? kept : EMPTY_ASSETS,
        assetId: assetId && exists(assetId) ? assetId : kept[kept.length - 1] ?? null,
        assetAnchorId: anchor && exists(anchor) ? anchor : kept[0] ?? null,
      });
    },

    selectAsset(id) {
      if (id === null) {
        if (get().assetId !== null || get().assetIds.length) {
          set({ assetId: null, assetIds: EMPTY_ASSETS, assetAnchorId: null });
        }
        return;
      }
      get().selectAssets([id], 'replace');
    },

    reset() {
      set({ clipIds: EMPTY, assetIds: EMPTY_ASSETS, assetId: null, assetAnchorId: null });
    },
  }));
}
