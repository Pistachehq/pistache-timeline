import { APP_VERSION } from '@timeline/shared';
import { Button, Dialog, Kbd, TimelineLogo } from '@timeline/ui';
import { commandLabel, DEFAULT_KEYMAP, getCommand, type CommandId } from '../../commands/commands';
import { formatChord } from '../../commands/keymap';
import { useRuntime } from '../../runtime/context';

/** Every bound command, in keymap order, so new shortcuts show up here. */
const LISTED = Object.keys(DEFAULT_KEYMAP) as CommandId[];

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const runtime = useRuntime();
  return (
    <Dialog open title="About Timeline" onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
      <div className="mb-3 flex items-center gap-3">
        <TimelineLogo className="size-10" />
        <div>
          <p className="text-base font-semibold text-fg">Timeline {APP_VERSION}</p>
          <p className="text-xs">Open-source nonlinear video editor · {runtime.platform.label}</p>
        </div>
      </div>
      <p className="mb-3 text-xs">
        Timeline is an independent, community-developed project inspired by professional nonlinear editing workflows.
        It is not affiliated with any commercial video editing vendor. Released under the MIT License.
      </p>
      <h3 className="mb-1 text-xs font-semibold text-fg">Keyboard shortcuts</h3>
      <ul className="grid max-h-72 grid-cols-1 gap-y-0.5 overflow-y-auto text-xs">
        {LISTED.map((id) => (
          <li key={id} className="flex justify-between">
            <span>{commandLabel(getCommand(id), runtime)}</span>
            <span className="flex gap-1">
              {(DEFAULT_KEYMAP[id] ?? []).map((chord) => (
                <Kbd key={chord}>{formatChord(chord)}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
