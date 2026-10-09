import { type InputHTMLAttributes } from 'react';
import { cn } from '../cn';

export interface ScrubberProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
}

/**
 * Monitor / transport scrubber with a track and thumb sized to stay visible
 * inside panels that use overflow clipping.
 */
export function Scrubber({ label, value, onValueChange, className, ...props }: ScrubberProps) {
  return (
    <div className="scrubber-row shrink-0 border-t border-line bg-surface-1 px-[5px] py-1">
      <input
        type="range"
        aria-label={label}
        title={label}
        value={value}
        onChange={(event) => onValueChange(Number(event.target.value))}
        className={cn('scrubber-input', className)}
        {...props}
      />
    </div>
  );
}
