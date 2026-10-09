import { formatDisplayTime, type FrameRate } from '@timeline/core';
import { useCallback } from 'react';
import { useUiState } from '../runtime/context';
import { type TimeDisplayFormat } from '../state/ui-store';

export function useTimeDisplayFormat(): TimeDisplayFormat {
  return useUiState((s) => s.timeDisplayFormat);
}

/** Formats frames using the workspace time display preference. */
export function useFormatDisplayTime(): (frame: number, rate: FrameRate) => string {
  const format = useTimeDisplayFormat();
  return useCallback((frame, rate) => formatDisplayTime(frame, rate, format), [format]);
}

export function displayTimePlaceholder(format: TimeDisplayFormat): string {
  return format === 'frames' ? '—' : '--:--:--:--';
}
