import { Button, Dialog } from '@timeline/ui';
import { useRuntime, useUiState } from '../../runtime/context';
import { AboutDialog } from './AboutDialog';
import { ExportDialog } from './ExportDialog';
import { PromptDialog } from './PromptDialog';

/** Renders whichever modal dialog is open in the UI store. */
export function DialogHost() {
  const runtime = useRuntime();
  const dialog = useUiState((s) => s.dialog);
  const close = () => runtime.stores.ui.getState().closeDialog();

  if (dialog?.kind === 'export') return <ExportDialog onClose={close} />;
  if (dialog?.kind === 'about') return <AboutDialog onClose={close} />;
  if (dialog?.kind === 'prompt') return <PromptDialog request={dialog.request} />;
  if (dialog?.kind === 'confirm') {
    const { request } = dialog;
    return (
      <Dialog
        open
        title={request.title}
        onClose={() => request.resolve(false)}
        footer={
          <>
            <Button onClick={() => request.resolve(false)}>Cancel</Button>
            <Button variant="danger" autoFocus onClick={() => request.resolve(true)}>
              {request.confirmLabel}
            </Button>
          </>
        }
      >
        <p>{request.message}</p>
      </Dialog>
    );
  }
  return null;
}
