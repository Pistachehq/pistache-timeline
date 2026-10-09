import { getActiveSequence, type Clip, type Track, type TrackId } from '@timeline/core';
import { type PointerEvent as ReactPointerEvent, useRef } from 'react';
import { useRuntime } from '../../runtime/context';
import { buildDragPreviews, expandMovingClips } from './clip-drag-group';
import { snapClipDrag, snapTimelineFrame } from './timeline-snap';

const DRAG_THRESHOLD_PX = 3;

interface Gesture {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly laneTop: number;
  readonly primary: Clip;
  readonly kind: Track['kind'];
  readonly onKeyDown: (event: KeyboardEvent) => void;
  readonly onMove: (event: globalThis.PointerEvent) => void;
  readonly onUp: (event: globalThis.PointerEvent) => void;
  readonly moving: readonly Clip[];
  dragging: boolean;
  destTrackId: TrackId;
}

/** Track row under `clientY` that accepts clips of `kind` (header + lane). */
function laneAt(clientY: number, kind: Track['kind']): { trackId: TrackId; top: number } | null {
  for (const row of document.querySelectorAll<HTMLElement>('[data-track-row]')) {
    const rect = row.getBoundingClientRect();
    if (clientY < rect.top || clientY >= rect.bottom) continue;
    if (row.dataset.trackKind !== kind || row.dataset.trackLocked === 'true') continue;
    const lane = row.querySelector<HTMLElement>('[data-track-lane]');
    return { trackId: row.dataset.trackId as TrackId, top: lane?.getBoundingClientRect().top ?? rect.top };
  }
  return null;
}

const isAdditive = (event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) =>
  event.shiftKey || event.ctrlKey || event.metaKey;

function laneFrameAt(clientX: number, lane: HTMLElement, pixelsPerFrame: number): number {
  const x = clientX - lane.getBoundingClientRect().left;
  return Math.max(0, Math.round(x / pixelsPerFrame));
}

/**
 * Pointer interaction for a clip: click to select (Shift/Ctrl toggles), drag
 * to move in time or to another track of the same kind, Escape cancels.
 * The preview lives in the UI store; the edit is committed once on release.
 */
export function useClipDrag(clip: Clip, track: Track, pixelsPerFrame: number) {
  const runtime = useRuntime();
  const gesture = useRef<Gesture | null>(null);

  const clearSnapGuides = () => runtime.stores.ui.getState().setSnapGuideFrames([]);

  const removeWindowListeners = (g: Gesture) => {
    window.removeEventListener('pointermove', g.onMove);
    window.removeEventListener('pointerup', g.onUp);
    window.removeEventListener('pointercancel', g.onUp);
    window.removeEventListener('keydown', g.onKeyDown, true);
  };

  const end = () => {
    const g = gesture.current;
    if (g) removeWindowListeners(g);
    gesture.current = null;
    runtime.stores.ui.getState().setClipDrag(null);
    clearSnapGuides();
  };

  const publishDrag = (g: Gesture, clientX: number, clientY: number) => {
    const { ui, project, playback } = runtime.stores;
    const sequence = getActiveSequence(project.getState().project);
    if (!sequence) return;

    const target = laneAt(clientY, g.kind);
    if (target) g.destTrackId = target.trackId;

    const offsetY = target ? target.top - g.laneTop : 0;
    const dx = clientX - g.x;
    let start = Math.max(0, g.primary.start + Math.round(dx / pixelsPerFrame));
    const excludeIds = g.moving.map((c) => c.id);
    const snapped = snapClipDrag(
      sequence,
      g.primary,
      start,
      playback.getState().playhead,
      pixelsPerFrame,
      ui.getState().snapEnabled,
      excludeIds,
    );
    start = snapped.start;
    ui.getState().setSnapGuideFrames(snapped.guides);
    ui.getState().setClipDrag({
      primaryClipId: g.primary.id,
      previews: buildDragPreviews(sequence, g.moving, g.primary, start, g.destTrackId, offsetY),
    });
  };

  const snapRazorFrame = (lane: HTMLElement, clientX: number): number => {
    const { ui, project, playback } = runtime.stores;
    const raw = laneFrameAt(clientX, lane, pixelsPerFrame);
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

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const { ui, selection, project } = runtime.stores;
    const lane = event.currentTarget.closest<HTMLElement>('[data-track-lane]');

    if (ui.getState().tool === 'razor') {
      if (!lane) return;
      runtime.actions.edit.splitAtFrame(snapRazorFrame(lane, event.clientX));
      clearSnapGuides();
      return;
    }

    if (isAdditive(event)) {
      selection.getState().selectClips([clip.id], 'toggle');
      return;
    }
    if (!selection.getState().clipIds.includes(clip.id)) {
      selection.getState().selectClips([clip.id]);
      selection.getState().selectAsset(clip.assetId);
    }
    if (track.locked || !lane) return;

    const sequence = getActiveSequence(project.getState().project);
    if (!sequence) return;

    if (gesture.current) end();
    ui.getState().setClipDrag(null);

    event.currentTarget.setPointerCapture(event.pointerId);

    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.stopPropagation();
      end();
    };

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const g = gesture.current;
      if (!g || moveEvent.pointerId !== g.pointerId) return;
      const dx = moveEvent.clientX - g.x;
      if (!g.dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(moveEvent.clientY - g.y) < DRAG_THRESHOLD_PX) return;
        g.dragging = true;
      }
      publishDrag(g, moveEvent.clientX, moveEvent.clientY);
    };

    const onUp = (upEvent: globalThis.PointerEvent) => {
      const g = gesture.current;
      if (!g || upEvent.pointerId !== g.pointerId) return;

      const { project: projectStore } = runtime.stores;
      const sequenceOnUp = getActiveSequence(projectStore.getState().project);
      let previews = runtime.stores.ui.getState().clipDrag?.previews ?? [];

      if (g.dragging && sequenceOnUp) {
        publishDrag(g, upEvent.clientX, upEvent.clientY);
        previews = runtime.stores.ui.getState().clipDrag?.previews ?? [];
      }

      end();

      if (g.dragging && previews.length > 0) {
        const changed = previews.some((preview) => {
          const original = g.moving.find((c) => c.id === preview.clipId);
          return original && (preview.start !== original.start || preview.trackId !== original.trackId);
        });
        if (changed) runtime.actions.edit.moveClipGroup(previews);
      } else if (!g.dragging) {
        const { selection: sel } = runtime.stores;
        sel.getState().selectClips([clip.id]);
        sel.getState().selectAsset(clip.assetId);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKeyDown, true);

    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      laneTop: lane.getBoundingClientRect().top,
      primary: clip,
      kind: track.kind,
      onKeyDown,
      onMove,
      onUp,
      moving: expandMovingClips(sequence, clip, selection.getState().clipIds),
      dragging: false,
      destTrackId: track.id,
    };
  };

  return { onPointerDown, onPointerCancel: end };
}
