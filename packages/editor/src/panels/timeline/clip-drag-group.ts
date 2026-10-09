import { findTrack, type Clip, type ClipId, type Sequence, type TrackId } from '@timeline/core';
import { type ClipDragPreview } from '../../state/ui-store';

/** Clips that move together: selection (or primary alone) plus unlocked linked partners. */
export function expandMovingClips(sequence: Sequence, primary: Clip, selectedIds: readonly ClipId[]): Clip[] {
  const ids = new Set<ClipId>();
  const useSelection = selectedIds.length > 0 && selectedIds.includes(primary.id);
  if (useSelection) {
    for (const id of selectedIds) {
      if (sequence.clips[id]) ids.add(id);
    }
  } else {
    ids.add(primary.id);
  }

  for (const id of [...ids]) {
    const clip = sequence.clips[id];
    if (!clip?.linkId) continue;
    const partner = sequence.clips[clip.linkId];
    if (!partner) continue;
    const partnerTrack = findTrack(sequence, partner.trackId);
    if (partnerTrack?.locked) continue;
    ids.add(partner.id);
  }

  return [...ids]
    .map((id) => sequence.clips[id])
    .filter((c): c is Clip => c !== undefined);
}

export function buildDragPreviews(
  moving: readonly Clip[],
  primary: Clip,
  primaryStart: number,
  primaryTrackId: TrackId,
  primaryOffsetY: number,
): ClipDragPreview[] {
  const delta = primaryStart - primary.start;
  return moving.map((clip) => {
    if (clip.id === primary.id) {
      return { clipId: clip.id, start: primaryStart, trackId: primaryTrackId, offsetY: primaryOffsetY };
    }
    return {
      clipId: clip.id,
      start: Math.max(0, clip.start + delta),
      trackId: clip.trackId,
      offsetY: 0,
    };
  });
}
