import { isPositiveInteger } from '@timeline/shared';

/**
 * A frame rate expressed as an exact ratio, e.g. 30000/1001 for 29.97 fps.
 * Floating point frame rates are never stored.
 */
export interface FrameRate {
  readonly numerator: number;
  readonly denominator: number;
}

export const FrameRates = {
  fps23_976: { numerator: 24000, denominator: 1001 },
  fps24: { numerator: 24, denominator: 1 },
  fps25: { numerator: 25, denominator: 1 },
  fps29_97: { numerator: 30000, denominator: 1001 },
  fps30: { numerator: 30, denominator: 1 },
  fps50: { numerator: 50, denominator: 1 },
  fps59_94: { numerator: 60000, denominator: 1001 },
  fps60: { numerator: 60, denominator: 1 },
} as const satisfies Record<string, FrameRate>;

/**
 * An exact media duration or timestamp: `value / timescale` seconds.
 * Used for source media whose native timebase differs from the sequence.
 */
export interface MediaTime {
  readonly value: number;
  readonly timescale: number;
}

export const MICROSECOND_TIMESCALE = 1_000_000;

/** Tolerance that absorbs floating point noise before rounding to frames. */
const EPSILON = 1e-9;

export type Rounding = 'floor' | 'round' | 'ceil';

function roundWith(value: number, rounding: Rounding): number {
  switch (rounding) {
    case 'floor':
      return Math.floor(value + EPSILON);
    case 'ceil':
      return Math.ceil(value - EPSILON);
    case 'round':
      return Math.round(value);
  }
}

export function isValidFrameRate(rate: FrameRate): boolean {
  return isPositiveInteger(rate.numerator) && isPositiveInteger(rate.denominator);
}

export function frameRateToNumber(rate: FrameRate): number {
  return rate.numerator / rate.denominator;
}

export function frameRatesEqual(a: FrameRate, b: FrameRate): boolean {
  return a.numerator * b.denominator === b.numerator * a.denominator;
}

export function formatFrameRate(rate: FrameRate): string {
  const value = frameRateToNumber(rate);
  return Number.isInteger(value) ? `${value} fps` : `${value.toFixed(3).replace(/0+$/, '')} fps`;
}

/** Converts a whole frame count to seconds. */
export function framesToSeconds(frames: number, rate: FrameRate): number {
  return (frames * rate.denominator) / rate.numerator;
}

/** Converts seconds to a whole frame count using the given rounding mode. */
export function secondsToFrames(seconds: number, rate: FrameRate, rounding: Rounding = 'round'): number {
  return roundWith((seconds * rate.numerator) / rate.denominator, rounding);
}

export function mediaTimeFromSeconds(seconds: number, timescale = MICROSECOND_TIMESCALE): MediaTime {
  return { value: Math.round(seconds * timescale), timescale };
}

export function mediaTimeToSeconds(time: MediaTime): number {
  return time.value / time.timescale;
}

/** Converts a media time to frames of the given rate without intermediate seconds. */
export function mediaTimeToFrames(time: MediaTime, rate: FrameRate, rounding: Rounding = 'floor'): number {
  return roundWith(
    (time.value * rate.numerator) / (time.timescale * rate.denominator),
    rounding,
  );
}

/**
 * Picks a supported preset when the probed rate is close to a common one
 * (e.g. 29.97002997 → 30000/1001). Returns `null` for unusable input.
 */
export function frameRateFromNumber(fps: number): FrameRate | null {
  if (!Number.isFinite(fps) || fps <= 0) return null;
  for (const preset of Object.values(FrameRates)) {
    if (Math.abs(frameRateToNumber(preset) - fps) < 0.01) return preset;
  }
  return { numerator: Math.round(fps * 1000), denominator: 1000 };
}
