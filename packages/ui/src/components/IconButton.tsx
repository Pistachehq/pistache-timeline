import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name; also shown as the tooltip. */
  label: string;
  /** Optional shortcut hint appended to the tooltip. */
  shortcut?: string | undefined;
  icon: ReactNode;
  /** Renders a toggle button with `aria-pressed`. */
  pressed?: boolean | undefined;
  size?: 'xs' | 'sm' | 'md';
  tone?: 'default' | 'accent';
}

const SIZES = {
  xs: 'size-5 [&_svg]:size-3',
  sm: 'size-6 [&_svg]:size-3.5',
  md: 'size-7 [&_svg]:size-4',
} as const;

export function IconButton({
  label,
  shortcut,
  icon,
  pressed,
  size = 'sm',
  tone = 'default',
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-sm transition-colors duration-100',
        'text-fg-muted hover:bg-surface-4 hover:text-fg active:bg-surface-5',
        'disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-transparent',
        pressed && (tone === 'accent' ? 'bg-accent-muted text-accent hover:text-accent' : 'bg-surface-4 text-fg'),
        SIZES[size],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
