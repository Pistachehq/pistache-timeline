import { type Track, type TrackId } from '@timeline/core';
import { AUDIO_TRACK_HEIGHT, VIDEO_TRACK_HEIGHT } from './layout';

export type AutoCreateTrack = 'video' | 'audio';

export const TRACK_EXPAND_ZONE_PX = 28;

/** Track row under `clientY` that accepts clips of `kind` (header + lane). */
export function laneAt(clientY: number, kind: Track['kind']): { trackId: TrackId; top: number } | null {
  for (const row of document.querySelectorAll<HTMLElement>('[data-track-row]')) {
    const rect = row.getBoundingClientRect();
    if (clientY < rect.top || clientY >= rect.bottom) continue;
    if (row.dataset.trackKind !== kind || row.dataset.trackLocked === 'true') continue;
    const lane = row.querySelector<HTMLElement>('[data-track-lane]');
    return { trackId: row.dataset.trackId as TrackId, top: lane?.getBoundingClientRect().top ?? rect.top };
  }
  return null;
}

function topVideoRow(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-track-row][data-track-kind="video"]');
}

function bottomAudioRow(): HTMLElement | null {
  const rows = document.querySelectorAll<HTMLElement>('[data-track-row][data-track-kind="audio"]');
  return rows.length > 0 ? rows[rows.length - 1]! : null;
}

export interface TrackDragResolution {
  readonly trackId: TrackId;
  readonly laneTop: number;
  readonly offsetY: number;
  readonly autoCreateTrack: AutoCreateTrack | null;
}

/**
 * Resolves drop target while dragging clips: existing lane, or auto-create video above / audio below.
 */
function expandDropEdgeAt(clientY: number): AutoCreateTrack | null {
  for (const el of document.querySelectorAll<HTMLElement>('[data-track-expand-drop]')) {
    const rect = el.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return el.dataset.trackExpandDrop as AutoCreateTrack;
    }
  }
  return null;
}

export function resolveTrackDragTarget(
  clientY: number,
  kind: Track['kind'],
  sourceLaneTop: number,
): TrackDragResolution | null {
  const dropEdge = expandDropEdgeAt(clientY);
  if (dropEdge === kind) {
    if (kind === 'video') {
      const top = topVideoRow();
      if (top) {
        const lane = top.querySelector<HTMLElement>('[data-track-lane]');
        const laneTop = lane?.getBoundingClientRect().top ?? top.getBoundingClientRect().top;
        return {
          trackId: top.dataset.trackId as TrackId,
          laneTop,
          offsetY: laneTop - sourceLaneTop - VIDEO_TRACK_HEIGHT,
          autoCreateTrack: 'video',
        };
      }
    }
    if (kind === 'audio') {
      const bottom = bottomAudioRow();
      if (bottom) {
        const lane = bottom.querySelector<HTMLElement>('[data-track-lane]');
        const laneTop = lane?.getBoundingClientRect().top ?? bottom.getBoundingClientRect().top;
        return {
          trackId: bottom.dataset.trackId as TrackId,
          laneTop,
          offsetY: laneTop - sourceLaneTop + AUDIO_TRACK_HEIGHT,
          autoCreateTrack: 'audio',
        };
      }
    }
  }

  if (kind === 'video') {
    const top = topVideoRow();
    if (top) {
      const rect = top.getBoundingClientRect();
      if (clientY >= rect.top - TRACK_EXPAND_ZONE_PX && clientY < rect.top) {
        const lane = top.querySelector<HTMLElement>('[data-track-lane]');
        const laneTop = lane?.getBoundingClientRect().top ?? rect.top;
        return {
          trackId: top.dataset.trackId as TrackId,
          laneTop,
          offsetY: laneTop - sourceLaneTop - VIDEO_TRACK_HEIGHT,
          autoCreateTrack: 'video',
        };
      }
    }
  }

  if (kind === 'audio') {
    const bottom = bottomAudioRow();
    if (bottom) {
      const rect = bottom.getBoundingClientRect();
      if (clientY >= rect.bottom && clientY <= rect.bottom + TRACK_EXPAND_ZONE_PX) {
        const lane = bottom.querySelector<HTMLElement>('[data-track-lane]');
        const laneTop = lane?.getBoundingClientRect().top ?? rect.top;
        return {
          trackId: bottom.dataset.trackId as TrackId,
          laneTop,
          offsetY: laneTop - sourceLaneTop + AUDIO_TRACK_HEIGHT,
          autoCreateTrack: 'audio',
        };
      }
    }
  }

  const lane = laneAt(clientY, kind);
  if (!lane) return null;
  return {
    trackId: lane.trackId,
    laneTop: lane.top,
    offsetY: lane.top - sourceLaneTop,
    autoCreateTrack: null,
  };
}
