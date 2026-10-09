import { type Clip } from '@timeline/core';
import { IconButton } from '@timeline/ui';
import { Check, Crop, RotateCcw } from 'lucide-react';
import { useRuntime, useUiState } from '../../runtime/context';
import {
  clearClipCrop,
  ensureClipCrop,
  getClipCrop,
  isCropActive,
  normalizeClipCrop,
  upsertClipCrop,
} from './clip-crop';
import { InspectorSection } from './InspectorSection';

function cropStatus(editing: boolean, active: boolean): string {
  if (editing) return 'Editing in Program monitor';
  if (active) return 'On';
  return 'Off';
}

export function ClipCropInspector({ clip, locked }: { readonly clip: Clip; readonly locked: boolean }) {
  const runtime = useRuntime();
  const { edit } = runtime.actions;
  const cropEditId = useUiState((s) => s.clipCropEditId);
  const setCropEditId = runtime.stores.ui.getState().setClipCropEditId;
  const crop = getClipCrop(clip);
  const active = isCropActive(crop);
  const editing = cropEditId === clip.id;

  const openEditor = () => {
    if (locked) return;
    if (!getClipCrop(clip)) {
      const { effects, crop: empty } = ensureClipCrop(clip.effects);
      edit.setClipEffects(clip.id, upsertClipCrop(effects, empty, { keepEmpty: true }), 'Crop Clip');
    }
    setCropEditId(clip.id);
  };

  const closeEditor = () => {
    if (cropEditId !== clip.id) return;
    const current = getClipCrop(clip);
    if (current) {
      const normalized = normalizeClipCrop(current);
      if (!isCropActive(normalized)) {
        edit.setClipEffects(clip.id, clearClipCrop(clip.effects), 'Crop Clip');
      } else if (
        normalized.top !== current.top ||
        normalized.right !== current.right ||
        normalized.bottom !== current.bottom ||
        normalized.left !== current.left
      ) {
        edit.setClipEffects(clip.id, upsertClipCrop(clip.effects, normalized, { keepEmpty: true }), 'Crop Clip');
      }
    }
    setCropEditId(null);
  };

  const resetCrop = () => {
    edit.beginTransaction('Clear Crop');
    edit.setClipEffects(clip.id, clearClipCrop(clip.effects), 'Clear Crop');
    edit.commitTransaction();
    setCropEditId(null);
  };

  return (
    <InspectorSection title="Crop">
      <div className="flex h-6 items-center justify-between gap-2">
        <span className={`text-xs ${editing ? 'text-accent' : 'text-fg-muted'}`}>{cropStatus(editing, active)}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          {editing ? (
            <IconButton label="Finish cropping" icon={<Check />} tone="accent" onClick={closeEditor} />
          ) : (
            <IconButton
              label={active ? 'Edit crop' : 'Crop in Program monitor'}
              icon={<Crop />}
              disabled={locked}
              onClick={openEditor}
            />
          )}
          {active && !editing ? (
            <IconButton label="Reset crop" icon={<RotateCcw />} disabled={locked} onClick={resetCrop} />
          ) : null}
        </div>
      </div>
    </InspectorSection>
  );
}
