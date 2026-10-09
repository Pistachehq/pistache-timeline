import { Button, Dialog } from '@timeline/ui';
import { useEffect, useRef, useState } from 'react';
import { type PromptRequest } from '../../state/ui-store';

export function PromptDialog({ request }: { readonly request: PromptRequest }) {
  const [value, setValue] = useState(request.defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    request.resolve(trimmed ? trimmed : null);
  };

  return (
    <Dialog
      open
      title={request.title}
      onClose={() => request.resolve(null)}
      footer={
        <>
          <Button onClick={() => request.resolve(null)}>Cancel</Button>
          <Button autoFocus onClick={submit}>
            {request.confirmLabel}
          </Button>
        </>
      }
    >
      {request.message ? <p className="mb-3 text-sm text-fg-muted">{request.message}</p> : null}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
        className="w-full rounded-sm border border-line bg-surface-1 px-2.5 py-1.5 text-sm text-fg outline-none focus:border-accent"
      />
    </Dialog>
  );
}
