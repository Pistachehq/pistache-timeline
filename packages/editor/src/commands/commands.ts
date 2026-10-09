import { canRedo, canUndo, redoLabel, undoLabel } from '@timeline/core';
import { APP_REPOSITORY_URL } from '@timeline/shared';
import { type EditorRuntime } from '../runtime/create-runtime';
import { formatChord } from './keymap';

export type CommandId =
  | 'file.new'
  | 'file.open'
  | 'file.save'
  | 'file.saveAs'
  | 'file.import'
  | 'file.importFolder'
  | 'file.export'
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.delete'
  | 'edit.selectAll'
  | 'edit.deselectAll'
  | 'clip.insertSelectedAsset'
  | 'clip.split'
  | 'clip.nudgeLeft'
  | 'clip.nudgeRight'
  | 'clip.toggleEnabled'
  | 'sequence.addVideoTrack'
  | 'sequence.addAudioTrack'
  | 'tool.select'
  | 'tool.razor'
  | 'tool.text'
  | 'playback.toggle'
  | 'playback.stepBack'
  | 'playback.stepForward'
  | 'playback.stepBackMany'
  | 'playback.stepForwardMany'
  | 'playback.goToStart'
  | 'playback.goToEnd'
  | 'playback.previousEdit'
  | 'playback.nextEdit'
  | 'view.zoomIn'
  | 'view.zoomOut'
  | 'view.zoomReset'
  | 'help.about'
  | 'help.repository';

export interface Command {
  readonly id: CommandId;
  readonly label: string | ((runtime: EditorRuntime) => string);
  readonly run: (runtime: EditorRuntime) => unknown;
  readonly isEnabled?: (runtime: EditorRuntime) => boolean;
  readonly isChecked?: (runtime: EditorRuntime) => boolean;
  /** Whether holding the key repeats the command. */
  readonly repeatable?: boolean;
}

const hasSelection = (rt: EditorRuntime) => rt.stores.selection.getState().clipIds.length > 0;
const ZOOM_STEP = 1.5;

