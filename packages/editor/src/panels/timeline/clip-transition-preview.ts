import { type Clip, type Sequence, type Track } from '@timeline/core';
import { type ClipDragState, type ClipTrimState } from '../../state/ui-store';

/**
 * Timeline geometry for transition overlays (drag / trim preview).
 * Transition durations are unchanged — only clip start/end move with the clip.
 */
export function applyClipTimelinePreview(
  clip: Clip,
  track: Track,
  trim: ClipTrimState | null,
  drag: ClipDragState | null,
): Clip | null {
  const dragPreview = drag?.previews.find((p) => p.clipId === clip.id);

  if (dragPreview && dragPreview.trackId !== track.id && clip.trackId === track.id) {
    return null;
  }

  let next = clip;

  if (dragPreview && dragPreview.trackId === track.id) {
    next = { ...next, start: dragPreview.start };
  }

  const trimPreview = trim?.previews.find((p) => p.clipId === clip.id);
  if (trimPreview) {
    next = {
      ...next,
      start: trimPreview.start,
      sourceIn: trimPreview.sourceIn,
      sourceOut: trimPreview.sourceOut,
    };
  }

  return next;
}

/** Cross-track drag ghosts that are not in the visible clip list yet. */
export function dragGhostClipsForTransitions(
  sequence: Sequence,
  track: Track,
  visibleClips: readonly Clip[],
  drag: ClipDragState | null,
): readonly Clip[] {
  if (!drag) return [];
  const visibleIds = new Set(visibleClips.map((c) => c.id));
  const extras: Clip[] = [];
  for (const preview of drag.previews) {
    if (preview.trackId !== track.id) continue;
    const clip = sequence.clips[preview.clipId];
    if (!clip || visibleIds.has(clip.id)) continue;
    extras.push({ ...clip, start: preview.start });
  }
  return extras;
}
