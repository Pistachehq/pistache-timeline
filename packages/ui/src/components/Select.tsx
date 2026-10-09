import { type SelectHTMLAttributes } from 'react';
import { cn } from '../cn';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string>
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> {
  value: T;
  options: readonly SelectOption<T>[];
  onValueChange: (value: T) => void;
  label: string;
}

export function Select<T extends string>({
  value,
  options,
  onValueChange,
  label,
  className,
  ...props
}: SelectProps<T>) {
  return (
    <select
      aria-label={label}
      title={label}
      value={value}
      onChange={(event) => onValueChange(event.target.value as T)}
      className={cn(
        'h-6 rounded-sm border border-line-strong bg-surface-3 px-1.5 text-xs text-fg-muted',
        'hover:text-fg focus-visible:outline-accent disabled:opacity-45',
        className,
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
