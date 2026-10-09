import { formatDisplayTime, parseTimecode, TRANSITION_LIMITS, type FrameRate } from '@timeline/core';
import { useCallback, useId, useState, type KeyboardEvent } from 'react';
import { useTimeDisplayFormat } from '../../hooks/use-format-display-time';

const FIELD_LABEL = 'truncate text-xs text-fg-muted';
const FIELD_BOX =
  'h-6 w-full min-w-0 rounded-sm border border-line-strong bg-surface-3 px-1.5 text-left font-mono text-xs text-fg tabular-nums outline-none focus-visible:border-accent disabled:opacity-45';

/** Transition/effect duration: frames or timecode depending on workspace preference. */
export function TimelineDurationField({
  label,
  frames,
  frameRate,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly frames: number;
  readonly frameRate: FrameRate;
  readonly disabled?: boolean;
  readonly onChange: (frames: number) => void;
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
      <FramesDurationField
        label={label}
        frames={frames}
        disabled={disabled ?? false}
        min={min}
        max={max}
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

function FramesDurationField({
  label,
  frames,
  disabled,
  min,
  max,
  onChange,
}: {
  readonly label: string;
  readonly frames: number;
  readonly disabled: boolean;
  readonly min: number;
  readonly max: number;
  readonly onChange: (frames: number) => void;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        disabled={disabled}
        min={min}
        max={max}
        step={1}
        value={frames}
        className={`${FIELD_BOX} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </>
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
    <>
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      {editing ? (
        <input
          id={id}
          autoFocus
          disabled={disabled}
          className={FIELD_BOX}
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
          className={FIELD_BOX}
          onClick={() => {
            if (disabled) return;
            setDraft(display);
            setEditing(true);
          }}
        >
          {display}
        </button>
      )}
    </>
  );
}
