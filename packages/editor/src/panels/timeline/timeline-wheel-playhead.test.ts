import { FrameRates } from '@timeline/core';
import { describe, expect, it } from 'vitest';
import { playheadStepFromWheel, wheelShouldScrubPlayhead } from './timeline-wheel-playhead';
import { RULER_HEIGHT } from './layout';

describe('playheadStepFromWheel', () => {
  const rate = FrameRates.fps30;

  it('steps one frame per tick in frames display mode', () => {
    expect(playheadStepFromWheel(120, 0, 'frames', rate, false)).toBe(3);
    expect(playheadStepFromWheel(-120, 0, 'frames', rate, false)).toBe(-3);
  });

  it('steps one frame (FF) per tick in timecode display mode', () => {
    expect(playheadStepFromWheel(48, 0, 'timecode', rate, false)).toBe(1);
    expect(playheadStepFromWheel(-96, 0, 'timecode', rate, false)).toBe(-2);
  });

  it('steps one second (SS) per tick in timecode mode with Alt', () => {
    expect(playheadStepFromWheel(48, 0, 'timecode', rate, true)).toBe(30);
  });
});

describe('wheelShouldScrubPlayhead', () => {
  it('is true only over the ruler band', () => {
    const scroller = {
      getBoundingClientRect: () => ({ top: 100, left: 0, width: 800, height: 400 }) as DOMRect,
    } as HTMLElement;
    expect(wheelShouldScrubPlayhead(scroller, 100)).toBe(true);
    expect(wheelShouldScrubPlayhead(scroller, 100 + RULER_HEIGHT)).toBe(true);
    expect(wheelShouldScrubPlayhead(scroller, 100 + RULER_HEIGHT + 1)).toBe(false);
    expect(wheelShouldScrubPlayhead(scroller, 150)).toBe(false);
  });
});
