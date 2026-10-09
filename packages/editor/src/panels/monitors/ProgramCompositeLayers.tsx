import {
  cssBlurFilter,
  findTrack,
  getBlurVideoEffect,
  getStackedVideoClipsAt,
  insetClipPathFromRegion,
  isRegionalBlurEffect,
  TRANSFORM_LIMITS,
  type ActiveVideoClip,
  type Clip,
  type ClipId,
  type Sequence,
} from '@timeline/core';
import { clamp } from '@timeline/shared';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useElementSize } from '../../hooks/use-element-size';
import { playbackDecodeFactor, programVideoDecodeSize } from '../../playback/playback-decode';
import { sourceTimeForFrame } from '../../playback/frame-math';
import {
  useMediaState,
  usePlaybackState,
  useProjectState,
  useRuntime,
  useSelectionState,
  useUiState,
} from '../../runtime/context';
import { hitTestProgramClipAt, letterboxMediaSize, programClipWrapperStyle } from './program-clip-layout';
import { ProgramBlurOverlay } from './ProgramBlurOverlay';
import { ProgramCropOverlay } from './ProgramCropOverlay';
import { ProgramTransformOverlay } from './ProgramTransformOverlay';

const LAYER_Z = 10;
const SEEK_EPSILON = 0.05;
const PLAYBACK_DRIFT = 0.22;

type VideoRegistry = Map<ClipId, HTMLVideoElement>;

function syncStackVideos(
  stack: readonly ActiveVideoClip[],
  sequence: Sequence,
  playhead: number,
  videos: VideoRegistry,
  playing: boolean,
  assets: Readonly<Record<string, { kind: string; hasVideo: boolean } | undefined>>,
): void {
  for (const { clip } of stack) {
    const el = videos.get(clip.id);
    if (!el) continue;
    const asset = assets[clip.assetId];
    if (!asset || asset.kind === 'image' || !asset.hasVideo) continue;

    el.muted = true;
    const seconds = sourceTimeForFrame(clip, playhead, sequence.frameRate);

    if (playing) {
      if (el.paused) {
        if (Math.abs(el.currentTime - seconds) >= SEEK_EPSILON) el.currentTime = seconds;
        void el.play().catch(() => undefined);
      } else if (Math.abs(el.currentTime - seconds) > PLAYBACK_DRIFT) {
        el.currentTime = seconds;
      }
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - seconds) >= SEEK_EPSILON) el.currentTime = seconds;
    }
  }
}

interface LayerProps {
  readonly clip: Clip;
  readonly sequence: Sequence;
  readonly playhead: number;
  readonly stackIndex: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly decodeFactor: number;
  readonly registerVideo: (clipId: ClipId, el: HTMLVideoElement | null) => void;
}

function CompositeLayer({
  clip,
  sequence,
  playhead,
  stackIndex,
  frameWidth,
  frameHeight,
  decodeFactor,
  registerVideo,
}: LayerProps) {
  const asset = useProjectState((s) => s.project.mediaAssets[clip.assetId]);
  const entry = useMediaState((s) => s.entries[clip.assetId]);
  const selected = useSelectionState((s) => s.clipIds.includes(clip.id));
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const blurCopyRef = useRef<HTMLVideoElement | null>(null);
  const blurEffect = getBlurVideoEffect(clip.effects.video);
  const regionalBlur = blurEffect && blurEffect.region && isRegionalBlurEffect(blurEffect) ? blurEffect : null;
  const url = entry?.status === 'online' && entry.handle ? entry.handle.url : null;
  const isImage = asset?.kind === 'image';

  const mediaW = asset?.resolution?.width ?? 0;
  const mediaH = asset?.resolution?.height ?? 0;
  const box = letterboxMediaSize(frameWidth, frameHeight, mediaW, mediaH);
  const seq = sequence.resolution;
  const decode = programVideoDecodeSize(seq.width, seq.height, mediaW, mediaH, decodeFactor);

  const bindVideo = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      registerVideo(clip.id, node);
    },
    [clip.id, registerVideo],
  );

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
    if (!el || isImage) return;
    if (el.width !== decode.width || el.height !== decode.height) {
      el.width = decode.width;
      el.height = decode.height;
    }
  }, [decode.height, decode.width, isImage, decodeFactor]);

  useEffect(() => {
    const copy = blurCopyRef.current;
    const main = videoRef.current;
    if (!copy || !main || !regionalBlur) return;
    const sync = () => {
      if (main.src && copy.src !== main.src) copy.src = main.src;
      if (Number.isFinite(main.currentTime) && Math.abs(copy.currentTime - main.currentTime) > 0.08) {
        copy.currentTime = main.currentTime;
      }
      if (main.paused) copy.pause();
      else void copy.play().catch(() => undefined);
    };
    sync();
    main.addEventListener('seeked', sync);
    main.addEventListener('play', sync);
    main.addEventListener('pause', sync);
    return () => {
      main.removeEventListener('seeked', sync);
      main.removeEventListener('play', sync);
      main.removeEventListener('pause', sync);
    };
  }, [regionalBlur, url, playhead]);

  if (!asset || !url || box.width <= 0 || box.height <= 0) return null;

  const wrapperStyle = {
    ...programClipWrapperStyle(clip, sequence, playhead, frameWidth, frameHeight, box.width, box.height),
    zIndex: (stackIndex + 1) * LAYER_Z,
  };

  const mediaClass = 'pointer-events-none block h-full w-full object-fill';
  const blurFilter = regionalBlur ? cssBlurFilter(regionalBlur.amount) : undefined;
  const maskPath = regionalBlur?.region ? insetClipPathFromRegion(regionalBlur.region) : undefined;

  const imageEl = <img src={url} alt="" draggable={false} className={mediaClass} decoding="async" />;
  const videoEl = (
    <video
      ref={bindVideo}
      muted
      playsInline
      preload="auto"
      className={mediaClass}
      width={decode.width}
      height={decode.height}
    />
  );
  const imageCopy = <img src={url} alt="" draggable={false} className={mediaClass} decoding="async" />;
  const videoCopy = (
    <video
      ref={blurCopyRef}
      muted
      playsInline
      preload="auto"
      className={mediaClass}
      width={decode.width}
      height={decode.height}
    />
  );

  let mediaBody: ReactNode;
  if (regionalBlur && blurFilter && maskPath && regionalBlur.region) {
    const sharp = isImage ? imageEl : videoEl;
    const copy = isImage ? imageCopy : videoCopy;
    if (regionalBlur.region.internal) {
      mediaBody = (
        <div className="relative h-full w-full">
          {sharp}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: maskPath }}>
            <div className="h-full w-full" style={{ filter: blurFilter }}>
              {copy}
            </div>
          </div>
        </div>
      );
    } else {
      mediaBody = (
        <div className="relative h-full w-full">
          <div className="h-full w-full" style={{ filter: blurFilter }}>
            {sharp}
          </div>
          <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: maskPath }}>
            {copy}
          </div>
        </div>
      );
    }
  } else {
    mediaBody = isImage ? imageEl : videoEl;
  }

  return (
    <div
      data-program-layer={clip.id}
      className={'pointer-events-none absolute' + (selected ? ' ring-1 ring-accent/40' : '')}
      style={wrapperStyle}
    >
      {mediaBody}
    </div>
  );
}

