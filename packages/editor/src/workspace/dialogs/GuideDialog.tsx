import { APP_VERSION } from '@timeline/shared';
import { Button, cn, Dialog, Kbd } from '@timeline/ui';
import { type ReactNode, useState } from 'react';
import { commandLabel, DEFAULT_KEYMAP, getCommand, type CommandId } from '../../commands/commands';
import { formatChord } from '../../commands/keymap';
import { useRuntime } from '../../runtime/context';

type TopicId = 'start' | 'editing' | 'effects' | 'keying' | 'audio' | 'export' | 'shortcuts';

const TOPICS: readonly { readonly id: TopicId; readonly label: string }[] = [
  { id: 'start', label: 'Getting started' },
  { id: 'editing', label: 'Editing' },
  { id: 'effects', label: 'Effects & transitions' },
  { id: 'keying', label: 'Green screen' },
  { id: 'audio', label: 'Audio' },
  { id: 'export', label: 'Export' },
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
];

const SHORTCUT_GROUPS: readonly { readonly prefix: string; readonly label: string }[] = [
  { prefix: 'file.', label: 'File' },
  { prefix: 'edit.', label: 'Edit' },
  { prefix: 'clip.', label: 'Clip' },
  { prefix: 'tool.', label: 'Tools' },
  { prefix: 'playback.', label: 'Playback' },
  { prefix: 'view.', label: 'View' },
  { prefix: 'help.', label: 'Help' },
];

const BOUND = Object.keys(DEFAULT_KEYMAP) as CommandId[];

const MOUSE_GESTURES: readonly { readonly gesture: string; readonly action: string }[] = [
  { gesture: 'Ctrl + Wheel', action: 'Zoom the timeline around the pointer' },
  { gesture: 'Wheel over the ruler', action: 'Step the playhead one frame' },
  { gesture: 'Alt + Wheel over the ruler', action: 'Step the playhead one second' },
  { gesture: 'Shift / Ctrl + Click', action: 'Add clips to the selection' },
  { gesture: 'Drag on empty timeline', action: 'Marquee select clips' },
];

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold text-fg">{title}</h3>
      <div className="space-y-1.5 text-xs leading-relaxed">{children}</div>
    </section>
  );
}

function Steps({ items }: { readonly items: readonly ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-1 pl-4 marker:text-fg-subtle">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ol>
  );
}

function Tip({ children }: { readonly children: ReactNode }) {
  return (
    <p className="rounded-sm border border-line bg-surface-1 px-2 py-1.5 text-2xs text-fg-muted">
      <span className="font-semibold text-accent">Tip </span>
      {children}
    </p>
  );
}

