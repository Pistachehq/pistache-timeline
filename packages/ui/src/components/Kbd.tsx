import { type ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-xs border border-line-strong bg-surface-3 px-1 font-mono text-2xs text-fg-muted">
      {children}
    </kbd>
  );
}
