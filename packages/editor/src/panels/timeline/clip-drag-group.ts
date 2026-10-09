import {
  findTrack,
  pairedAudioTrack,
  pairedVideoTrack,
  type Clip,
  type ClipId,
  type Sequence,
  type TrackId,
} from '@timeline/core';
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

function laneTop(trackId: TrackId): number | null {
  const lane = document.querySelector<HTMLElement>(`[data-track-lane][data-track-id="${trackId}"]`);
  return lane ? lane.getBoundingClientRect().top : null;
}

function linkedPartnerTrackId(
  sequence: Sequence,
  primary: Clip,
  primaryDestTrackId: TrackId,
  partner: Clip,
): TrackId {
  const linked = primary.linkId === partner.id || partner.linkId === primary.id;
  if (!linked) return partner.trackId;

  const primaryDest = findTrack(sequence, primaryDestTrackId);
  if (!primaryDest) return partner.trackId;

  if (primaryDest.kind === 'video') {
    return pairedAudioTrack(sequence, primaryDestTrackId)?.id ?? partner.trackId;
  }
  return pairedVideoTrack(sequence, primaryDestTrackId)?.id ?? partner.trackId;
}

export function buildDragPreviews(
  sequence: Sequence,
  moving: readonly Clip[],
  primary: Clip,
  primaryStart: number,
  primaryDestTrackId: TrackId,
  primaryOffsetY: number,
): ClipDragPreview[] {
  const delta = primaryStart - primary.start;

  return moving.map((clip) => {
    if (clip.id === primary.id) {
      return {
        clipId: clip.id,
        start: primaryStart,
        trackId: primaryDestTrackId,
        offsetY: primaryOffsetY,
      };
    }

    const destTrackId = linkedPartnerTrackId(sequence, primary, primaryDestTrackId, clip);
    const sourceTop = laneTop(clip.trackId);
    const destTop = laneTop(destTrackId);
    const offsetY =
      sourceTop !== null && destTop !== null ? destTop - sourceTop : primaryOffsetY;

    return {
      clipId: clip.id,
      start: Math.max(0, clip.start + delta),
      trackId: destTrackId,
      offsetY,
    };
  });
}
