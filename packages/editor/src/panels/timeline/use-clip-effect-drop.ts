import { type Clip, type Track } from '@timeline/core';
import { useCallback, useState, type DragEvent } from 'react';
import { type EffectLibraryPayload } from '../dnd';
import { useRuntime, useUiState } from '../../runtime/context';
import { effectPayloadMatchesClip } from '../project/apply-effect-payload';
import { isEffectDrag, readEffectDragData } from '../dnd';

/** Video transitions dropped on the first half become the in edge; the second half becomes the out edge. */
function placeVideoTransition(payload: EffectLibraryPayload, event: DragEvent): EffectLibraryPayload {
  if (payload.kind !== 'transition-in' && payload.kind !== 'transition-out') return payload;
  if (payload.affectsVideo === false) return payload;
  const el = event.currentTarget;
  if (!(el instanceof HTMLElement)) return payload;
  const rect = el.getBoundingClientRect();
  const atEnd = event.clientX >= rect.left + rect.width / 2;
  return { ...payload, kind: atEnd ? 'transition-out' : 'transition-in' };
}

export function useClipEffectDrop(clip: Clip, track: Track) {
  const runtime = useRuntime();
  const effectDrag = useUiState((s) => s.effectDrag);
  const [dropHint, setDropHint] = useState(false);

  const onDragOver = useCallback(
    (event: DragEvent) => {
      if (track.locked || !isEffectDrag(event.dataTransfer)) return;
      const payload = runtime.stores.ui.getState().effectDrag ?? effectDrag;
      if (!payload || !effectPayloadMatchesClip(payload, clip, track.kind)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      setDropHint(true);
    },
    [clip, effectDrag, runtime.stores.ui, track.kind, track.locked],
  );

  const onDragLeave = useCallback((event: DragEvent) => {
    event.stopPropagation();
    setDropHint(false);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      if (track.locked || !isEffectDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      setDropHint(false);
      const dropped = readEffectDragData(event.dataTransfer);
      const payload = dropped ? placeVideoTransition(dropped, event) : null;
      if (payload?.kind === 'text-animation' && !clip.text) {
        runtime.stores.ui.getState().notify('Text transitions only apply to text clips.', 'warning');
        return;
      }
      if (!payload || !effectPayloadMatchesClip(payload, clip, track.kind)) return;
      runtime.stores.selection.getState().selectClips([clip.id], 'replace');
      runtime.actions.edit.applyEffectLibraryPayload(clip.id, payload, 'Apply Effect');
    },
    [clip, runtime.actions.edit, runtime.stores.selection, runtime.stores.ui, track.kind, track.locked],
  );

  return { dropHint, onDragOver, onDragLeave, onDrop };
}
