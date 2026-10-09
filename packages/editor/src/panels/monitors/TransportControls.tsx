import { IconButton } from '@timeline/ui';
import { ChevronFirst, ChevronLast, Pause, Play, StepBack, StepForward } from 'lucide-react';

export interface TransportControlsProps {
  playing: boolean;
  disabled?: boolean;
  onTogglePlay: () => void;
  onStep: (frames: number) => void;
  onGoToStart: () => void;
  onGoToEnd: () => void;
  /** Shortcut hints, shown only for the monitor that owns the global shortcuts. */
  hints?: { play?: string | undefined; stepBack?: string | undefined; stepForward?: string | undefined };
}

export function TransportControls({
  playing,
  disabled = false,
  onTogglePlay,
  onStep,
  onGoToStart,
  onGoToEnd,
  hints,
}: TransportControlsProps) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Transport controls">
      <IconButton label="Go to start" icon={<ChevronFirst />} disabled={disabled} onClick={onGoToStart} />
      <IconButton
        label="Step back one frame"
        shortcut={hints?.stepBack}
        icon={<StepBack />}
        disabled={disabled}
        onClick={() => onStep(-1)}
      />
      <IconButton
        label={playing ? 'Pause' : 'Play'}
        shortcut={hints?.play}
        icon={playing ? <Pause /> : <Play />}
        size="md"
        disabled={disabled}
        onClick={onTogglePlay}
      />
      <IconButton
        label="Step forward one frame"
        shortcut={hints?.stepForward}
        icon={<StepForward />}
        disabled={disabled}
        onClick={() => onStep(1)}
      />
      <IconButton label="Go to end" icon={<ChevronLast />} disabled={disabled} onClick={onGoToEnd} />
    </div>
  );
}
