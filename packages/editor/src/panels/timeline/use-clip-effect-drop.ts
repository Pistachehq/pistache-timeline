import { type Clip, type Track } from '@timeline/core';
import { useCallback, useState, type DragEvent } from 'react';
import { effectDragInProgress, effectPayloadFromDrop } from '../dnd';
import { useRuntime, useUiState } from '../../runtime/context';
import { aimTransition, effectPayloadMatchesClip } from '../project/apply-effect-payload';

function fractionAcross(event: DragEvent): number {
  const el = event.currentTarget;
  if (!(el instanceof HTMLElement)) return 0;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  return (event.clientX - rect.left) / rect.width;
}

export function useClipEffectDrop(clip: Clip, track: Track) {
  const runtime = useRuntime();
  const effectDrag = useUiState((s) => s.effectDrag);
  const [dropHint, setDropHint] = useState(false);

  const onDragOver = useCallback(
    (event: DragEvent) => {
      if (track.locked) return;
      const stored = runtime.stores.ui.getState().effectDrag ?? effectDrag;
      if (!effectDragInProgress(event.dataTransfer, stored)) return;
      if (stored && !effectPayloadMatchesClip(stored, clip, track.kind)) return;
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
      const stored = runtime.stores.ui.getState().effectDrag;
      if (track.locked || !effectDragInProgress(event.dataTransfer, stored)) return;
      event.preventDefault();
      event.stopPropagation();
      setDropHint(false);
      const dropped = effectPayloadFromDrop(event.dataTransfer, stored);
      const payload = dropped ? aimTransition(dropped, fractionAcross(event)) : null;
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
