import { type InputHTMLAttributes } from 'react';
import { cn } from '../cn';

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
}

export function Slider({ label, value, onValueChange, className, ...props }: SliderProps) {
  return (
    <input
      type="range"
      aria-label={label}
      title={label}
      value={value}
      onChange={(event) => onValueChange(Number(event.target.value))}
      className={cn('h-1 cursor-pointer accent-[var(--color-fg-muted)] disabled:opacity-40', className)}
      {...props}
    />
  );
}
