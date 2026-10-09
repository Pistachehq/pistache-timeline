import { type Clip, getActiveSequence, type MediaAsset, type MediaAssetId, type Sequence } from '@timeline/core';
import { useProjectState, useSelectionState } from './context';

export function useActiveSequence(): Sequence | undefined {
  return useProjectState((state) => getActiveSequence(state.project));
}

export function useAsset(assetId: MediaAssetId | null | undefined): MediaAsset | undefined {
  return useProjectState((state) => (assetId ? state.project.mediaAssets[assetId] : undefined));
}

/** The single selected clip, or `undefined` when zero or several are selected. */
export function useSingleSelectedClip(): Clip | undefined {
  const clipIds = useSelectionState((state) => state.clipIds);
  return useProjectState((state) => {
    if (clipIds.length !== 1) return undefined;
    const sequence = getActiveSequence(state.project);
    return sequence?.clips[clipIds[0]!];
  });
}
