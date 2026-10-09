import { type Clip, type FrameRate, framesToSeconds, getClipEnd, secondsToFrames } from '@timeline/core';

/**
 * Media time to seek to for a sequence frame inside `clip`. Targets the
 * middle of the frame so decoders do not land on the previous frame due to
 * timestamp rounding.
 */
export function sourceTimeForFrame(clip: Clip, frame: number, rate: FrameRate): number {
  const sourceFrame = clip.sourceIn + (frame - clip.start);
  return framesToSeconds(sourceFrame + 0.5, rate);
}

/** Sequence frame corresponding to the media element's current time. */
export function frameForSourceTime(clip: Clip, seconds: number, rate: FrameRate): number {
  const sourceFrame = secondsToFrames(seconds, rate, 'floor');
  return Math.min(getClipEnd(clip), clip.start + Math.max(0, sourceFrame - clip.sourceIn));
}

/** Accumulates wall-clock time into whole frames for gaps without media. */
export class FrameClock {
  #remainder = 0;

  advance(frame: number, elapsedMs: number, rate: FrameRate): number {
    const exact = (elapsedMs / 1000) * (rate.numerator / rate.denominator) + this.#remainder;
    const whole = Math.floor(exact);
    this.#remainder = exact - whole;
    return frame + whole;
  }

  reset(): void {
    this.#remainder = 0;
  }
}
