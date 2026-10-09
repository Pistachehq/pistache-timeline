import {

  type FrameRange,

  type FrameRate,

  getClipsInRange,

  type MediaAssetId,

  pixelToFrame,

  type Sequence,

  type Track,

} from '@timeline/core';

import { cn } from '@timeline/ui';

import { type DragEvent, memo, useMemo, useState } from 'react';

import { useRuntime, useUiState } from '../../runtime/context';

import { ASSET_DRAG_TYPE } from '../dnd';

import { ClipItem } from './ClipItem';

import { snapAssetDrop, snapTimelineFrame } from './timeline-snap';



interface TrackLaneProps {

  sequence: Sequence;

  track: Track;

  height: number;

  width: number;

  pixelsPerFrame: number;

  frameRate: FrameRate;

  visibleRange: FrameRange;

}



/** One track's clip area. Renders only clips intersecting the visible range. */

export const TrackLane = memo(function TrackLane({

  sequence,

  track,

  height,

  width,

  pixelsPerFrame,

  frameRate,

  visibleRange,

}: TrackLaneProps) {

  const runtime = useRuntime();

  const razor = useUiState((s) => s.tool === 'razor');

  const [dropFrame, setDropFrame] = useState<number | null>(null);

  const clips = useMemo(

    () => getClipsInRange(sequence, track, visibleRange.start, visibleRange.end),

    [sequence, track, visibleRange],

  );



  const acceptsDrag = (event: DragEvent<HTMLDivElement>): boolean => {

    if (track.locked || !event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) return false;

    const assetId = runtime.stores.ui.getState().assetDrag;

    const asset = assetId ? runtime.stores.project.getState().project.mediaAssets[assetId] : undefined;

    return !!asset && (track.kind === 'video' ? asset.hasVideo : asset.hasAudio);

  };



  const laneOffsetX = (clientX: number, target: HTMLDivElement) => clientX - target.getBoundingClientRect().left;

  const clearSnapGuides = () => runtime.stores.ui.getState().setSnapGuideFrames([]);



  const frameAtClientX = (clientX: number, target: HTMLDivElement): number => {

    const { ui, project, playback } = runtime.stores;

    const raw = pixelToFrame(laneOffsetX(clientX, target), pixelsPerFrame);

    const assetId = ui.getState().assetDrag;

    const asset = assetId ? project.getState().project.mediaAssets[assetId] : undefined;

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

  };



  return (

    <div

      className={cn(

        'relative shrink-0 border-b border-line',

        track.kind === 'video' ? 'bg-surface-1' : 'bg-[#17181b]',

        track.locked &&

          'bg-[repeating-linear-gradient(135deg,transparent_0,transparent_6px,rgb(255_255_255/0.025)_6px,rgb(255_255_255/0.025)_12px)]',

      )}

      style={{ width, height }}

      data-track-lane

      data-track-id={track.id}

      data-track-kind={track.kind}

      data-track-locked={track.locked}

      data-testid={`track-lane-${track.name}`}

      onPointerDown={(event) => {

        if (event.button !== 0) return;

        if (razor) {

          runtime.actions.edit.splitAtFrame(

            frameAtClientX(event.clientX, event.currentTarget),

          );

          clearSnapGuides();

          return;

        }

      }}

      onDragOver={(event) => {

        if (!acceptsDrag(event)) return;

        event.preventDefault();

        event.dataTransfer.dropEffect = 'copy';

        setDropFrame(frameAtClientX(event.clientX, event.currentTarget));

      }}

      onDragLeave={() => {

        setDropFrame(null);

        clearSnapGuides();

      }}

      onDrop={(event) => {

        const frame = dropFrame;

        setDropFrame(null);

        clearSnapGuides();

        const assetId = event.dataTransfer.getData(ASSET_DRAG_TYPE);

        if (!assetId || !acceptsDrag(event)) return;

        event.preventDefault();

        runtime.actions.edit.placeAssetOnTrack(

          assetId as MediaAssetId,

          track.id,

          frame ?? frameAtClientX(event.clientX, event.currentTarget),

        );

      }}

    >

      {clips.map((clip) => (

        <ClipItem key={clip.id} clip={clip} track={track} pixelsPerFrame={pixelsPerFrame} frameRate={frameRate} />

      ))}

      {dropFrame !== null ? (

        <div

          className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-accent"

          style={{ left: dropFrame * pixelsPerFrame }}

        />

      ) : null}

    </div>

  );

});


