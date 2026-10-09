import {
  clipStartFloor,
  clipStartTrim,
  clipStartTrimBounds,
  getMaxClipSourceOutFrames,
  isStillImageAsset,
  sourceFramesForTimeline,
  TEXT_CLIP_MAX_SOURCE_FRAMES,
  timelineFrameCount,
  type Clip,
  type Project,
  type Sequence,
} from '@timeline/core';
import { type ClipTrimPreview } from '../../state/ui-store';

const MIN_DURATION = 1;

export function clampTrimFrame(
  clip: Clip,
  edge: 'start' | 'end',
  frame: number,
  maxSourceOutFrames: number,
  extendStart = false,
  startFloor = 0,
): number {
  if (edge === 'start') {
    const bounds = clipStartTrimBounds(clip, maxSourceOutFrames, extendStart);
    const minStart = Math.min(bounds.max, Math.max(bounds.min, startFloor));
    return Math.round(Math.min(bounds.max, Math.max(minStart, frame)));
  }
  const minEnd = clip.start + MIN_DURATION;
  const maxEnd = clip.start + timelineFrameCount(Math.max(0, maxSourceOutFrames - clip.sourceIn), clip.speed);
  return Math.round(Math.max(minEnd, Math.min(maxEnd, frame)));
}

export function buildTrimPreview(
  clip: Clip,
  edge: 'start' | 'end',
  frame: number,
  maxSourceOutFrames: number,
  extendStart = false,
  startFloor = 0,
): ClipTrimPreview {
  const clamped = clampTrimFrame(clip, edge, frame, maxSourceOutFrames, extendStart, startFloor);
  if (edge === 'start') {
    const points = clipStartTrim(clip, clamped, maxSourceOutFrames, extendStart);
    return {
      clipId: clip.id,
      start: points?.start ?? clip.start,
      sourceIn: points?.sourceIn ?? clip.sourceIn,
      sourceOut: points?.sourceOut ?? clip.sourceOut,
    };
  }
  return {
    clipId: clip.id,
    start: clip.start,
    sourceIn: clip.sourceIn,
    sourceOut: Math.min(maxSourceOutFrames, clip.sourceIn + Math.max(1, sourceFramesForTimeline(clamped - clip.start, clip.speed))),
  };
}

function trimMediaLimit(project: Project, sequence: Sequence, clip: Clip): { max: number; extendStart: boolean } {
  if (clip.text) return { max: TEXT_CLIP_MAX_SOURCE_FRAMES, extendStart: false };
  if (!clip.assetId) return { max: 0, extendStart: false };
  const asset = project.mediaAssets[clip.assetId];
  if (!asset) return { max: 0, extendStart: false };
  return { max: getMaxClipSourceOutFrames(asset, sequence), extendStart: isStillImageAsset(asset) };
}

export function expandTrimPreviews(
  sequence: Sequence,
  project: Project,
  primary: Clip,
  edge: 'start' | 'end',
  frame: number,
): ClipTrimPreview[] {
  const primaryLimit = trimMediaLimit(project, sequence, primary);
  const previews = [
    buildTrimPreview(
      primary,
      edge,
      frame,
      primaryLimit.max,
      primaryLimit.extendStart,
      clipStartFloor(sequence, primary),
    ),
  ];
  const partnerId = primary.linkId;
  if (!partnerId) return previews;
  const partner = sequence.clips[partnerId];
  if (!partner) return previews;
  const partnerLimit = trimMediaLimit(project, sequence, partner);
  previews.push(
    buildTrimPreview(
      partner,
      edge,
      frame,
      partnerLimit.max,
      partnerLimit.extendStart,
      clipStartFloor(sequence, partner),
    ),
  );
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

export function sequenceEndFrame(preview: ClipTrimPreview, speed: number): number {
  return preview.start + timelineFrameCount(preview.sourceOut - preview.sourceIn, speed);
}
