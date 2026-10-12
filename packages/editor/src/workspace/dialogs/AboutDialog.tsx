import { APP_VERSION } from '@timeline/shared';
import { Button, Dialog, TimelineLogo } from '@timeline/ui';
import { useRuntime } from '../../runtime/context';

const CREDITS: readonly { readonly role: string; readonly name: string }[] = [
  { role: 'Developed by', name: 'Alexis Aguirre Alanís' },
  { role: 'Tested by', name: 'Dana Elizabeth Torres Estrada' },
];

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const runtime = useRuntime();
  return (
    <Dialog
      open
      title="About Timeline"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              onClose();
              runtime.stores.ui.getState().openDialog({ kind: 'guide' });
            }}
          >
            Open Guide
          </Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <TimelineLogo className="size-12" />
        <div className="min-w-0">
          <p className="text-base font-semibold text-fg">Timeline</p>
          <p className="text-xs">
            Version {APP_VERSION} · {runtime.platform.label}
          </p>
          <p className="text-xs text-fg-subtle">Open-source nonlinear video editor</p>
        </div>
      </div>

      <section className="mt-4 rounded-md border border-line bg-surface-1 px-3 py-2.5">
        <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Credits</h3>
        <dl className="space-y-1.5">
          {CREDITS.map((credit) => (
            <div key={credit.role} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-xs text-fg-muted">{credit.role}</dt>
              <dd className="min-w-0 truncate text-right text-xs font-medium text-fg">{credit.name}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-4 text-xs leading-relaxed">
        Timeline is an independent, community-developed project inspired by professional nonlinear editing workflows.
        It is not affiliated with any commercial video editing vendor. Released under the MIT License.
      </p>
      <p className="mt-2 text-2xs text-fg-subtle">© {new Date().getFullYear()} Alexis Aguirre Alanís and contributors.</p>
    </Dialog>
  );
}
