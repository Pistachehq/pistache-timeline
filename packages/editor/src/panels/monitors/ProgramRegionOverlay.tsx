import {
  findTrack,
  getActiveSequence,
  getStackedVideoClipsAt,
  type ClipId,
  type EffectRegion,
  type Sequence,
} from '@timeline/core';
import { clamp } from '@timeline/shared';
import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { useProjectState, useRuntime } from '../../runtime/context';
import { normalizeEffectRegion } from '../inspector/effect-region';
import { programLayerElement } from './program-clip-layout';

interface FrameRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

type Edge = 'top' | 'right' | 'bottom' | 'left';

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

function visibleRect(box: FrameRect, region: EffectRegion): FrameRect {
  const t = (box.height * region.top) / 100;
  const r = (box.width * region.right) / 100;
  const b = (box.height * region.bottom) / 100;
  const l = (box.width * region.left) / 100;
  return {
    left: box.left + l,
    top: box.top + t,
    width: Math.max(8, box.width - l - r),
    height: Math.max(8, box.height - t - b),
  };
}

const EDGE_HIT = 'absolute touch-none bg-transparent hover:bg-violet-400/25';

/** Shared inset editor for crop and blur region (Program monitor). */
export function ProgramRegionOverlay({
  sequence,
  frameRef,
  playhead,
  clipId,
  zIndex,
  region,
  accentClass,
  active,
  onRegionChange,
  onCommit,
}: {
  readonly sequence: Sequence;
  readonly frameRef: RefObject<HTMLDivElement | null>;
  readonly playhead: number;
  readonly clipId: ClipId;
  readonly zIndex: number;
  readonly region: EffectRegion;
  readonly accentClass: string;
  readonly active: boolean;
  readonly onRegionChange: (region: EffectRegion, raw?: boolean) => void;
  readonly onCommit: () => void;
}) {
  const runtime = useRuntime();
  const clip = useProjectState((s) => {
    const seq = getActiveSequence(s.project);
    return seq?.clips[clipId];
  });

  const stack = getStackedVideoClipsAt(sequence, playhead);
  const visible =
    active && clip && stack.some(({ clip: c }) => c.id === clip.id) && !findTrack(sequence, clip.trackId)?.locked;

  const [layerBox, setLayerBox] = useState<FrameRect | null>(null);

  const dragRef = useRef<{
    edge: Edge;
    pointerId: number;
    start: EffectRegion;
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
  }, [visible, clipId, frameRef, playhead, clip?.transform, region]);

  if (!visible || !layerBox) return null;

  const inner = visibleRect(layerBox, region);

  const onEdgePointerDown = (edge: Edge) => (event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    runtime.actions.edit.beginTransaction('Adjust Region');
    dragRef.current = {
      edge,
      pointerId: event.pointerId,
      start: region,
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
    const { layer, start, edge } = drag;
    let { top, right, bottom, left, internal } = start;

    const maxSide = 90;
    const minVisible = 10;

    if (edge === 'top') top = clamp(start.top + (dy / layer.height) * 100, 0, maxSide);
    else if (edge === 'bottom') bottom = clamp(start.bottom - (dy / layer.height) * 100, 0, maxSide);
    else if (edge === 'left') left = clamp(start.left + (dx / layer.width) * 100, 0, maxSide);
    else right = clamp(start.right - (dx / layer.width) * 100, 0, maxSide);

    if (100 - top - bottom < minVisible) return;
    if (100 - left - right < minVisible) return;

    onRegionChange({ top, right, bottom, left, internal }, true);
  };

  const onPointerUp = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    onRegionChange(normalizeEffectRegion(region), false);
    onCommit();
  };

  return (
    <div
      className="absolute inset-0"
      style={{ zIndex }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className={`pointer-events-none absolute rounded-xs border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.35)] ${accentClass}`}
        style={{ left: inner.left, top: inner.top, width: inner.width, height: inner.height }}
      />
      {(['top', 'bottom', 'left', 'right'] as const).map((edge) => {
        const style =
          edge === 'top'
            ? { left: inner.left, top: inner.top - 4, width: inner.width, height: 8 }
            : edge === 'bottom'
              ? { left: inner.left, top: inner.top + inner.height - 4, width: inner.width, height: 8 }
              : edge === 'left'
                ? { left: inner.left - 4, top: inner.top, width: 8, height: inner.height }
                : { left: inner.left + inner.width - 4, top: inner.top, width: 8, height: inner.height };
        const cursor = edge === 'top' || edge === 'bottom' ? 'cursor-ns-resize' : 'cursor-ew-resize';
        return (
          <button
            key={edge}
            type="button"
            aria-label={`Adjust ${edge}`}
            className={`${EDGE_HIT} ${cursor}`}
            style={style}
            onPointerDown={onEdgePointerDown(edge)}
          />
        );
      })}
    </div>
  );
}
