import {
  findTrack,
  getStackedVideoClipsAt,
  TRANSFORM_LIMITS,
  type Clip,
  type ClipId,
  type Sequence,
} from '@timeline/core';
import { clamp } from '@timeline/shared';
import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useElementSize } from '../../hooks/use-element-size';
import { sourceTimeForFrame } from '../../playback/frame-math';
import { useMediaState, usePlaybackState, useProjectState, useRuntime, useSelectionState } from '../../runtime/context';
import { hitTestProgramClipAt, letterboxMediaSize, programClipWrapperStyle } from './program-clip-layout';
import { ProgramTransformOverlay } from './ProgramTransformOverlay';

const LAYER_Z = 10;

interface LayerProps {
  readonly clip: Clip;
  readonly sequence: Sequence;
  readonly stackIndex: number;
  readonly playhead: number;
  readonly playing: boolean;
  readonly frameWidth: number;
  readonly frameHeight: number;
}

function CompositeLayer({
  clip,
  sequence,
  stackIndex,
  playhead,
  playing,
  frameWidth,
  frameHeight,
}: LayerProps) {
  const asset = useProjectState((s) => s.project.mediaAssets[clip.assetId]);
  const entry = useMediaState((s) => s.entries[clip.assetId]);
  const selected = useSelectionState((s) => s.clipIds.includes(clip.id));
  const videoRef = useRef<HTMLVideoElement>(null);
  const url = entry?.status === 'online' && entry.handle ? entry.handle.url : null;
  const isImage = asset?.kind === 'image';

  const mediaW = asset?.resolution?.width ?? 0;
  const mediaH = asset?.resolution?.height ?? 0;
  const box = letterboxMediaSize(frameWidth, frameHeight, mediaW, mediaH);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || isImage || !url) return;
    if (el.src !== url) {
      el.src = url;
      el.load();
    }
  }, [isImage, url]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || isImage || !url) return;
    const sourceSeconds = sourceTimeForFrame(clip, playhead, sequence.frameRate);
    if (Math.abs(el.currentTime - sourceSeconds) < 0.03) return;
    el.currentTime = sourceSeconds;
  }, [clip, isImage, playhead, sequence.frameRate, url]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || isImage || !url) return;
    if (playing) void el.play().catch(() => undefined);
    else el.pause();
  }, [isImage, playing, url]);

  if (!asset || !url || box.width <= 0 || box.height <= 0) return null;

  const wrapperStyle = {
    ...programClipWrapperStyle(clip, sequence, frameWidth, frameHeight, box.width, box.height),
    zIndex: (stackIndex + 1) * LAYER_Z,
  };

  const mediaClass = 'pointer-events-none block h-full w-full object-fill';

  return (
    <div
      data-program-layer={clip.id}
      className={'pointer-events-none absolute' + (selected ? ' ring-1 ring-accent/40' : '')}
      style={wrapperStyle}
    >
      {isImage ? (
        <img src={url} alt="" draggable={false} className={mediaClass} />
      ) : (
        <video ref={videoRef} muted playsInline className={mediaClass} />
      )}
    </div>
  );
}

/** Bottom-to-top video/image layers for picture-in-picture compositing. */
export function ProgramCompositeLayers({ sequence }: { readonly sequence: Sequence }) {
  const runtime = useRuntime();
  const { edit } = runtime.actions;
  const containerRef = useRef<HTMLDivElement>(null);
  const { width: frameWidth, height: frameHeight } = useElementSize(containerRef);
  const playhead = usePlaybackState((s) => s.playhead);
  const playing = usePlaybackState((s) => s.playing);
  const selectedIds = useSelectionState((s) => s.clipIds);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const stack = useMemo(() => getStackedVideoClipsAt(sequence, playhead), [sequence, playhead]);

  const dragRef = useRef<{
    clipId: ClipId;
    pointerId: number;
    startX: number;
    startY: number;
    startTransform: Clip['transform'];
  } | null>(null);

  const seqScale = useMemo(() => {
    const seq = sequence.resolution;
    if (frameWidth <= 0 || frameHeight <= 0) return { x: 1, y: 1 };
    return { x: seq.width / frameWidth, y: seq.height / frameHeight };
  }, [frameWidth, frameHeight, sequence.resolution]);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    const frame = containerRef.current;
    if (!frame) return;
    const hitId = hitTestProgramClipAt(event.clientX, event.clientY, frame, stack);
    if (!hitId) return;
    event.preventDefault();
    event.stopPropagation();

    const hit = stack.find(({ clip }) => clip.id === hitId);
    if (!hit) return;
    const track = findTrack(sequence, hit.clip.trackId);
    if (track?.locked) return;

    runtime.stores.selection.getState().selectClips([hitId]);

    const clip = hit.clip;
    dragRef.current = {
      clipId: hitId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTransform: clip.transform,
    };
    edit.beginTransaction('Move Clip');

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || ev.pointerId !== drag.pointerId) return;
      const dx = (ev.clientX - drag.startX) * seqScale.x;
      const dy = (ev.clientY - drag.startY) * seqScale.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      edit.setClipTransform(
        drag.clipId,
        {
          positionX: clamp(
            drag.startTransform.positionX + dx,
            TRANSFORM_LIMITS.position.min,
            TRANSFORM_LIMITS.position.max,
          ),
          positionY: clamp(
            drag.startTransform.positionY + dy,
            TRANSFORM_LIMITS.position.min,
            TRANSFORM_LIMITS.position.max,
          ),
        },
        'Change Position',
      );
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      dragRef.current = null;
      edit.commitTransaction();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const selectedStackIndex = selectedId ? stack.findIndex(({ clip }) => clip.id === selectedId) : -1;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 cursor-default"
      onPointerDown={onPointerDown}
      data-testid="program-composite"
    >
      {stack.map(({ clip }, index) => (
        <CompositeLayer
          key={clip.id}
          clip={clip}
          sequence={sequence}
          stackIndex={index}
          playhead={playhead}
          playing={playing}
          frameWidth={frameWidth}
          frameHeight={frameHeight}
        />
      ))}
      {selectedId && selectedStackIndex >= 0 ? (
        <ProgramTransformOverlay
          sequence={sequence}
          frameRef={containerRef}
          playhead={playhead}
          clipId={selectedId}
          zIndex={(selectedStackIndex + 1) * LAYER_Z + 5}
        />
      ) : null}
    </div>
  );
}
