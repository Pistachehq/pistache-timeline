import { clamp } from '@timeline/shared';
import { type FrameRate } from '../time/rational';
import { timecodeBase } from '../time/timecode';
import { type FrameRange } from './placement';

/*
 * Pure timeline geometry. The UI stores zoom as pixels per frame and converts
 * between frames and pixels only through these helpers.
 */

export const MIN_PIXELS_PER_FRAME = 0.005;
export const MAX_PIXELS_PER_FRAME = 32;

export function clampZoom(pixelsPerFrame: number): number {
  return clamp(pixelsPerFrame, MIN_PIXELS_PER_FRAME, MAX_PIXELS_PER_FRAME);
}

export function frameToPixel(frame: number, pixelsPerFrame: number): number {
  return frame * pixelsPerFrame;
}

/** Converts a horizontal content offset to the nearest frame (never negative). */
export function pixelToFrame(x: number, pixelsPerFrame: number): number {
  return Math.max(0, Math.round(x / pixelsPerFrame));
}

/** Frames intersecting the visible viewport plus an overscan margin. */
export function getVisibleFrameRange(
  scrollLeft: number,
  viewportWidth: number,
  pixelsPerFrame: number,
  overscanPx = 200,
): FrameRange {
  return {
    start: Math.max(0, Math.floor((scrollLeft - overscanPx) / pixelsPerFrame)),
    end: Math.ceil((scrollLeft + viewportWidth + overscanPx) / pixelsPerFrame),
  };
}

export interface ZoomAnchorResult {
  readonly pixelsPerFrame: number;
  readonly scrollLeft: number;
}

/** Zooms while keeping the frame under `anchorX` (viewport-relative) fixed. */
export function zoomAroundAnchor(
  pixelsPerFrame: number,
  scrollLeft: number,
  anchorX: number,
  factor: number,
): ZoomAnchorResult {
  const next = clampZoom(pixelsPerFrame * factor);
  const anchorFrame = (scrollLeft + anchorX) / pixelsPerFrame;
  return { pixelsPerFrame: next, scrollLeft: Math.max(0, anchorFrame * next - anchorX) };
}

/** Zoom level that fits `durationFrames` into `viewportWidth` pixels. */
export function fitZoom(durationFrames: number, viewportWidth: number): number {
  if (durationFrames <= 0 || viewportWidth <= 0) return clampZoom(1);
  return clampZoom((viewportWidth * 0.95) / durationFrames);
}

export interface RulerTick {
  readonly frame: number;
  readonly major: boolean;
}

export interface RulerLayout {
  readonly majorStep: number;
  readonly minorStep: number;
  readonly ticks: readonly RulerTick[];
}

const MIN_MAJOR_SPACING_PX = 90;
const MIN_MINOR_SPACING_PX = 9;

function stepCandidates(rate: FrameRate): number[] {
  const fps = timecodeBase(rate);
  const frameSteps = [1, 2, 5, 10].filter((step) => step < fps);
  const secondSteps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].map((s) => s * fps);
  return [...frameSteps, ...secondSteps];
}

/** Chooses tick spacing for the ruler and lists ticks within `range`. */
export function computeRulerLayout(pixelsPerFrame: number, rate: FrameRate, range: FrameRange): RulerLayout {
  const candidates = stepCandidates(rate);
  const last = candidates[candidates.length - 1] ?? 1;
  const majorStep =
    candidates.find((step) => step * pixelsPerFrame >= MIN_MAJOR_SPACING_PX) ?? last;
  const minorStep =
    [...candidates]
      .reverse()
      .find((step) => step < majorStep && majorStep % step === 0 && step * pixelsPerFrame >= MIN_MINOR_SPACING_PX) ??
    majorStep;

  const ticks: RulerTick[] = [];
  const first = Math.floor(range.start / minorStep) * minorStep;
  for (let frame = first; frame <= range.end; frame += minorStep) {
    ticks.push({ frame, major: frame % majorStep === 0 });
  }
  return { majorStep, minorStep, ticks };
}
