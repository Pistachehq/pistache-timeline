import {
  collectSnapTargets,
  getActiveSequence,
  getAssetFrameCount,
  getClipDuration,
  snapClipStart,
  snapFrame,
  type Clip,
  type ClipId,
  type MediaAsset,
  type Project,
  type Sequence,
} from '@timeline/core';

export const SNAP_THRESHOLD_PX = 10;

export function snapThresholdFrames(pixelsPerFrame: number): number {
  return Math.max(1, Math.round(SNAP_THRESHOLD_PX / pixelsPerFrame));
}

export function snapClipDrag(
  sequence: Sequence,
  clip: Clip,
  start: number,
  playhead: number,
  pixelsPerFrame: number,
  snapEnabled: boolean,
  excludeClipIds: readonly ClipId[] = [],
): { start: number; guides: readonly number[] } {
  if (!snapEnabled) return { start, guides: [] };
  const exclude = [
    ...new Set<ClipId>([clip.id, ...excludeClipIds, ...(clip.linkId ? [clip.linkId] : [])]),
  ];
  const targets = collectSnapTargets(sequence, { excludeClipIds: exclude, playhead });
  const { frame, guides } = snapClipStart(
    start,
    getClipDuration(clip),
    targets,
    snapThresholdFrames(pixelsPerFrame),
  );
  return { start: frame, guides };
}

export function snapTimelineFrame(
  project: Project,
  frame: number,
  playhead: number,
  pixelsPerFrame: number,
  snapEnabled: boolean,
  excludeClipIds: readonly ClipId[] = [],
): { frame: number; guides: readonly number[] } {
  if (!snapEnabled) return { frame, guides: [] };
  const sequence = getActiveSequence(project);
  if (!sequence) return { frame, guides: [] };
  const targets = collectSnapTargets(sequence, { excludeClipIds, playhead });
  const snapped = snapFrame(frame, targets, snapThresholdFrames(pixelsPerFrame));
  return { frame: snapped.frame, guides: snapped.guides };
}

export function snapAssetDrop(
  sequence: Sequence,
  asset: MediaAsset,
  start: number,
  playhead: number,
  pixelsPerFrame: number,
  snapEnabled: boolean,
): { start: number; guides: readonly number[] } {
  if (!snapEnabled) return { start, guides: [] };
  const duration = getAssetFrameCount(asset, sequence);
  const targets = collectSnapTargets(sequence, { playhead });
  const { frame, guides } = snapClipStart(start, duration, targets, snapThresholdFrames(pixelsPerFrame));
  return { start: frame, guides };
}
