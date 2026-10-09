import { formatDisplayTime, parseTimecode, TRANSITION_LIMITS, type FrameRate } from '@timeline/core';
import { NumberField } from '@timeline/ui';
import { useCallback, useId, useState, type KeyboardEvent } from 'react';
import { useTimeDisplayFormat } from '../../hooks/use-format-display-time';

/** Transition/effect duration: frames or timecode depending on workspace preference. */
export function TimelineDurationField({
  label,
  frames,
  frameRate,
  disabled,
  onChange,
  onScrubStart,
  onScrubEnd,
}: {
  readonly label: string;
  readonly frames: number;
  readonly frameRate: FrameRate;
  readonly disabled?: boolean;
  readonly onChange: (frames: number) => void;
  readonly onScrubStart?: () => void;
  readonly onScrubEnd?: () => void;
}) {
  const format = useTimeDisplayFormat();
  const min = TRANSITION_LIMITS.durationFrames.min;
  const max = TRANSITION_LIMITS.durationFrames.max;

  const clampFrames = useCallback(
    (n: number) => Math.round(Math.min(max, Math.max(min, n))),
    [max, min],
  );

  if (format === 'frames') {
    return (
      <NumberField
        label={label}
        value={frames}
        min={min}
        max={max}
        step={1}
        precision={0}
        unit="fr"
        disabled={disabled ?? false}
        {...(onScrubStart ? { onScrubStart } : {})}
        {...(onScrubEnd ? { onScrubEnd } : {})}
        onChange={(value) => onChange(clampFrames(value))}
      />
    );
  }

  return (
    <TimecodeDurationField
      label={label}
      frames={frames}
      frameRate={frameRate}
      disabled={disabled ?? false}
      onChange={(value) => onChange(clampFrames(value))}
    />
  );
}

function TimecodeDurationField({
  label,
  frames,
  frameRate,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly frames: number;
  readonly frameRate: FrameRate;
  readonly disabled: boolean;
  readonly onChange: (frames: number) => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const display = formatDisplayTime(frames, frameRate, 'timecode');

  const commit = () => {
    const parsed = parseTimecode(draft, frameRate);
    if (parsed !== null) onChange(parsed);
    setEditing(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') setEditing(false);
  };

  return (
    <div className="flex h-5 items-center justify-between gap-3 text-xs">
      <label htmlFor={id} className="shrink-0 text-fg-muted">
        {label}
      </label>
      {editing ? (
        <input
          id={id}
          autoFocus
          disabled={disabled}
          className="h-5 w-[7.5rem] rounded-sm border border-line-strong bg-surface-3 px-1 font-mono text-[11px] text-fg outline-none focus-visible:border-accent"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
      ) : (
        <button
          type="button"
          id={id}
          disabled={disabled}
          className="font-mono text-[11px] text-fg tabular-nums hover:text-accent disabled:opacity-45"
          onClick={() => {
            if (disabled) return;
            setDraft(display);
            setEditing(true);
          }}
        >
          {display}
        </button>
      )}
    </div>
  );
}
