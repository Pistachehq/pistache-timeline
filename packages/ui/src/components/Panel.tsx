import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';

export interface PanelFrameProps extends HTMLAttributes<HTMLElement> {
  title: string;
  /** Controls rendered on the right side of the header. */
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}

/** A titled workspace panel (Project, Source, Program, Timeline…). */
export function PanelFrame({ title, actions, children, className, bodyClassName, ...props }: PanelFrameProps) {
  return (
    <section
      aria-label={title}
      className={cn('flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-sm bg-surface-1', className)}
      {...props}
    >
      <header className="flex h-7 shrink-0 items-center gap-2 border-b border-line bg-surface-2 pr-1 pl-2.5">
        <h2 className="flex-1 truncate text-xs font-semibold tracking-wide text-fg-muted">{title}</h2>
        {actions ? <div className="flex items-center gap-0.5">{actions}</div> : null}
      </header>
      <div className={cn('relative flex min-h-0 flex-1 flex-col', bodyClassName)}>{children}</div>
    </section>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex h-full flex-col items-center justify-center gap-2 p-4 text-center', className)}>
      {icon ? <div className="text-fg-subtle [&_svg]:size-6">{icon}</div> : null}
      <p className="text-sm font-medium text-fg-muted">{title}</p>
      {description ? <p className="max-w-[260px] text-xs text-fg-subtle">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
