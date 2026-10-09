import {
  findTrack,
  getActiveSequence,
  getStackedVideoClipsAt,
  type ClipId,
  type Sequence,
} from '@timeline/core';
import { clamp } from '@timeline/shared';
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { useProjectState, useRuntime, useUiState } from '../../runtime/context';
import { EMPTY_CLIP_CROP, upsertClipCrop, type ClipCrop } from '../inspector/clip-crop';
import { programLayerElement } from './program-clip-layout';

interface FrameRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

type CropEdge = 'top' | 'right' | 'bottom' | 'left';

function measureLayerRect(layer: HTMLElement, frame: HTMLElement): FrameRect | null {
  const layerBox = layer.getBoundingClientRect();
  const frameBox = frame.getBoundingClientRect();
  if (layerBox.width <= 0 || layerBox.height <= 0) return null;
  return {
    left: layerBox.left - frameBox.left,
    top: layerBox.top - frameBox.top,
    width: layerBox.width,
    height: layerBox.height,
  };
}

function visibleRect(box: FrameRect, crop: ClipCrop): FrameRect {
  const t = (box.height * crop.top) / 100;
  const r = (box.width * crop.right) / 100;
  const b = (box.height * crop.bottom) / 100;
  const l = (box.width * crop.left) / 100;
  return {
    left: box.left + l,
    top: box.top + t,
    width: Math.max(8, box.width - l - r),
    height: Math.max(8, box.height - t - b),
  };
}

const EDGE_HIT = 'absolute touch-none bg-transparent hover:bg-accent/25';

/** Interactive crop frame on the program monitor while crop edit mode is active. */
export function ProgramCropOverlay({
  sequence,
  frameRef,
  playhead,
  clipId,
  zIndex,
}: {
  readonly sequence: Sequence;
  readonly frameRef: RefObject<HTMLDivElement | null>;
  readonly playhead: number;
  readonly clipId: ClipId;
  readonly zIndex: number;
}) {
  const runtime = useRuntime();
  const { edit } = runtime.actions;
  const cropEditId = useUiState((s) => s.clipCropEditId);
  const clip = useProjectState((s) => {
    const seq = getActiveSequence(s.project);
    return seq?.clips[clipId];
  });

  const stack = getStackedVideoClipsAt(sequence, playhead);
  const visible = cropEditId === clipId && clip && stack.some(({ clip: c }) => c.id === clip.id);
  const track = clip ? findTrack(sequence, clip.trackId) : undefined;
  const locked = track?.locked ?? false;

  const [layerBox, setLayerBox] = useState<FrameRect | null>(null);
  const crop: ClipCrop =
    clip?.effects.video.find((e): e is ClipCrop => e.kind === 'crop') ?? EMPTY_CLIP_CROP;

  const dragRef = useRef<{
    edge: CropEdge;
    pointerId: number;
    startCrop: ClipCrop;
    startClientX: number;
    startClientY: number;
    layer: FrameRect;
  } | null>(null);

  const remeasure = () => {
    const frame = frameRef.current;
    if (!frame) return;
    const layer = programLayerElement(frame, clipId);
    if (!layer) return;
    setLayerBox(measureLayerRect(layer, frame));
  };

  useLayoutEffect(() => {
    if (!visible) {
      setLayerBox(null);
      return;
    }
    remeasure();
    const frame = frameRef.current;
    if (!frame) return;
    const ro = new ResizeObserver(() => remeasure());
    ro.observe(frame);
    return () => ro.disconnect();
  }, [visible, clipId, frameRef, playhead, clip?.transform, clip?.effects.video]);

  if (!visible || !layerBox || locked || !clip) return null;

  const inner = visibleRect(layerBox, crop);

  const commitCrop = (next: ClipCrop, raw = false) => {
    edit.setClipEffects(
      clip.id,
      upsertClipCrop(clip.effects, next, { keepEmpty: true, raw }),
      'Crop Clip',
    );
  };

  const onEdgePointerDown = (edge: CropEdge) => (event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    edit.beginTransaction('Crop Clip');
    dragRef.current = {
      edge,
      pointerId: event.pointerId,
      startCrop: crop,
      startClientX: event.clientX,
      startClientY: event.clientY,
      layer: layerBox,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    const { layer, startCrop, edge } = drag;
    let { top, right, bottom, left } = startCrop;

    const maxSide = 90;
    const minVisible = 10;

    if (edge === 'top') {
      top = clamp(startCrop.top + (dy / layer.height) * 100, 0, maxSide);
    } else if (edge === 'bottom') {
      bottom = clamp(startCrop.bottom - (dy / layer.height) * 100, 0, maxSide);
    } else if (edge === 'left') {
      left = clamp(startCrop.left + (dx / layer.width) * 100, 0, maxSide);
    } else {
      right = clamp(startCrop.right - (dx / layer.width) * 100, 0, maxSide);
    }

    if (100 - top - bottom < minVisible) return;
    if (100 - left - right < minVisible) return;

    commitCrop({ kind: 'crop', top, right, bottom, left }, true);
  };

  const onPointerUp = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    const latest = runtime.stores.project.getState().project.sequences[sequence.id]?.clips[clipId];
    const current = latest?.effects.video.find((e): e is ClipCrop => e.kind === 'crop');
    if (current) commitCrop(current, false);
    edit.commitTransaction();
  };

  const shade = (style: CSSProperties) => (
    <div className="pointer-events-none absolute bg-black/55" style={style} />
  );

  return (
    <div
      className="absolute inset-0"
      style={{ zIndex }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {shade({ left: layerBox.left, top: layerBox.top, width: layerBox.width, height: inner.top - layerBox.top })}
      {shade({
        left: layerBox.left,
        top: inner.top,
        width: inner.left - layerBox.left,
        height: inner.height,
      })}
      {shade({
        left: inner.left + inner.width,
        top: inner.top,
        width: layerBox.left + layerBox.width - (inner.left + inner.width),
        height: inner.height,
      })}
      {shade({
        left: layerBox.left,
        top: inner.top + inner.height,
        width: layerBox.width,
        height: layerBox.top + layerBox.height - (inner.top + inner.height),
      })}

      <div
        className="pointer-events-none absolute rounded-xs border-2 border-accent shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
        style={{ left: inner.left, top: inner.top, width: inner.width, height: inner.height }}
      />

      <button
        type="button"
        aria-label="Crop top"
        className={`${EDGE_HIT} cursor-ns-resize`}
        style={{ left: inner.left, top: inner.top - 4, width: inner.width, height: 8 }}
        onPointerDown={onEdgePointerDown('top')}
      />
      <button
        type="button"
        aria-label="Crop bottom"
        className={`${EDGE_HIT} cursor-ns-resize`}
        style={{ left: inner.left, top: inner.top + inner.height - 4, width: inner.width, height: 8 }}
        onPointerDown={onEdgePointerDown('bottom')}
      />
      <button
        type="button"
        aria-label="Crop left"
        className={`${EDGE_HIT} cursor-ew-resize`}
        style={{ left: inner.left - 4, top: inner.top, width: 8, height: inner.height }}
        onPointerDown={onEdgePointerDown('left')}
      />
      <button
        type="button"
        aria-label="Crop right"
        className={`${EDGE_HIT} cursor-ew-resize`}
        style={{ left: inner.left + inner.width - 4, top: inner.top, width: 8, height: inner.height }}
        onPointerDown={onEdgePointerDown('right')}
      />
    </div>
  );
}
