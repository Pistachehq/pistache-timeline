import { getClipEnd, getMaxClipSourceOutFrames, type Clip, type Project, type Sequence } from '@timeline/core';
import { type ClipTrimPreview } from '../../state/ui-store';

const MIN_DURATION = 1;

export function clampTrimFrame(
  clip: Clip,
  edge: 'start' | 'end',
  frame: number,
  maxSourceOutFrames: number,
): number {
  const end = getClipEnd(clip);
  if (edge === 'start') {
    const minStart = Math.max(0, clip.start - clip.sourceIn);
    const maxStart = end - MIN_DURATION;
    return Math.round(Math.min(maxStart, Math.max(minStart, frame)));
  }
  const minEnd = clip.start + MIN_DURATION;
  const maxEnd = clip.start + (maxSourceOutFrames - clip.sourceIn);
  return Math.round(Math.max(minEnd, Math.min(maxEnd, frame)));
}

export function buildTrimPreview(
  clip: Clip,
  edge: 'start' | 'end',
  frame: number,
  maxSourceOutFrames: number,
): ClipTrimPreview {
  const clamped = clampTrimFrame(clip, edge, frame, maxSourceOutFrames);
  if (edge === 'start') {
    const delta = clamped - clip.start;
    return {
      clipId: clip.id,
      start: clamped,
      sourceIn: clip.sourceIn + delta,
      sourceOut: clip.sourceOut,
    };
  }
  return {
    clipId: clip.id,
    start: clip.start,
    sourceIn: clip.sourceIn,
    sourceOut: clip.sourceIn + (clamped - clip.start),
  };
}

function maxSourceOutForClip(project: Project, sequence: Sequence, clip: Clip): number {
  const asset = project.mediaAssets[clip.assetId];
  return asset ? getMaxClipSourceOutFrames(asset, sequence) : 0;
}

export function expandTrimPreviews(
  sequence: Sequence,
  project: Project,
  primary: Clip,
  edge: 'start' | 'end',
  frame: number,
): ClipTrimPreview[] {
  const maxSourceOut = maxSourceOutForClip(project, sequence, primary);
  const previews = [buildTrimPreview(primary, edge, frame, maxSourceOut)];
  const partnerId = primary.linkId;
  if (!partnerId) return previews;
  const partner = sequence.clips[partnerId];
  if (!partner) return previews;
  const partnerMaxSourceOut = maxSourceOutForClip(project, sequence, partner);
  previews.push(buildTrimPreview(partner, edge, frame, partnerMaxSourceOut));
  return previews;
}

export function trimChanged(previews: readonly ClipTrimPreview[], sequence: Sequence): boolean {
  for (const preview of previews) {
    const clip = sequence.clips[preview.clipId];
    if (!clip) continue;
    if (preview.start !== clip.start || preview.sourceIn !== clip.sourceIn || preview.sourceOut !== clip.sourceOut) {
      return true;
    }
  }
  return false;
}

export function sequenceEndFrame(preview: ClipTrimPreview): number {
  return Math.round(preview.start + (preview.sourceOut - preview.sourceIn));
}
