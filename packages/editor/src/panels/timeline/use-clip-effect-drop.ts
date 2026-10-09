import { type Clip, type Track } from '@timeline/core';
import { useCallback, useState, type DragEvent } from 'react';
import { useRuntime, useUiState } from '../../runtime/context';
import { effectPayloadMatchesTrack } from '../project/apply-effect-payload';
import { isEffectDrag, readEffectDragData } from '../dnd';

export function useClipEffectDrop(clip: Clip, track: Track) {
  const runtime = useRuntime();
  const effectDrag = useUiState((s) => s.effectDrag);
  const [dropHint, setDropHint] = useState(false);

  const onDragOver = useCallback(
    (event: DragEvent) => {
      if (track.locked || !isEffectDrag(event.dataTransfer)) return;
      const payload = runtime.stores.ui.getState().effectDrag ?? effectDrag;
      if (!payload || !effectPayloadMatchesTrack(payload, track.kind)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      setDropHint(true);
    },
    [effectDrag, runtime.stores.ui, track.kind, track.locked],
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
      const payload = readEffectDragData(event.dataTransfer);
      if (!payload || !effectPayloadMatchesTrack(payload, track.kind)) return;
      runtime.stores.selection.getState().selectClips([clip.id], 'replace');
      runtime.actions.edit.applyEffectLibraryPayload(clip.id, payload, 'Apply Effect');
    },
    [clip.id, runtime.actions.edit, runtime.stores.selection, track.kind, track.locked],
  );

  return { dropHint, onDragOver, onDragLeave, onDrop };
}
