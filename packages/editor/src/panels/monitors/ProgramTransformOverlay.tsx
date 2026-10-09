import {
  findTrack,
  getActiveSequence,
  getStackedVideoClipsAt,
  TRANSFORM_LIMITS,
  type Clip,
  type ClipId,
  type Sequence,
} from '@timeline/core';
import { clamp } from '@timeline/shared';
import { cn } from '@timeline/ui';
import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { useProjectState, useRuntime } from '../../runtime/context';
import { programLayerElement } from './program-clip-layout';

interface FrameRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

type ScaleHandle =
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'n'
  | 's'
  | 'e'
  | 'w';

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

const HANDLE =
  'absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent bg-surface-0 shadow-sm';

const EDGE =
  'absolute pointer-events-auto touch-none bg-transparent';

function clampScale(value: number): number {
  return clamp(value, TRANSFORM_LIMITS.scale.min, TRANSFORM_LIMITS.scale.max);
}

/** Scale handles for the selected program clip (move is handled on the composite container). */
export function ProgramTransformOverlay({
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
  const clip = useProjectState((s) => {
    const seq = getActiveSequence(s.project);
    return seq?.clips[clipId];
  });

  const stack = getStackedVideoClipsAt(sequence, playhead);
  const visible = clip && stack.some(({ clip: c }) => c.id === clip.id);
  const track = clip ? findTrack(sequence, clip.trackId) : undefined;
  const locked = track?.locked ?? false;

  const [box, setBox] = useState<FrameRect | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    handle: ScaleHandle;
    startTransform: Clip['transform'];
    startDist: number;
    startHalfW: number;
    startHalfH: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);

  const remeasure = () => {
    const frame = frameRef.current;
    if (!clip || !frame) {
      setBox(null);
      return;
    }
    const layer = programLayerElement(frame, clip.id);
    if (!layer) {
      setBox(null);
      return;
    }
    setBox(measureLayerRect(layer, frame));
  };

  useLayoutEffect(() => {
    remeasure();
    const frame = frameRef.current;
    if (!clip || !frame) return;
    const layer = programLayerElement(frame, clip.id);
    if (!layer) return;
    const observer = new ResizeObserver(() => remeasure());
    observer.observe(layer);
    return () => observer.disconnect();
  }, [clip, frameRef, playhead, sequence, clip?.transform]);

  if (!clip || !visible || locked || !box) return null;

  const finishDrag = () => {
    if (dragRef.current) edit.commitTransaction();
    dragRef.current = null;
    remeasure();
  };

  const applyScale = (scaleX: number, scaleY: number) => {
    edit.setClipTransform(
      clip.id,
      { scaleX: clampScale(scaleX), scaleY: clampScale(scaleY) },
      'Change Scale',
    );
  };

  const onPointerMove = (event: PointerEvent) => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame || event.pointerId !== drag.pointerId || !clip) return;

    const t0 = drag.startTransform;
    const uniform = t0.uniformScale;
    const handle = drag.handle;

    if (handle === 'n' || handle === 's' || handle === 'e' || handle === 'w') {
      if (handle === 'e' || handle === 'w') {
        const sign = handle === 'e' ? 1 : -1;
        const delta = (event.clientX - drag.startClientX) * sign;
        const ratio = Math.max(0.01, (drag.startHalfW * 2 + delta) / (drag.startHalfW * 2));
        if (uniform) {
          const next = t0.scaleX * ratio;
          applyScale(next, next);
        } else {
          applyScale(t0.scaleX * ratio, t0.scaleY);
        }
        return;
      }
      const sign = handle === 's' ? 1 : -1;
      const delta = (event.clientY - drag.startClientY) * sign;
      const ratio = Math.max(0.01, (drag.startHalfH * 2 + delta) / (drag.startHalfH * 2));
      if (uniform) {
        const next = t0.scaleY * ratio;
        applyScale(next, next);
      } else {
        applyScale(t0.scaleX, t0.scaleY * ratio);
      }
      return;
    }

    const layer = programLayerElement(frame, clip.id);
    const rect = layer ? measureLayerRect(layer, frame) : null;
    if (!rect) return;
    const frameBox = frame.getBoundingClientRect();
    const cx = rect.left + rect.width / 2 + frameBox.left;
    const cy = rect.top + rect.height / 2 + frameBox.top;
    const dist = Math.max(8, Math.hypot(event.clientX - cx, event.clientY - cy));
    const ratio = dist / drag.startDist;
    const nextX = t0.scaleX * ratio;
    const nextY = t0.scaleY * ratio;
    if (uniform) {
      applyScale(nextX, nextX);
    } else {
      applyScale(nextX, nextY);
    }
  };

  const startScale = (handle: ScaleHandle) => (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const frame = frameRef.current;
    if (!frame) return;

    const layer = programLayerElement(frame, clip.id);
    const rect = (layer ? measureLayerRect(layer, frame) : null) ?? box;
    const frameBox = frame.getBoundingClientRect();
    const cx = rect.left + rect.width / 2 + frameBox.left;
    const cy = rect.top + rect.height / 2 + frameBox.top;
    const startDist = Math.max(8, Math.hypot(event.clientX - cx, event.clientY - cy));

    dragRef.current = {
      pointerId: event.pointerId,
      handle,
      startTransform: clip.transform,
      startDist,
      startHalfW: Math.max(4, rect.width / 2),
      startHalfH: Math.max(4, rect.height / 2),
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    edit.beginTransaction('Change Scale');

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      finishDrag();
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const corners: { key: ScaleHandle; left: string; top: string; cursor: string }[] = [
    { key: 'nw', left: `${box.left}px`, top: `${box.top}px`, cursor: 'cursor-nwse-resize' },
    { key: 'ne', left: `${box.left + box.width}px`, top: `${box.top}px`, cursor: 'cursor-nesw-resize' },
    { key: 'sw', left: `${box.left}px`, top: `${box.top + box.height}px`, cursor: 'cursor-nesw-resize' },
    { key: 'se', left: `${box.left + box.width}px`, top: `${box.top + box.height}px`, cursor: 'cursor-nwse-resize' },
  ];

  const edgeHit = 6;

  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex }}>
      <div
        className="pointer-events-none absolute border-2 border-accent/90"
        style={{
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
        }}
        data-testid="program-transform-box"
      />
      <div
        className={cn(EDGE, 'cursor-ns-resize')}
        style={{
          left: box.left,
          top: box.top - edgeHit / 2,
          width: box.width,
          height: edgeHit,
        }}
        onPointerDown={startScale('n')}
        data-testid="program-transform-handle-n"
      />
      <div
        className={cn(EDGE, 'cursor-ns-resize')}
        style={{
          left: box.left,
          top: box.top + box.height - edgeHit / 2,
          width: box.width,
          height: edgeHit,
        }}
        onPointerDown={startScale('s')}
        data-testid="program-transform-handle-s"
      />
      <div
        className={cn(EDGE, 'cursor-ew-resize')}
        style={{
          left: box.left - edgeHit / 2,
          top: box.top,
          width: edgeHit,
          height: box.height,
        }}
        onPointerDown={startScale('w')}
        data-testid="program-transform-handle-w"
      />
      <div
        className={cn(EDGE, 'cursor-ew-resize')}
        style={{
          left: box.left + box.width - edgeHit / 2,
          top: box.top,
          width: edgeHit,
          height: box.height,
        }}
        onPointerDown={startScale('e')}
        data-testid="program-transform-handle-e"
      />
      {corners.map((c) => (
        <div
          key={c.key}
          className={cn(HANDLE, 'pointer-events-auto touch-none', c.cursor)}
          style={{ left: c.left, top: c.top }}
          onPointerDown={startScale(c.key)}
          data-testid={`program-transform-handle-${c.key}`}
        />
      ))}
    </div>
  );
}
