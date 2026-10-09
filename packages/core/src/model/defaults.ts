import { FrameRates, type FrameRate } from '../time/rational';
import { type ClipAudio, type ClipTransform, type Resolution } from './types';

/** Version of the persisted project schema produced by this build. */
export const CURRENT_SCHEMA_VERSION = 1;

export const DEFAULT_PROJECT_NAME = 'Untitled Project';

export const DEFAULT_SEQUENCE_SETTINGS = {
  name: 'Sequence 01',
  resolution: { width: 1920, height: 1080 } satisfies Resolution,
  frameRate: FrameRates.fps30 satisfies FrameRate,
  videoTrackCount: 3,
  audioTrackCount: 3,
} as const;

export const DEFAULT_CLIP_TRANSFORM: ClipTransform = {
  positionX: 0,
  positionY: 0,
  scaleX: 100,
  scaleY: 100,
  uniformScale: true,
  rotation: 0,
  opacity: 100,
};

export const DEFAULT_CLIP_AUDIO: ClipAudio = {
  volume: 100,
  muted: false,
  pan: 0,
};

/** Default timeline length when an image is imported (seconds). */
export const DEFAULT_STILL_IMAGE_DURATION_SECONDS = 5;

/** Max timeline length for a still image when trimming the clip end (seconds). */
export const MAX_STILL_IMAGE_TIMELINE_SECONDS = 24 * 3600;

export const TRANSFORM_LIMITS = {
  position: { min: -100_000, max: 100_000 },
  scale: { min: 0, max: 10_000 },
  rotation: { min: -36_000, max: 36_000 },
  opacity: { min: 0, max: 100 },
} as const;

/** Clip/track volume at 0% maps here for display (−∞ is shown as this floor). */
export const AUDIO_DB_FLOOR = -60;

export const AUDIO_LIMITS = {
  volume: { min: 0 },
  pan: { min: -100, max: 100 },
  gainDb: { min: AUDIO_DB_FLOOR },
} as const;
