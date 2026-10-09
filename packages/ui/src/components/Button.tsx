import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  default:
    'bg-surface-3 text-fg border-line-strong hover:bg-surface-4 active:bg-surface-5 disabled:hover:bg-surface-3',
  primary:
    'bg-accent text-accent-fg border-transparent hover:bg-accent-hover disabled:hover:bg-accent',
  ghost:
    'bg-transparent text-fg-muted border-transparent hover:bg-surface-3 hover:text-fg disabled:hover:bg-transparent',
  danger:
    'bg-danger/90 text-white border-transparent hover:bg-danger disabled:hover:bg-danger/90',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-6 px-2 text-xs gap-1.5',
  md: 'h-7 px-3 text-sm gap-2',
};

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-sm border font-medium whitespace-nowrap',
        'transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
