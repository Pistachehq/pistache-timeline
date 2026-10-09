import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { cn } from '../cn';
import { IconButton } from './IconButton';

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Modal dialog built on the native `<dialog>` element (focus trapping, Escape to close). */
export function Dialog({ open, title, onClose, children, footer, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      className={cn(
        'm-auto w-[420px] max-w-[calc(100vw-32px)] rounded-md border border-line-strong bg-surface-2 p-0 text-fg shadow-popover',
        className,
      )}
    >
      {open ? (
        <div className="flex flex-col">
          <header className="flex h-9 items-center justify-between border-b border-line px-3">
            <h2 id={titleId} className="text-sm font-semibold">
              {title}
            </h2>
            <IconButton label="Close" icon={<X />} onClick={onClose} />
          </header>
          <div className="px-4 py-3 text-sm text-fg-muted">{children}</div>
          {footer ? (
            <footer className="flex justify-end gap-2 border-t border-line px-3 py-2">{footer}</footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
