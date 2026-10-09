import { formatDisplayTime, type FrameRate } from '@timeline/core';
import { cn } from '@timeline/ui';
import { useTimeDisplayFormat } from '../../hooks/use-format-display-time';
import { usePlaybackState } from '../../runtime/context';

/** Playhead timecode. Isolated so per-frame updates re-render only this text. */
export function PlayheadTimecode({ frameRate, className }: { frameRate: FrameRate; className?: string }) {
  const playhead = usePlaybackState((s) => s.playhead);
  const format = useTimeDisplayFormat();
  return (
    <span className={cn('font-mono text-sm text-accent tabular-nums', className)} data-testid="playhead-timecode">
      {formatDisplayTime(playhead, frameRate, format)}
    </span>
  );
}
