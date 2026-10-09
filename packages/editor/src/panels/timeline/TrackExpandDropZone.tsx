import { type MediaAsset, type Sequence } from '@timeline/core';
import { cn } from '@timeline/ui';
import { type DragEvent, useCallback, useState } from 'react';
import { useRuntime, useUiState } from '../../runtime/context';
import { ASSET_DRAG_TYPE } from '../dnd';
import { filesFromDataTransfer, isOsFileDrag } from '../file-drop';
import { TRACK_HEADER_WIDTH } from './layout';
import { TRACK_EXPAND_ZONE_PX } from './track-drag-target';
import {
  assetFromDrag,
  clearTimelineDropGuides,
  frameAtTimelineDrop,
} from './timeline-drop-frame';
import { type AutoCreateTrack } from './track-drag-target';

function assetMatchesEdge(asset: MediaAsset, edge: AutoCreateTrack): boolean {
  return edge === 'video' ? asset.hasVideo || asset.kind === 'image' : asset.hasAudio;
}

/** Drop target to create a new video track (above) or audio track (below). */
export function TrackExpandDropZone({
  edge,
  sequence,
  pixelsPerFrame,
}: {
  readonly edge: AutoCreateTrack;
  readonly sequence: Sequence;
  readonly pixelsPerFrame: number;
}) {
  const runtime = useRuntime();
  const clipDrag = useUiState((s) => s.clipDrag);
  const [assetHover, setAssetHover] = useState(false);
  const [dropFrame, setDropFrame] = useState<number | null>(null);

  const clipActive = clipDrag?.autoCreateTrack === edge;
  const highlight = clipActive || assetHover;

  const acceptDrag = useCallback(
    (event: DragEvent): MediaAsset | 'files' | null => {
      if (isOsFileDrag(event.dataTransfer)) return 'files';
      if (!event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) return null;
      const asset = assetFromDrag(runtime, event.dataTransfer);
      if (!asset || !assetMatchesEdge(asset, edge)) return null;
      return asset;
    },
    [edge, runtime],
  );

  const onDragOver = (event: DragEvent) => {
    const accepted = acceptDrag(event);
    if (!accepted) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setAssetHover(true);
    if (accepted !== 'files') {
      setDropFrame(
        frameAtTimelineDrop(runtime, sequence, event.clientX, pixelsPerFrame, accepted),
      );
    }
  };

  const onDragLeave = (event: DragEvent) => {
    event.stopPropagation();
    setAssetHover(false);
    setDropFrame(null);
    clearTimelineDropGuides(runtime);
  };

  const onDrop = (event: DragEvent) => {
    const accepted = acceptDrag(event);
    if (!accepted) return;
    event.preventDefault();
    event.stopPropagation();
    const frame =
      dropFrame ??
      (accepted !== 'files'
        ? frameAtTimelineDrop(runtime, sequence, event.clientX, pixelsPerFrame, accepted)
        : frameAtTimelineDrop(runtime, sequence, event.clientX, pixelsPerFrame));
    setAssetHover(false);
    setDropFrame(null);
    clearTimelineDropGuides(runtime);

    if (accepted === 'files') {
      const files = filesFromDataTransfer(event.dataTransfer);
      void (async () => {
        const assets = await runtime.actions.media.importLocalFiles(files);
        for (const asset of assets) {
          if (!assetMatchesEdge(asset, edge)) continue;
          runtime.actions.edit.placeAssetOnNewTrack(asset.id, edge, frame);
        }
      })();
      return;
    }

    runtime.actions.edit.placeAssetOnNewTrack(accepted.id, edge, frame);
  };

  return (
    <div className="relative flex shrink-0" style={{ height: TRACK_EXPAND_ZONE_PX }}>
      <div
        className="sticky left-0 z-[15] shrink-0 border-b border-line bg-surface-2"
        style={{ width: TRACK_HEADER_WIDTH, height: TRACK_EXPAND_ZONE_PX }}
      />
      <div
        data-track-expand-drop={edge}
        className={cn(
          'relative min-w-0 flex-1 border-b transition-colors',
          highlight ? 'border-accent/50 bg-accent/15' : 'border-line/40 bg-surface-1/50',
        )}
        style={{ height: TRACK_EXPAND_ZONE_PX }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dropFrame !== null ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-accent"
            style={{ left: dropFrame * pixelsPerFrame }}
          />
        ) : null}
      </div>
    </div>
  );
}
