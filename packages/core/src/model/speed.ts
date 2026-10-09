import { type Clip } from './types';

/** Playback speed is a percent. 100 leaves the clip unchanged. */
export const CLIP_SPEED_LIMITS = { min: 10, max: 1000 } as const;

export function clipSpeedPercent(speed: number): number {
  if (!Number.isFinite(speed)) return 100;
  return Math.min(CLIP_SPEED_LIMITS.max, Math.max(CLIP_SPEED_LIMITS.min, speed));
}

/** How many timeline frames a source range occupies at `speed` percent. */
export function timelineFrameCount(sourceFrames: number, speed: number): number {
  const frames = Math.max(0, Math.round(sourceFrames));
  if (frames <= 0) return 0;
  return Math.max(1, Math.round((frames * 100) / clipSpeedPercent(speed)));
}

/** Source frames consumed by a span of timeline frames at `speed` percent. */
export function sourceFramesForTimeline(timelineFrames: number, speed: number): number {
  return Math.round(timelineFrames * (clipSpeedPercent(speed) / 100));
}

/**
 * Source frame for a sequence frame. The clip's timeline length already
 * matches the speed, so frames inside the clip cover the whole source range.
 */
export function sourceMediaFrame(clip: Clip, sequenceFrame: number): number {
  const local = Math.max(0, sequenceFrame - clip.start);
  const raw = clip.sourceIn + local * (clipSpeedPercent(clip.speed) / 100);
  const last = Math.max(clip.sourceIn, clip.sourceOut - 1);
  return Math.min(last, raw);
}

/** HTMLMediaElement.playbackRate that matches {@link sourceMediaFrame}. */
export function playbackRateForSpeed(speed: number): number {
  return clipSpeedPercent(speed) / 100;
}
