import { getActiveSequence, type Clip, pixelToFrame, type Track, type TrackId } from '@timeline/core';
import { type PointerEvent, useRef } from 'react';
import { useRuntime } from '../../runtime/context';
import { buildDragPreviews, expandMovingClips } from './clip-drag-group';
import { snapClipDrag, snapTimelineFrame } from './timeline-snap';

const DRAG_THRESHOLD_PX = 3;

interface Gesture {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly laneTop: number;
  readonly onKeyDown: (event: KeyboardEvent) => void;
  readonly moving: readonly Clip[];
  dragging: boolean;
  trackId: TrackId;
  offsetY: number;
}

/** Finds the lane under a viewport Y coordinate that can receive a clip of `kind`. */
function laneAt(clientY: number, kind: Track['kind']): { trackId: TrackId; top: number } | null {
  for (const lane of document.querySelectorAll<HTMLElement>('[data-track-lane]')) {
    const rect = lane.getBoundingClientRect();
    if (clientY < rect.top || clientY >= rect.bottom) continue;
    if (lane.dataset.trackKind !== kind || lane.dataset.trackLocked === 'true') return null;
    return { trackId: lane.dataset.trackId as TrackId, top: rect.top };
  }
  return null;
}

const isAdditive = (event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) =>
  event.shiftKey || event.ctrlKey || event.metaKey;

function laneFrameAt(clientX: number, lane: HTMLElement, pixelsPerFrame: number): number {
  const x = clientX - lane.getBoundingClientRect().left;
  return pixelToFrame(x, pixelsPerFrame);
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

  const end = () => {
    const g = gesture.current;
    if (g) window.removeEventListener('keydown', g.onKeyDown, true);
    gesture.current = null;
    runtime.stores.ui.getState().setClipDrag(null);
    clearSnapGuides();
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

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
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

    event.currentTarget.setPointerCapture(event.pointerId);
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.stopPropagation();
      end();
    };
    window.addEventListener('keydown', onKeyDown, true);
    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      laneTop: lane.getBoundingClientRect().top,
      onKeyDown,
      moving: expandMovingClips(sequence, clip, selection.getState().clipIds),
      dragging: false,
      trackId: track.id,
      offsetY: 0,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (g?.pointerId !== event.pointerId) return;
    const dx = event.clientX - g.x;
    if (!g.dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(event.clientY - g.y) < DRAG_THRESHOLD_PX) return;
      g.dragging = true;
    }
    const target = laneAt(event.clientY, track.kind);
    if (target) {
      g.trackId = target.trackId;
      g.offsetY = target.top - g.laneTop;
    }

    const { ui, project, playback } = runtime.stores;
    const sequence = getActiveSequence(project.getState().project);
    let start = Math.max(0, clip.start + Math.round(dx / pixelsPerFrame));
    let guides: readonly number[] = [];
    if (sequence) {
      const excludeIds = g.moving.map((c) => c.id);
      const snapped = snapClipDrag(
        sequence,
        clip,
        start,
        playback.getState().playhead,
        pixelsPerFrame,
        ui.getState().snapEnabled,
        excludeIds,
      );
      start = snapped.start;
      guides = snapped.guides;
    }
    ui.getState().setSnapGuideFrames(guides);
    ui.getState().setClipDrag({
      primaryClipId: clip.id,
      previews: buildDragPreviews(g.moving, clip, start, g.trackId, g.offsetY),
    });
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (g?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const drag = runtime.stores.ui.getState().clipDrag;
    end();
    if (g.dragging && drag && drag.previews.length > 0) {
      const changed = drag.previews.some((preview) => {
        const original = g.moving.find((c) => c.id === preview.clipId);
        return original && (preview.start !== original.start || preview.trackId !== original.trackId);
      });
      if (changed) runtime.actions.edit.moveClipGroup(drag.previews);
    } else if (!g.dragging) {
      const { selection } = runtime.stores;
      selection.getState().selectClips([clip.id]);
      selection.getState().selectAsset(clip.assetId);
    }
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: end };
}
