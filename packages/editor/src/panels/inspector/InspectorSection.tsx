import { type ReactNode } from 'react';

export function InspectorSection({
  title,
  children,
  note,
}: {
  title: string;
  children: ReactNode;
  note?: string | undefined;
}) {
  return (
    <section className="border-b border-line px-3 py-2">
      <h3 className="mb-1 flex items-center justify-between text-2xs font-semibold tracking-wider text-fg-subtle uppercase">
        {title}
        {note ? <span className="font-normal tracking-normal normal-case">{note}</span> : null}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

export function InfoRow({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="flex h-5 items-center justify-between gap-3 text-xs">
      <span className="shrink-0 text-fg-muted">{label}</span>
      <span className="truncate text-right text-fg" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}