/** Bottom-to-top video/image layers for picture-in-picture compositing. */
export function ProgramCompositeLayers({ sequence }: { readonly sequence: Sequence }) {
  const runtime = useRuntime();
  const { edit } = runtime.actions;
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRegistry = useRef<VideoRegistry>(new Map());
  const { width: frameWidth, height: frameHeight } = useElementSize(containerRef);
  const playhead = usePlaybackState((s) => s.playhead);
  const playing = usePlaybackState((s) => s.playing);
  const decodeFactor = playbackDecodeFactor(useUiState((s) => s.playbackDecodeScale));
  const selectedIds = useSelectionState((s) => s.clipIds);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const cropEditId = useUiState((s) => s.clipCropEditId);
  const blurEditId = useUiState((s) => s.clipBlurEditId);
  const setCropEditId = runtime.stores.ui.getState().setClipCropEditId;
  const setBlurEditId = runtime.stores.ui.getState().setClipBlurEditId;

  useEffect(() => {
    if (cropEditId && selectedId !== cropEditId) setCropEditId(null);
  }, [cropEditId, selectedId, setCropEditId]);
  useEffect(() => {
    if (blurEditId && selectedId !== blurEditId) setBlurEditId(null);
  }, [blurEditId, selectedId, setBlurEditId]);
  const stack = useMemo(() => getStackedVideoClipsAt(sequence, playhead), [sequence, playhead]);
  const mediaAssets = useProjectState((s) => s.project.mediaAssets);

  const registerVideo = useCallback((clipId: ClipId, el: HTMLVideoElement | null) => {
    if (el) videoRegistry.current.set(clipId, el);
    else videoRegistry.current.delete(clipId);
  }, []);

  const syncVideos = useCallback(
    (frame: number, isPlaying: boolean) => {
      syncStackVideos(stack, sequence, frame, videoRegistry.current, isPlaying, mediaAssets);
    },
    [mediaAssets, sequence, stack],
  );

  useEffect(() => {
    syncVideos(playhead, playing);
  }, [playhead, playing, syncVideos]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      syncVideos(runtime.stores.playback.getState().playhead, true);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, runtime, syncVideos]);

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
          playhead={playhead}
          stackIndex={index}
          frameWidth={frameWidth}
          frameHeight={frameHeight}
          decodeFactor={decodeFactor}
          registerVideo={registerVideo}
        />
      ))}
      {cropEditId ? (
        <ProgramCropOverlay
          sequence={sequence}
          frameRef={containerRef}
          playhead={playhead}
          clipId={cropEditId}
          zIndex={(selectedStackIndex + 1) * LAYER_Z + 20}
        />
      ) : null}
      {blurEditId ? (
        <ProgramBlurOverlay
          sequence={sequence}
          frameRef={containerRef}
          playhead={playhead}
          clipId={blurEditId}
          zIndex={(selectedStackIndex + 1) * LAYER_Z + 21}
        />
      ) : null}
      {selectedId && selectedStackIndex >= 0 && !cropEditId && !blurEditId ? (
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
