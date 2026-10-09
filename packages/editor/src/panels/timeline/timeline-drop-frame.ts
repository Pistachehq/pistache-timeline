import { pixelToFrame, type MediaAsset, type Sequence } from '@timeline/core';
import { type EditorRuntime } from '../../runtime/create-runtime';
import { ASSET_DRAG_TYPE } from '../dnd';
import { snapAssetDrop, snapTimelineFrame } from './timeline-snap';

function primaryLane(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-track-lane]');
}

/** Frame index for a drop at `clientX` on the timeline lanes. */
export function frameAtTimelineDrop(
  runtime: EditorRuntime,
  sequence: Sequence,
  clientX: number,
  pixelsPerFrame: number,
  asset?: MediaAsset,
): number {
  const lane = primaryLane();
  if (!lane) return 0;
  const raw = pixelToFrame(clientX - lane.getBoundingClientRect().left, pixelsPerFrame);
  const { ui, project, playback } = runtime.stores;
  if (asset && ui.getState().snapEnabled) {
    const snapped = snapAssetDrop(sequence, asset, raw, playback.getState().playhead, pixelsPerFrame, true);
    ui.getState().setSnapGuideFrames(snapped.guides);
    return snapped.start;
  }
  const snapped = snapTimelineFrame(
    project.getState().project,
    raw,
    playback.getState().playhead,
    pixelsPerFrame,
    ui.getState().snapEnabled,
  );
  ui.getState().setSnapGuideFrames(snapped.guides);
  return snapped.frame;
}

export function clearTimelineDropGuides(runtime: EditorRuntime): void {
  runtime.stores.ui.getState().setSnapGuideFrames([]);
}

export function assetFromDrag(runtime: EditorRuntime, dataTransfer: DataTransfer): MediaAsset | undefined {
  if (!dataTransfer.types.includes(ASSET_DRAG_TYPE)) return undefined;
  const assetId = runtime.stores.ui.getState().assetDrag;
  if (!assetId) return undefined;
  return runtime.stores.project.getState().project.mediaAssets[assetId];
}
