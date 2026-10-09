import { timecodeBase, type FrameRate, type TimeDisplayFormat } from '@timeline/core';
import { RULER_HEIGHT } from './layout';

/** True when the pointer is over the timeline time ruler (wheel scrubs the playhead). */
export function wheelShouldScrubPlayhead(scroller: HTMLElement, clientY: number): boolean {
  const rect = scroller.getBoundingClientRect();
  const localY = clientY - rect.top;
  return localY >= 0 && localY <= RULER_HEIGHT;
}

function wheelTicks(deltaY: number, deltaMode: number): number {
  if (deltaY === 0) return 0;
  if (deltaMode === 1) return Math.max(1, Math.round(Math.abs(deltaY)));
  if (deltaMode === 2) return Math.max(1, Math.round(Math.abs(deltaY) * 3));
  return Math.max(1, Math.round(Math.abs(deltaY) / 48));
}

/** Playhead delta in frames from one wheel event (0 = no movement). */
export function playheadStepFromWheel(
  deltaY: number,
  deltaMode: number,
  format: TimeDisplayFormat,
  frameRate: FrameRate,
  altKey: boolean,
): number {
  const ticks = wheelTicks(deltaY, deltaMode);
  if (ticks === 0) return 0;
  const direction = deltaY > 0 ? 1 : -1;

  if (format === 'frames') {
    return direction * ticks;
  }
  // Timecode: one frame (FF) per tick; Alt steps one second (SS).
  const unit = altKey ? timecodeBase(frameRate) : 1;
  return direction * ticks * unit;
}
