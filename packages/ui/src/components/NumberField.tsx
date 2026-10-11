import { type KeyboardEvent, type PointerEvent, useId, useRef, useState } from 'react';
import { cn } from '../cn';

export interface NumberFieldProps {
  label: string;
  value: number;
  /** Called with every new value (while scrubbing and on typed commits). */
  onChange: (value: number) => void;
  /** Called when a scrub gesture starts, e.g. to open an undo transaction. */
  onScrubStart?: () => void;
  /** Called when a scrub gesture ends. */
  onScrubEnd?: () => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  unit?: string;
  disabled?: boolean;
  className?: string;
  /** Hides the text label and uses a narrower value. The label is still the accessible name. */
  compact?: boolean;
}

const DRAG_THRESHOLD_PX = 3;

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Compact numeric control: drag horizontally to scrub, click to type, use the
 * arrow keys to step (Shift = ×10).
 */
export function NumberField({
  label,
  value,
  onChange,
  onScrubStart,
  onScrubEnd,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  precision = 1,
  unit,
  disabled = false,
  className,
  compact = false,
}: NumberFieldProps) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const gesture = useRef<{ startX: number; startValue: number; scrubbing: boolean } | null>(null);

  const round = (n: number) => Number(clampValue(n, min, max).toFixed(precision));
  const formatted = value.toFixed(precision);

  const startEditing = () => {
    if (disabled) return;
    setDraft(formatted);
    setEditing(true);
  };

  const commitDraft = () => {
    const parsed = Number(draft.replace(',', '.'));
    if (Number.isFinite(parsed)) onChange(round(parsed));
    setEditing(false);
  };

  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { startX: event.clientX, startValue: value, scrubbing: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = event.clientX - g.startX;
    if (!g.scrubbing) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      g.scrubbing = true;
      onScrubStart?.();
    }
    const multiplier = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
    onChange(round(g.startValue + dx * step * multiplier));
  };

  const onPointerUp = (event: PointerEvent<HTMLSpanElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!g) return;
    if (g.scrubbing) onScrubEnd?.();
    else startEditing();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      startEditing();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? 1 : -1;
      onChange(round(value + direction * step * (event.shiftKey ? 10 : 1)));
    }
  };

  return (
    <div className={cn('flex h-6 items-center gap-1', compact ? 'w-[4.5rem] shrink-0' : 'gap-2', className)}>
      {compact ? null : (
        <label htmlFor={id} className={cn('min-w-0 flex-1 truncate text-xs', disabled ? 'text-fg-disabled' : 'text-fg-muted')}>
          {label}
        </label>
      )}
      {editing ? (
        <input
          id={id}
          autoFocus
          inputMode="decimal"
          className="h-5 w-20 rounded-xs border border-accent bg-surface-1 px-1 text-right font-mono text-xs text-fg outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDraft();
            if (e.key === 'Escape') setEditing(false);
            e.stopPropagation();
          }}
        />
      ) : (
        <span
          id={id}
          role="spinbutton"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-valuenow={value}
          aria-valuemin={Number.isFinite(min) ? min : undefined}
          aria-valuemax={Number.isFinite(max) ? max : undefined}
          aria-disabled={disabled}
          className={cn(
            'cursor-ew-resize rounded-xs px-1 text-right font-mono tabular-nums',
            compact ? 'w-14 text-2xs' : 'w-20 text-xs',
            disabled ? 'cursor-not-allowed text-fg-disabled' : 'text-accent hover:bg-surface-3',
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          {formatted}
          {unit ? <span className="ml-0.5 text-fg-subtle">{unit}</span> : null}
        </span>
      )}
    </div>
  );
}
