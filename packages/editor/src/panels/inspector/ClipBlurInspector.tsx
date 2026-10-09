import { type Clip } from '@timeline/core';
import { IconButton, NumberField } from '@timeline/ui';
import { Check, RotateCcw, Scan } from 'lucide-react';
import { useRuntime, useUiState } from '../../runtime/context';
import { ensureBlurRegion, getClipBlur, upsertClipBlur } from './clip-blur';
import { isEffectRegionActive as regionActive } from './effect-region';
import { InspectorSection } from './InspectorSection';

function blurStatus(editing: boolean, active: boolean): string {
  if (editing) return 'Editing mask in Program monitor';
  if (active) return 'On';
  return 'Off';
}

export function ClipBlurInspector({ clip, locked }: { readonly clip: Clip; readonly locked: boolean }) {
  const runtime = useRuntime();
  const { edit } = runtime.actions;
  const blurEditId = useUiState((s) => s.clipBlurEditId);
  const setBlurEditId = runtime.stores.ui.getState().setClipBlurEditId;
  const blur = getClipBlur(clip);
  if (!blur) return null;

  const region = ensureBlurRegion(blur);
  const maskActive = regionActive(blur.region);
  const editing = blurEditId === clip.id;

  const openEditor = () => {
    if (locked) return;
    if (!regionActive(blur.region)) {
      edit.setClipEffects(
        clip.id,
        upsertClipBlur(clip.effects, {
          ...blur,
          region: { top: 18, right: 18, bottom: 18, left: 18, internal: region.internal },
        }),
        'Blur Mask',
      );
    }
    setBlurEditId(clip.id);
  };

  const closeEditor = () => {
    if (blurEditId !== clip.id) return;
    setBlurEditId(null);
  };

  const resetMask = () => {
    edit.setClipEffects(clip.id, upsertClipBlur(clip.effects, { ...blur, region: null }), 'Clear Blur Mask');
    setBlurEditId(null);
  };

  return (
    <InspectorSection title="Blur mask">
      <NumberField
        label="Amount"
        value={blur.amount}
        min={0}
        max={100}
        step={1}
        precision={0}
        disabled={locked}
        onChange={(amount) =>
          edit.setClipEffects(clip.id, upsertClipBlur(clip.effects, { ...blur, amount }), 'Change Blur')
        }
      />
      <label className="flex cursor-pointer items-center gap-2 text-xs text-fg">
        <input
          type="checkbox"
          className="size-3.5 rounded-xs border border-line accent-violet-500"
          checked={region.internal}
          disabled={locked}
          onChange={(event) =>
            edit.setClipEffects(
              clip.id,
              upsertClipBlur(clip.effects, { ...blur, region: { ...region, internal: event.target.checked } }),
              'Change Blur Mask',
            )
          }
        />
        Blur inside selection
      </label>
      <p className="text-2xs text-fg-subtle">
        {region.internal
          ? 'Blur applies inside the mask. Uncheck to blur outside the mask.'
          : 'Blur applies outside the mask. Check to blur inside instead.'}
      </p>
      <div className="flex h-6 items-center justify-between gap-2">
        <span className={`text-xs ${editing ? 'text-violet-400' : 'text-fg-muted'}`}>
          {blurStatus(editing, maskActive || blur.amount > 0)}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {editing ? (
            <IconButton label="Finish blur mask" icon={<Check />} tone="accent" onClick={closeEditor} />
          ) : (
            <IconButton
              label="Edit blur mask in Program monitor"
              icon={<Scan />}
              disabled={locked}
              onClick={openEditor}
            />
          )}
          {maskActive && !editing ? (
            <IconButton label="Clear blur mask" icon={<RotateCcw />} disabled={locked} onClick={resetMask} />
          ) : null}
        </div>
      </div>
    </InspectorSection>
  );
}
