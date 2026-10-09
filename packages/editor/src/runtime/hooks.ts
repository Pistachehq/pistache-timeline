import { type Clip, getActiveSequence, type MediaAsset, type MediaAssetId, type Sequence } from '@timeline/core';
import { useRef } from 'react';
import { usePlaybackState, useProjectState, useRuntime, useSelectionState } from './context';

export function useActiveSequence(): Sequence | undefined {
  return useProjectState((state) => getActiveSequence(state.project));
}

export function useAsset(assetId: MediaAssetId | null | undefined): MediaAsset | undefined {
  return useProjectState((state) => (assetId ? state.project.mediaAssets[assetId] : undefined));
}

/**
 * Playhead for inspectors and effect readouts.
 * While playback is running it stays on the last paused frame so those panels
 * do not re-render on every animation frame.
 */
export function useEditPlayhead(): number {
  const runtime = useRuntime();
  const playing = usePlaybackState((state) => state.playing);
  const scrub = usePlaybackState((state) => (state.playing ? -1 : state.playhead));
  const held = useRef(runtime.stores.playback.getState().playhead);
  if (!playing && scrub >= 0) held.current = scrub;
  return playing ? held.current : scrub;
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
