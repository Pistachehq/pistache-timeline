import { type MenuDefinition, type MenuEntry } from '@timeline/ui';
import { useMemo } from 'react';
import {
  commandLabel,
  DEFAULT_KEYMAP,
  executeCommand,
  getCommand,
  isCommandEnabled,
  type CommandId,
} from '../commands/commands';
import { formatChord } from '../commands/keymap';
import { usePlaybackState, useProjectState, useRuntime, useSelectionState, useUiState } from '../runtime/context';

type MenuLayout = readonly { id: string; label: string; items: readonly (CommandId | '-')[] }[];

const MENU_LAYOUT: MenuLayout = [
  {
    id: 'file',
    label: 'File',
    items: ['file.new', 'file.open', '-', 'file.save', 'file.saveAs', '-', 'file.import', '-', 'file.export'],
  },
  {
    id: 'edit',
    label: 'Edit',
    items: ['edit.undo', 'edit.redo', '-', 'edit.delete', '-', 'edit.selectAll', 'edit.deselectAll'],
  },
  {
    id: 'sequence',
    label: 'Sequence',
    items: [
      'clip.insertSelectedAsset',
      'clip.split',
      'clip.toggleEnabled',
      '-',
      'clip.nudgeLeft',
      'clip.nudgeRight',
      '-',
      'sequence.addVideoTrack',
      'sequence.addAudioTrack',
    ],
  },
  {
    id: 'view',
    label: 'View',
    items: [
      'tool.select',
      'tool.razor',
      '-',
      'playback.toggle',
      'playback.goToStart',
      'playback.goToEnd',
      '-',
      'view.zoomIn',
      'view.zoomOut',
      'view.zoomReset',
    ],
  },
  { id: 'help', label: 'Help', items: ['help.about', 'help.repository'] },
];

/**
 * Builds the menu bar from the command registry. Re-computed only when state
 * that affects labels or enabled flags changes (not on playhead updates).
 */
export function useAppMenus(): MenuDefinition[] {
  const runtime = useRuntime();
  const history = useProjectState((s) => s.history);
  const clipIds = useSelectionState((s) => s.clipIds);
  const assetId = useSelectionState((s) => s.assetId);
  const tool = useUiState((s) => s.tool);
  const playing = usePlaybackState((s) => s.playing);

  return useMemo(() => {
    void [history, clipIds, assetId, tool, playing];
    return MENU_LAYOUT.map((menu) => ({
      id: menu.id,
      label: menu.label,
      items: menu.items.map((item, index): MenuEntry => {
        if (item === '-') return { type: 'separator', id: `${menu.id}-sep-${index}` };
        const command = getCommand(item);
        const chord = DEFAULT_KEYMAP[item]?.[0];
        return {
          type: 'item',
          id: item,
          label: commandLabel(command, runtime),
          shortcut: chord ? formatChord(chord) : undefined,
          disabled: !isCommandEnabled(command, runtime),
          checked: command.isChecked?.(runtime),
          onSelect: () => executeCommand(item, runtime),
        };
      }),
    }));
  }, [runtime, history, clipIds, assetId, tool, playing]);
}
