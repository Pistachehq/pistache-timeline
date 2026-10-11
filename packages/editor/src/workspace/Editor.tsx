import { ResizableGroup, ResizableHandle, ResizablePanel } from '@timeline/ui';
import { DEFAULT_KEYMAP, type Keymap } from '../commands/commands';
import { useKeyboardShortcuts } from '../commands/use-keyboard-shortcuts';
import { InspectorPanel } from '../panels/inspector/InspectorPanel';
import { ProgramMonitor } from '../panels/monitors/ProgramMonitor';
import { SourcePanel } from '../panels/monitors/SourcePanel';
import { ProjectPanel } from '../panels/project/ProjectPanel';
import { TimelinePanel } from '../panels/timeline/TimelinePanel';
import { type EditorRuntime } from '../runtime/create-runtime';
import { EditorRuntimeProvider } from '../runtime/context';
import { AppHeader } from './AppHeader';
import { DialogHost } from './dialogs/DialogHost';
import { StatusBar } from './StatusBar';

export interface EditorProps {
  runtime: EditorRuntime;
  keymap?: Keymap;
}

function Workspace({ runtime, keymap = DEFAULT_KEYMAP }: EditorProps) {
  useKeyboardShortcuts(runtime, keymap);
  return (
    <div className="flex h-full flex-col bg-surface-0 text-fg" data-testid="editor">
      <AppHeader />
      <main className="min-h-0 flex-1 p-1">
        <ResizableGroup orientation="vertical" storageId="workspace-rows">
          <ResizablePanel id="top" defaultSize="52%" minSize={160}>
            <ResizableGroup orientation="horizontal" storageId="workspace-top">
              <ResizablePanel id="source" defaultSize="30%" minSize={220}>
                <SourcePanel />
              </ResizablePanel>
              <ResizableHandle orientation="horizontal" />
              <ResizablePanel id="program" defaultSize="45%" minSize={260}>
                <ProgramMonitor />
              </ResizablePanel>
              <ResizableHandle orientation="horizontal" />
              <ResizablePanel id="inspector" defaultSize="25%" minSize={220}>
                <InspectorPanel />
              </ResizablePanel>
            </ResizableGroup>
          </ResizablePanel>
          <ResizableHandle orientation="vertical" />
          <ResizablePanel id="bottom" defaultSize="48%" minSize={180}>
            <ResizableGroup orientation="horizontal" storageId="workspace-bottom">
              <ResizablePanel id="project" defaultSize="24%" minSize={220}>
                <ProjectPanel />
              </ResizablePanel>
              <ResizableHandle orientation="horizontal" />
              <ResizablePanel id="timeline" defaultSize="76%" minSize={360}>
                <TimelinePanel />
              </ResizablePanel>
            </ResizableGroup>
          </ResizablePanel>
        </ResizableGroup>
      </main>
      <StatusBar />
      <DialogHost />
    </div>
  );
}

/** The complete Timeline editing workspace, shared by the web and desktop apps. */
export function Editor({ runtime, keymap }: EditorProps) {
  return (
    <EditorRuntimeProvider runtime={runtime}>
      <Workspace runtime={runtime} {...(keymap ? { keymap } : {})} />
    </EditorRuntimeProvider>
  );
}
