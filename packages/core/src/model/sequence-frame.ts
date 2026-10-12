import { DEFAULT_SEQUENCE_SETTINGS } from './defaults';
import { type Resolution, type Sequence } from './types';

export const FRAME_MIN_DIMENSION = 16;
export const FRAME_MAX_DIMENSION = 7680;

/** True when width/height are close enough that fitting one in the other adds no bars. */
export function frameAspectsMatch(a: Resolution, b: Resolution): boolean {
  if (a.height <= 0 || b.height <= 0) return false;
  const ratio = a.width / a.height / (b.width / b.height);
  return Math.abs(ratio - 1) <= 0.02;
}

/** Even pixel size that keeps the media aspect and stays inside the encoder limits. */
export function frameSizeForMedia(width: number, height: number): Resolution | null {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  const longEdge = Math.max(width, height);
  const scale = longEdge > FRAME_MAX_DIMENSION ? FRAME_MAX_DIMENSION / longEdge : 1;
  return {
    width: snapFrameDimension(width * scale),
    height: snapFrameDimension(height * scale),
  };
}

/**
 * Frame to give an untouched 16:9 sequence when its first picture is a different shape.
 * Returns null when the sequence should stay as it is.
 */
export function resolutionForEmptySequence(sequence: Sequence, media: Resolution | null): Resolution | null {
  if (!media) return null;
  const defaults = DEFAULT_SEQUENCE_SETTINGS.resolution;
  if (sequence.resolution.width !== defaults.width || sequence.resolution.height !== defaults.height) return null;
  if (sequence.videoTracks.some((track) => track.clipIds.length > 0)) return null;
  if (frameAspectsMatch(sequence.resolution, media)) return null;
  const fitted = frameSizeForMedia(media.width, media.height);
  if (!fitted || frameAspectsMatch(sequence.resolution, fitted)) return null;
  return fitted;
}

export function snapFrameDimension(value: number): number {
  if (!Number.isFinite(value)) return FRAME_MIN_DIMENSION;
  const even = Math.round(value / 2) * 2;
  return Math.min(FRAME_MAX_DIMENSION, Math.max(FRAME_MIN_DIMENSION, even));
}
