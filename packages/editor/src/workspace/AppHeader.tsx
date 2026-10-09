import { Button, IconButton, MenuBar, TimelineLogo } from '@timeline/ui';
import { Redo2, Undo2, Upload } from 'lucide-react';
import { canRedo, canUndo } from '@timeline/core';
import { useState } from 'react';
import { executeCommand, shortcutLabel as shortcut } from '../commands/commands';
import { useProjectState, useRuntime } from '../runtime/context';
import { selectIsDirty } from '../state/project-store';
import { useAppMenus } from './use-app-menus';

function ProjectName() {
  const runtime = useRuntime();
  const name = useProjectState((s) => s.project.name);
  const dirty = useProjectState(selectIsDirty);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        autoFocus
        aria-label="Project name"
        defaultValue={name}
        className="h-6 w-56 rounded-sm border border-accent bg-surface-1 px-2 text-sm text-fg outline-none"
        onBlur={(e) => {
          runtime.actions.edit.renameProject(e.target.value);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      title="Rename project"
      className="flex h-6 max-w-72 items-center gap-1.5 rounded-sm px-2 text-sm text-fg-muted hover:bg-surface-3 hover:text-fg"
      onClick={() => setEditing(true)}
    >
      <span className="truncate" data-testid="project-name">
        {name}
      </span>
      {dirty ? (
        <span className="size-1.5 shrink-0 rounded-full bg-warning" title="Unsaved changes" aria-label="Unsaved changes" />
      ) : null}
    </button>
  );
}

/** Top application bar: branding, menus, project name, history and export. */
export function AppHeader() {
  const runtime = useRuntime();
  const menus = useAppMenus();
  const undoable = useProjectState((s) => canUndo(s.history));
  const redoable = useProjectState((s) => canRedo(s.history));

  return (
    <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-surface-2 px-2">
      <div className="flex items-center gap-1.5 pr-1">
        <TimelineLogo className="size-5" />
        <span className="text-sm font-semibold tracking-tight">Timeline</span>
      </div>
      <MenuBar menus={menus} />
      <div className="flex flex-1 justify-center">
        <ProjectName />
      </div>
      <div className="flex items-center gap-0.5">
        <IconButton
          label="Undo"
          shortcut={shortcut('edit.undo')}
          icon={<Undo2 />}
          disabled={!undoable}
          onClick={() => executeCommand('edit.undo', runtime)}
        />
        <IconButton
          label="Redo"
          shortcut={shortcut('edit.redo')}
          icon={<Redo2 />}
          disabled={!redoable}
          onClick={() => executeCommand('edit.redo', runtime)}
        />
      </div>
      <Button
        size="sm"
        variant="primary"
        icon={<Upload className="size-3.5" />}
        onClick={() => executeCommand('file.export', runtime)}
      >
        Export
      </Button>
    </header>
  );
}
