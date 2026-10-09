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
    startTransform: Clip['transform'];
    startDist: number;
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

  const onPointerMove = (event: PointerEvent) => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame || event.pointerId !== drag.pointerId) return;

    const layer = programLayerElement(frame, clip.id);
    const rect = layer ? measureLayerRect(layer, frame) : null;
    if (!rect) return;
    const frameBox = frame.getBoundingClientRect();
    const cx = rect.left + rect.width / 2 + frameBox.left;
    const cy = rect.top + rect.height / 2 + frameBox.top;
    const dist = Math.max(8, Math.hypot(event.clientX - cx, event.clientY - cy));
    const ratio = dist / drag.startDist;
    edit.setClipTransform(
      clip.id,
      {
        scale: clamp(
          drag.startTransform.scale * ratio,
          TRANSFORM_LIMITS.scale.min,
          TRANSFORM_LIMITS.scale.max,
        ),
      },
      'Change Scale',
    );
  };

  const startScale = (event: ReactPointerEvent) => {
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
      startTransform: clip.transform,
      startDist,
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

  const corners: { key: string; left: string; top: string; cursor: string }[] = [
    { key: 'nw', left: `${box.left}px`, top: `${box.top}px`, cursor: 'cursor-nwse-resize' },
    { key: 'ne', left: `${box.left + box.width}px`, top: `${box.top}px`, cursor: 'cursor-nesw-resize' },
    { key: 'sw', left: `${box.left}px`, top: `${box.top + box.height}px`, cursor: 'cursor-nesw-resize' },
    { key: 'se', left: `${box.left + box.width}px`, top: `${box.top + box.height}px`, cursor: 'cursor-nwse-resize' },
  ];

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
      {corners.map((c) => (
        <div
          key={c.key}
          className={cn(HANDLE, 'pointer-events-auto', c.cursor)}
          style={{ left: c.left, top: c.top }}
          onPointerDown={startScale}
          data-testid={`program-transform-handle-${c.key}`}
        />
      ))}
    </div>
  );
}
