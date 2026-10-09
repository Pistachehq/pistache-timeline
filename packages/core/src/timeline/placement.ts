import { getClipEnd } from '../model/queries';
import { type ClipId, type Sequence, type Track } from '../model/types';

export interface FrameRange {
  /** Inclusive start frame. */
  readonly start: number;
  /** Exclusive end frame. */
  readonly end: number;
}

export function rangesOverlap(a: FrameRange, b: FrameRange): boolean {
  return a.start < b.end && b.start < a.end;
}

function occupiedRanges(sequence: Sequence, track: Track, excludeClipId?: ClipId): FrameRange[] {
  const ranges: FrameRange[] = [];
  for (const id of track.clipIds) {
    if (id === excludeClipId) continue;
    const clip = sequence.clips[id];
    if (clip) ranges.push({ start: clip.start, end: getClipEnd(clip) });
  }
  return ranges;
}

/** Whether `[start, start + duration)` is free of other clips on the track. */
export function isRangeFree(
  sequence: Sequence,
  track: Track,
  start: number,
  duration: number,
  excludeClipId?: ClipId,
): boolean {
  const candidate = { start, end: start + duration };
  return occupiedRanges(sequence, track, excludeClipId).every((range) => !rangesOverlap(range, candidate));
}

/**
 * Finds the start frame closest to `desiredStart` where a clip of `duration`
 * frames fits on the track without overlapping other clips. Always succeeds,
 * because the space after the last clip is unbounded.
 */
export function findNearestFreeStart(
  sequence: Sequence,
  track: Track,
  desiredStart: number,
  duration: number,
  excludeClipId?: ClipId,
): number {
  const desired = Math.max(0, Math.round(desiredStart));
  const ranges = occupiedRanges(sequence, track, excludeClipId);
  let best = Number.POSITIVE_INFINITY;
  let gapStart = 0;
  const consider = (from: number, to: number) => {
    if (to - from < duration) return;
    const candidate = Math.min(Math.max(desired, from), to - duration);
    if (Math.abs(candidate - desired) < Math.abs(best - desired)) best = candidate;
  };
  for (const range of ranges) {
    consider(gapStart, range.start);
    gapStart = Math.max(gapStart, range.end);
  }
  consider(gapStart, Number.POSITIVE_INFINITY);
  return best;
}

export interface SnapTargetOptions {
  readonly excludeClipIds?: readonly ClipId[];
  readonly playhead?: number;
  readonly includeSequenceStart?: boolean;
}

/** Sequence frames that clip edges and the playhead can snap to. */
export function collectSnapTargets(sequence: Sequence, options: SnapTargetOptions = {}): number[] {
  const targets = new Set<number>();
  if (options.includeSequenceStart !== false) targets.add(0);
  if (options.playhead !== undefined && options.playhead >= 0) targets.add(options.playhead);
  const exclude = new Set(options.excludeClipIds ?? []);
  for (const clip of Object.values(sequence.clips)) {
    if (exclude.has(clip.id)) continue;
    targets.add(clip.start);
    targets.add(getClipEnd(clip));
  }
  return [...targets].sort((a, b) => a - b);
}

export interface SnapResult {
  readonly frame: number;
  readonly guides: readonly number[];
}

function pickSnap(
  candidates: readonly { frame: number; target: number; distance: number }[],
  threshold: number,
  fallback: number,
): SnapResult {
  let best = fallback;
  let bestDist = threshold + 1;
  let guides: number[] = [];
  for (const { frame, target, distance } of candidates) {
    if (distance > threshold) continue;
    if (distance < bestDist) {
      bestDist = distance;
      best = frame;
      guides = [target];
    } else if (distance === bestDist && !guides.includes(target)) {
      guides.push(target);
    }
  }
  return { frame: Math.max(0, best), guides: bestDist <= threshold ? guides : [] };
}

/** Snaps a single frame (razor, playhead scrub…). */
export function snapFrame(frame: number, targets: readonly number[], threshold: number): SnapResult {
  if (threshold <= 0 || targets.length === 0) return { frame, guides: [] };
  const candidates = targets.map((target) => ({
    frame: target,
    target,
    distance: Math.abs(frame - target),
  }));
  return pickSnap(candidates, threshold, frame);
}

/** Snaps clip start so either the in or out point aligns with a target. */
export function snapClipStart(
  start: number,
  duration: number,
  targets: readonly number[],
  threshold: number,
): SnapResult {
  if (threshold <= 0 || targets.length === 0) return { frame: start, guides: [] };
  const candidates: { frame: number; target: number; distance: number }[] = [];
  for (const target of targets) {
    candidates.push({ frame: target, target, distance: Math.abs(start - target) });
    candidates.push({
      frame: target - duration,
      target,
      distance: Math.abs(start + duration - target),
    });
  }
  return pickSnap(candidates, threshold, start);
}