export const COMMANDS: readonly Command[] = [
  { id: 'file.new', label: 'New Project', run: (rt) => rt.actions.project.newProject() },
  { id: 'file.open', label: 'Open Project…', run: (rt) => rt.actions.project.openProject() },
  { id: 'file.save', label: 'Save', run: (rt) => rt.actions.project.saveProject() },
  { id: 'file.saveAs', label: 'Save As…', run: (rt) => rt.actions.project.saveProjectAs() },
  { id: 'file.import', label: 'Import Media…', run: (rt) => rt.actions.media.importMedia() },
  { id: 'file.importFolder', label: 'Import Folder…', run: (rt) => rt.actions.media.importMediaFolder() },
  { id: 'file.export', label: 'Export…', run: (rt) => rt.stores.ui.getState().openDialog({ kind: 'export' }) },

  {
    id: 'edit.undo',
    label: (rt) => {
      const label = undoLabel(rt.stores.project.getState().history);
      return label ? `Undo ${label}` : 'Undo';
    },
    run: (rt) => rt.actions.edit.undo(),
    isEnabled: (rt) => canUndo(rt.stores.project.getState().history),
    repeatable: true,
  },
  {
    id: 'edit.redo',
    label: (rt) => {
      const label = redoLabel(rt.stores.project.getState().history);
      return label ? `Redo ${label}` : 'Redo';
    },
    run: (rt) => rt.actions.edit.redo(),
    isEnabled: (rt) => canRedo(rt.stores.project.getState().history),
    repeatable: true,
  },
  { id: 'edit.delete', label: 'Delete', run: (rt) => rt.actions.edit.deleteSelection(), isEnabled: hasSelection },
  { id: 'edit.selectAll', label: 'Select All Clips', run: (rt) => rt.actions.edit.selectAllClips() },
  {
    id: 'edit.deselectAll',
    label: 'Deselect All',
    run: (rt) => rt.stores.selection.getState().clearClips(),
    isEnabled: hasSelection,
  },

  {
    id: 'clip.insertSelectedAsset',
    label: 'Insert Selected Media at Playhead',
    run: (rt) => {
      const assetId = rt.stores.selection.getState().assetId;
      if (assetId) rt.actions.edit.insertAssetAtPlayhead(assetId);
    },
    isEnabled: (rt) => rt.stores.selection.getState().assetId !== null,
  },
  { id: 'clip.split', label: 'Split at Playhead', run: (rt) => rt.actions.edit.splitAtPlayhead() },
  {
    id: 'clip.nudgeLeft',
    label: 'Nudge Clip Left',
    run: (rt) => rt.actions.edit.nudgeSelection(-1),
    isEnabled: hasSelection,
    repeatable: true,
  },
  {
    id: 'clip.nudgeRight',
    label: 'Nudge Clip Right',
    run: (rt) => rt.actions.edit.nudgeSelection(1),
    isEnabled: hasSelection,
    repeatable: true,
  },
  {
    id: 'clip.toggleEnabled',
    label: 'Enable / Disable Clip',
    run: (rt) => rt.actions.edit.toggleSelectedClipsEnabled(),
    isEnabled: hasSelection,
  },
  { id: 'sequence.addVideoTrack', label: 'Add Video Track', run: (rt) => rt.actions.edit.addTrack('video') },
  { id: 'sequence.addAudioTrack', label: 'Add Audio Track', run: (rt) => rt.actions.edit.addTrack('audio') },

  {
    id: 'tool.select',
    label: 'Selection Tool',
    run: (rt) => rt.stores.ui.getState().setTool('select'),
    isChecked: (rt) => rt.stores.ui.getState().tool === 'select',
  },
  {
    id: 'tool.razor',
    label: 'Razor Tool',
    run: (rt) => rt.stores.ui.getState().setTool('razor'),
    isChecked: (rt) => rt.stores.ui.getState().tool === 'razor',
  },
  {
    id: 'tool.text',
    label: 'Text Tool',
    run: (rt) => rt.stores.ui.getState().setTool('text'),
    isChecked: (rt) => rt.stores.ui.getState().tool === 'text',
  },

  {
    id: 'playback.toggle',
    label: (rt) => (rt.stores.playback.getState().playing ? 'Pause' : 'Play'),
    run: (rt) => rt.actions.playback.togglePlayback(),
  },
  { id: 'playback.stepBack', label: 'Step Back 1 Frame', run: (rt) => rt.actions.playback.step(-1), repeatable: true },
  {
    id: 'playback.stepForward',
    label: 'Step Forward 1 Frame',
    run: (rt) => rt.actions.playback.step(1),
    repeatable: true,
  },
  {
    id: 'playback.stepBackMany',
    label: 'Step Back 10 Frames',
    run: (rt) => rt.actions.playback.step(-10),
    repeatable: true,
  },
  {
    id: 'playback.stepForwardMany',
    label: 'Step Forward 10 Frames',
    run: (rt) => rt.actions.playback.step(10),
    repeatable: true,
  },
  { id: 'playback.goToStart', label: 'Go to Start', run: (rt) => rt.actions.playback.goToStart() },
  { id: 'playback.goToEnd', label: 'Go to End', run: (rt) => rt.actions.playback.goToEnd() },
  {
    id: 'playback.previousEdit',
    label: 'Go to Previous Edit Point',
    run: (rt) => rt.actions.playback.goToPreviousEdit(),
    repeatable: true,
  },
  {
    id: 'playback.nextEdit',
    label: 'Go to Next Edit Point',
    run: (rt) => rt.actions.playback.goToNextEdit(),
    repeatable: true,
  },

  {
    id: 'view.zoomIn',
    label: 'Zoom In',
    run: (rt) => rt.stores.ui.getState().setZoom(rt.stores.ui.getState().pixelsPerFrame * ZOOM_STEP),
    repeatable: true,
  },
  {
    id: 'view.zoomOut',
    label: 'Zoom Out',
    run: (rt) => rt.stores.ui.getState().setZoom(rt.stores.ui.getState().pixelsPerFrame / ZOOM_STEP),
    repeatable: true,
  },
  { id: 'view.zoomReset', label: 'Reset Zoom', run: (rt) => rt.stores.ui.getState().setZoom(2) },

  { id: 'help.about', label: 'About Timeline', run: (rt) => rt.stores.ui.getState().openDialog({ kind: 'about' }) },
  {
    id: 'help.repository',
    label: 'Source Code on GitHub',
    run: (rt) => rt.platform.openExternal(APP_REPOSITORY_URL),
  },
];