function ShortcutsTopic() {
  const runtime = useRuntime();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {SHORTCUT_GROUPS.map((group) => {
          const ids = BOUND.filter((id) => id.startsWith(group.prefix));
          if (ids.length === 0) return null;
          return (
            <section key={group.prefix} className="min-w-0">
              <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{group.label}</h3>
              <ul className="space-y-0.5 text-xs">
                {ids.map((id) => (
                  <li key={id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{commandLabel(getCommand(id), runtime)}</span>
                    <span className="flex shrink-0 gap-1">
                      {(DEFAULT_KEYMAP[id] ?? []).map((chord) => (
                        <Kbd key={chord}>{formatChord(chord)}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <section>
        <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Mouse</h3>
        <ul className="space-y-0.5 text-xs">
          {MOUSE_GESTURES.map((item) => (
            <li key={item.gesture} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{item.action}</span>
              <Kbd>{item.gesture}</Kbd>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function TopicBody({ topic }: { readonly topic: TopicId }) {
  switch (topic) {
    case 'start':
      return (
        <div className="space-y-4">
          <Section title="Welcome to Timeline">
            <p>
              Timeline is a nonlinear editor: media lives in the Project panel, you arrange it on the Timeline, and the
              Program monitor shows the result at the playhead.
            </p>
          </Section>
          <Section title="Your first edit">
            <Steps
              items={[
                'Import video, image and audio files with File → Import, or drag them into the Project panel.',
                'Drag a clip onto the Timeline. The first clip sets the sequence size and frame rate.',
                'Press Space to play. Use ← and → to step one frame at a time.',
                'Select a clip to edit its motion, opacity, effects and transitions in the Inspector.',
                'Save the project with Ctrl+S and export the result with File → Export.',
              ]}
            />
          </Section>
          <Tip>Sequence → Sequence Settings changes the frame size, for example to switch between 16:9 and 9:16.</Tip>
        </div>
      );
    case 'editing':
      return (
        <div className="space-y-4">
          <Section title="Tools">
            <p>
              <b className="text-fg">Selection (V)</b> moves and trims clips. Drag a clip edge to trim it.{' '}
              <b className="text-fg">Razor (C)</b> cuts the clip under the pointer. <b className="text-fg">Text (T)</b>{' '}
              adds a title in the Program monitor. <b className="text-fg">Speech (Shift+T)</b> turns text into voice.{' '}
              <b className="text-fg">Hand (H)</b> pans the timeline.
            </p>
          </Section>
          <Section title="Cutting and arranging">
            <Steps
              items={[
                'Ctrl+K splits the selected clips at the playhead, or every clip under it when nothing is selected.',
                'Alt+← and Alt+→ nudge the selected clips one frame.',
                'Shift+E disables a clip without deleting it.',
                '↑ and ↓ jump to the previous and next edit point.',
              ]}
            />
          </Section>
          <Section title="Motion">
            <p>
              Drag the clip in the Program monitor to move it, and drag its handles to scale it. Click the stopwatch next to
              a property in Effect Controls to animate it, then use the diamond button to add a keyframe at the playhead.
            </p>
          </Section>
        </div>
      );
    case 'effects':
      return (
        <div className="space-y-4">
          <Section title="Applying effects">
            <p>
              Open the Effects tab of the Project panel and drag an effect onto a clip on the Timeline. Effects stack: they run top to bottom, and the arrows in the Inspector change their order.
            </p>
          </Section>
          <Section title="Transitions adapt to where you drop them">
            <p>
              Drop a transition on the first half of a clip to apply it to the start, or on the second half to apply it to
              the end. A single <b className="text-fg">Fade</b> fades in or out depending on the edge. The same applies to
              audio transitions and to text animations, which become the entrance or the exit.
            </p>
            <p>
              <b className="text-fg">Cross dissolve</b> on a cut also sets the matching edge of the neighbouring clip, so
              both sides of the cut blend.
            </p>
          </Section>
          <Section title="Adjusting">
            <p>
              Every effect has its own controls in the Inspector. Drag a value to scrub it (Shift is faster, Alt is finer),
              or click it to type a number.
            </p>
          </Section>
        </div>
      );
    case 'keying':
      return (
        <div className="space-y-4">
          <Section title="Remove a green or blue screen (Chroma Key)">
            <Steps
              items={[
                'Put the playhead over the clip and drag Keying → Chroma Key (green or blue screen) onto it. The screen color is detected automatically.',
                'If the result is not clean, click the eyedropper in the Inspector and then click the background in the Program monitor.',
                'Raise Tolerance until the background disappears, then use Edge softness for smooth hair and edges.',
                'Spill suppression removes the green or blue glow on the subject. Choke shrinks the matte edge.',
                'Set View to Alpha matte to check the key: white is kept, black is transparent.',
              ]}
            />
            <Tip>Place a background clip on a lower video track to show through the keyed area.</Tip>
          </Section>
          <Section title="Replace a screen (Screen Replace)">
            <Steps
              items={[
                'Select the replacement image or video in the Project panel.',
                'Drag Keying → Screen Replace onto the clip with the green screen, such as a phone or monitor.',
                'The largest area of the key color is filled with your source and its corners are tracked in every frame.',
                'Use the eyedropper to click a specific screen when there is more than one.',
                'Fit chooses between following the screen in perspective, filling its bounding box, or filling the whole frame.',
              ]}
            />
          </Section>
          <Section title="Luma Key">
            <p>Removes dark areas, or bright ones with the invert option. Useful for fire, smoke and light-leak overlays.</p>
          </Section>
          <Tip>Keying effects can be combined, for example Screen Replace on a phone plus Chroma Key on the background.</Tip>
        </div>
      );
    case 'audio':
      return (
        <div className="space-y-4">
          <Section title="Audio effects">
            <p>
              Parametric EQ, high-pass, low-pass, compressor, noise gate, limiter, delay, reverb and pitch are heard live
              and are included in the export, with the same settings.
            </p>
            <p>
              A typical voice chain is Noise gate → High-pass at 80 Hz → Compressor → Limiter. The noise gate always runs
              first.
            </p>
          </Section>
          <Section title="Audio transitions">
            <p>
              Drop Constant power, Linear, Exponential or Logarithmic fade on either half of an audio clip. Constant power
              keeps the loudness even across a cut.
            </p>
          </Section>
          <Tip>Settings → Audio Hardware chooses the output device.</Tip>
        </div>
      );
    case 'export':
      return (
        <div className="space-y-4">
          <Section title="Exporting">
            <Steps
              items={[
                'Open File → Export (Ctrl+M).',
                'Choose a format and resolution, or type a custom size.',
                'Export renders every effect, key, transition and audio effect exactly as in the Program monitor.',
              ]}
            />
          </Section>
          <Tip>Save the project before a long export. Projects keep links to your media files; they do not copy them.</Tip>
        </div>
      );
    case 'shortcuts':
      return <ShortcutsTopic />;
  }
}

export function GuideDialog({ onClose }: { onClose: () => void }) {
  const [topic, setTopic] = useState<TopicId>('start');
  return (
    <Dialog
      open
      title="Timeline Guide"
      onClose={onClose}
      className="w-[760px]"
      footer={
        <>
          <span className="mr-auto self-center text-2xs text-fg-subtle">Timeline {APP_VERSION} · Press F1 to open this guide</span>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="-mx-4 -my-3 flex h-[min(520px,calc(100vh-160px))] min-w-0">
        <nav aria-label="Guide topics" className="w-44 shrink-0 space-y-0.5 border-r border-line bg-surface-1 p-2">
          {TOPICS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={topic === item.id ? 'page' : undefined}
              className={cn(
                'block w-full truncate rounded-sm px-2 py-1 text-left text-xs',
                topic === item.id ? 'bg-accent/15 font-medium text-fg' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
              )}
              onClick={() => setTopic(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-3">
          <TopicBody topic={topic} />
        </div>
      </div>
    </Dialog>
  );
}
