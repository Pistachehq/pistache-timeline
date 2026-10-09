import { FrameRates } from '@timeline/core';
import { describe, expect, it } from 'vitest';
import { playheadStepFromWheel } from './timeline-wheel-playhead';

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