const COMMAND_INDEX = new Map(COMMANDS.map((command) => [command.id, command]));

export function getCommand(id: CommandId): Command {
  const command = COMMAND_INDEX.get(id);
  if (!command) throw new Error(`Unknown command ${id}`);
  return command;
}

export function commandLabel(command: Command, runtime: EditorRuntime): string {
  return typeof command.label === 'function' ? command.label(runtime) : command.label;
}

export function isCommandEnabled(command: Command, runtime: EditorRuntime): boolean {
  return command.isEnabled?.(runtime) ?? true;
}

/** Runs a command if enabled. Returns whether it ran. */
export function executeCommand(id: CommandId, runtime: EditorRuntime): boolean {
  const command = getCommand(id);
  if (!isCommandEnabled(command, runtime)) return false;
  const result = command.run(runtime);
  if (result instanceof Promise) {
    result.catch((error: unknown) => {
      console.error(`Command ${id} failed`, error);
      runtime.stores.ui.getState().notify(`${commandLabel(command, runtime)} failed.`, 'error');
    });
  }
  return true;
}

/**
 * Default keyboard bindings. Each command may have several chords; the
 * first one is shown in menus. Users will eventually be able to override
 * this map.
 */
export type Keymap = Readonly<Partial<Record<CommandId, readonly string[]>>>;

export const DEFAULT_KEYMAP: Keymap = {
  'file.new': ['Mod+Alt+N'],
  'file.open': ['Mod+O'],
  'file.save': ['Mod+S'],
  'file.saveAs': ['Mod+Shift+S'],
  'file.import': ['Mod+I'],
  'file.export': ['Mod+M'],
  'edit.undo': ['Mod+Z'],
  'edit.redo': ['Mod+Shift+Z', 'Mod+Y'],
  'edit.delete': ['Delete', 'Backspace'],
  'edit.selectAll': ['Mod+A'],
  'edit.deselectAll': ['Mod+Shift+A', 'Escape'],
  'clip.insertSelectedAsset': [','],
  'clip.split': ['Mod+K'],
  'clip.nudgeLeft': ['Alt+ArrowLeft'],
  'clip.nudgeRight': ['Alt+ArrowRight'],
  'clip.toggleEnabled': ['Shift+E'],
  'tool.select': ['V'],
  'tool.razor': ['C'],
  'tool.text': ['T'],
  'playback.toggle': ['Space'],
  'playback.stepBack': ['ArrowLeft'],
  'playback.stepForward': ['ArrowRight'],
  'playback.stepBackMany': ['Shift+ArrowLeft'],
  'playback.stepForwardMany': ['Shift+ArrowRight'],
  'playback.goToStart': ['Home'],
  'playback.goToEnd': ['End'],
  'playback.previousEdit': ['ArrowUp'],
  'playback.nextEdit': ['ArrowDown'],
  'view.zoomIn': ['='],
  'view.zoomOut': ['-'],
  'view.zoomReset': ['\\'],
};

/** Display label of the primary shortcut for a command, if it has one. */
export function shortcutLabel(id: CommandId, keymap: Keymap = DEFAULT_KEYMAP): string | undefined {
  const chord = keymap[id]?.[0];
  return chord ? formatChord(chord) : undefined;
}

/** Builds a chord → command lookup from a keymap. */
export function createShortcutIndex(keymap: Keymap): Map<string, CommandId> {
  const index = new Map<string, CommandId>();
  for (const [id, chords] of Object.entries(keymap) as [CommandId, readonly string[]][]) {
    for (const chord of chords) index.set(chord, id);
  }
  return index;
}
