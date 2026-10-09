import { getActiveSequence, type Clip, type Track } from '@timeline/core';
import { type PointerEvent as ReactPointerEvent, useRef } from 'react';
import { useRuntime } from '../../runtime/context';
import { expandTrimPreviews, sequenceEndFrame, trimChanged } from './clip-trim-preview';
import { snapTimelineFrame } from './timeline-snap';

interface TrimGesture {
  readonly pointerId: number;
  readonly edge: 'start' | 'end';
  readonly lane: HTMLElement;
  readonly clip: Clip;
  readonly onKeyDown: (event: KeyboardEvent) => void;
  readonly onMove: (event: PointerEvent) => void;
  readonly onUp: (event: PointerEvent) => void;
}

function frameAtClientX(clientX: number, lane: HTMLElement, pixelsPerFrame: number): number {
  const x = clientX - lane.getBoundingClientRect().left;
  return Math.max(0, Math.round(x / pixelsPerFrame));
}

export function useClipTrim(clip: Clip, track: Track, pixelsPerFrame: number) {
  const runtime = useRuntime();
  const gesture = useRef<TrimGesture | null>(null);

  const clearTrim = () => {
    runtime.stores.ui.getState().setClipTrim(null);
    runtime.stores.ui.getState().setSnapGuideFrames([]);
  };

  const removeWindowListeners = (g: TrimGesture) => {
    window.removeEventListener('pointermove', g.onMove);
    window.removeEventListener('pointerup', g.onUp);
    window.removeEventListener('pointercancel', g.onUp);
    window.removeEventListener('keydown', g.onKeyDown, true);
  };

  const end = () => {
    const g = gesture.current;
    if (g) removeWindowListeners(g);
    gesture.current = null;
    clearTrim();
  };

  const snapFrame = (lane: HTMLElement, clientX: number): number => {
    const { ui, project, playback } = runtime.stores;
    const raw = frameAtClientX(clientX, lane, pixelsPerFrame);
    const snapped = snapTimelineFrame(
      project.getState().project,
      raw,
      playback.getState().playhead,
      pixelsPerFrame,
      ui.getState().snapEnabled,
    );
    ui.getState().setSnapGuideFrames(snapped.guides);
    return snapped.frame;
  };

  const publishPreview = (g: TrimGesture, clientX: number) => {
    const project = runtime.stores.project.getState().project;
    const sequence = getActiveSequence(project);
    if (!sequence) return;
    const frame = snapFrame(g.lane, clientX);
    const previews = expandTrimPreviews(sequence, project, g.clip, g.edge, frame);
    runtime.stores.ui.getState().setClipTrim({
      primaryClipId: g.clip.id,
      edge: g.edge,
      previews,
    });
  };

  const commitTrim = (g: TrimGesture) => {
    const sequence = getActiveSequence(runtime.stores.project.getState().project);
    const trim = runtime.stores.ui.getState().clipTrim;
    if (!sequence || !trim || trim.primaryClipId !== g.clip.id) return;
    if (!trimChanged(trim.previews, sequence)) return;

    const preview = trim.previews.find((p) => p.clipId === g.clip.id);
    if (!preview) return;
    if (g.edge === 'start') {
      runtime.actions.edit.trimClipToEdge(g.clip.id, 'start', Math.round(preview.start));
    } else {
      runtime.actions.edit.trimClipToEdge(g.clip.id, 'end', sequenceEndFrame(preview));
    }
  };

  const onTrimPointerDown =
    (edge: 'start' | 'end') => (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      const { ui } = runtime.stores;
      if (ui.getState().tool !== 'select' || track.locked) return;
      const lane = event.currentTarget.closest<HTMLElement>('[data-track-lane]');
      if (!lane) return;

      if (gesture.current) end();

      const onKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key !== 'Escape') return;
        keyEvent.stopPropagation();
        end();
      };

      const onMove = (e: PointerEvent) => {
        const g = gesture.current;
        if (!g || e.pointerId !== g.pointerId) return;
        publishPreview(g, e.clientX);
      };

      const onUp = (e: PointerEvent) => {
        const g = gesture.current;
        if (!g || e.pointerId !== g.pointerId) return;
        commitTrim(g);
        end();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      window.addEventListener('keydown', onKeyDown, true);

      gesture.current = { pointerId: event.pointerId, edge, lane, clip, onKeyDown, onMove, onUp };
      publishPreview(gesture.current, event.clientX);
    };

  const trimHandlers = (edge: 'start' | 'end') => ({
    onPointerDown: onTrimPointerDown(edge),
  });

  return {
    start: trimHandlers('start'),
    end: trimHandlers('end'),
  };
}
