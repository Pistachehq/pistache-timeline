import {
  cssBlurFilter,
  findTrack,
  getClipEnd,
  playbackRateForSpeed,
  getBlurVideoEffect,
  insetClipPathFromRegion,
  isRegionalBlurEffect,
  TRANSFORM_LIMITS,
  type Clip,
  type ClipId,
  type Sequence,
} from '@timeline/core';
import { clamp } from '@timeline/shared';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useElementSize } from '../../hooks/use-element-size';
import { playbackDecodeFactor } from '../../playback/playback-decode';
import { sourceTimeForFrame } from '../../playback/frame-math';
import {
  useMediaState,
  usePlaybackState,
  useProjectState,
  useRuntime,
  useSelectionState,
  useUiState,
} from '../../runtime/context';
import {
  applyProgramClipStyle,
  hitTestProgramClipAt,
  letterboxMediaSize,
  programClipWrapperStyle,
  programLayerLive,
  programPictureKey,
  programPictureLayers,
  type ProgramLayerRole,
  type ProgramPictureLayer,
} from './program-clip-layout';
import { ProgramBlurOverlay } from './ProgramBlurOverlay';
import { ProgramCropOverlay } from './ProgramCropOverlay';
import { ProgramTextLayer } from './ProgramTextLayer';
import { ProgramTransformOverlay } from './ProgramTransformOverlay';

const LAYER_Z = 10;
const PAUSED_EPSILON = 0.02;
const PLAYBACK_DRIFT = 0.45;
const SEEK_GAP_MS = 48;

type VideoRegistry = Map<ClipId, HTMLVideoElement>;
type LayerRegistry = Map<ClipId, HTMLElement>;

const lastSeekAt = new WeakMap<HTMLVideoElement, number>();
const pendingSeek = new Map<HTMLVideoElement, { seconds: number; smooth: boolean }>();
let flushTimer = 0;

function applySeek(el: HTMLVideoElement, seconds: number, smooth: boolean): void {
  if (smooth && typeof el.fastSeek === 'function' && el.readyState >= 2) el.fastSeek(seconds);
  else el.currentTime = seconds;
}

function flushSeeks(): void {
  flushTimer = 0;
  const now = performance.now();
  for (const [el, pending] of pendingSeek) {
    pendingSeek.delete(el);
    if (Math.abs(el.currentTime - pending.seconds) < PAUSED_EPSILON) continue;
    lastSeekAt.set(el, now);
    applySeek(el, pending.seconds, pending.smooth);
  }
}

/** Coalesces seeks so a scrub or a drift correction does not flush the decoder every frame. */
function requestSeek(el: HTMLVideoElement, seconds: number, smooth: boolean): void {
  if (!Number.isFinite(seconds) || Math.abs(el.currentTime - seconds) < PAUSED_EPSILON) return;
  const now = performance.now();
  const previous = lastSeekAt.get(el) ?? 0;
  if (now - previous < SEEK_GAP_MS) {
    pendingSeek.set(el, { seconds, smooth });
    if (!flushTimer) flushTimer = window.setTimeout(flushSeeks, SEEK_GAP_MS);
    return;
  }
  lastSeekAt.set(el, now);
  pendingSeek.delete(el);
  applySeek(el, seconds, smooth);
}

function syncStackVideos(
  stack: readonly ProgramPictureLayer[],
  sequence: Sequence,
  playhead: number,
  videos: VideoRegistry,
  playing: boolean,
  assets: Readonly<Record<string, { kind: string; hasVideo: boolean } | undefined>>,
): void {
  for (const layer of stack) {
    const { clip } = layer;
    const el = videos.get(clip.id);
    if (!el || !clip.assetId) continue;
    const asset = assets[clip.assetId];
    if (!asset || asset.kind === 'image' || !asset.hasVideo) continue;

    el.muted = true;
    const rate = playbackRateForSpeed(clip.speed);
    if (Math.abs(el.playbackRate - rate) > 0.001) el.playbackRate = rate;
    el.preservesPitch = true;
    if (el.readyState < 1) continue;

    const live = programLayerLive(layer, playhead);
    if (!live) {
      const parkAt = playhead >= getClipEnd(clip) ? getClipEnd(clip) - 1 : clip.start;
      const seconds = sourceTimeForFrame(clip, parkAt, sequence.frameRate);
      const lead = playing && clip.start > playhead && clip.start - playhead <= 2;
      if (!lead) {
        if (!el.paused) el.pause();
        requestSeek(el, seconds, false);
        continue;
      }
      if (Math.abs(el.currentTime - seconds) > 0.12) requestSeek(el, seconds, false);
      if (el.paused) void el.play().catch(() => undefined);
      continue;
    }

    const seconds = sourceTimeForFrame(clip, playhead, sequence.frameRate);
    const drift = PLAYBACK_DRIFT * Math.max(1, rate);
    if (playing) {
      if (el.paused) {
        if (Math.abs(el.currentTime - seconds) >= PAUSED_EPSILON) requestSeek(el, seconds, false);
        void el.play().catch(() => undefined);
      } else if (Math.abs(el.currentTime - seconds) > drift) {
        requestSeek(el, seconds, true);
      }
    } else {
      if (!el.paused) el.pause();
      requestSeek(el, seconds, false);
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
  readonly role: ProgramLayerRole;
  readonly onDecoded: () => void;
  readonly registerVideo: (clipId: ClipId, el: HTMLVideoElement | null) => void;
  readonly registerLayer: (clipId: ClipId, el: HTMLElement | null) => void;
}

function CompositeLayer({
  clip,
  sequence,
  playhead,
  stackIndex,
  frameWidth,
  frameHeight,
  role,
  onDecoded,
  registerVideo,
  registerLayer,
}: LayerProps) {
  const hidden = role !== 'active';
  const assetId = clip.assetId;
  const asset = useProjectState((s) => (assetId ? s.project.mediaAssets[assetId] : undefined));
  const entry = useMediaState((s) => (assetId ? s.entries[assetId] : undefined));
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
  const decodeW = Math.max(2, Math.round(box.width));
  const decodeH = Math.max(2, Math.round(box.height));

  const bindRoot = useCallback(
    (node: HTMLDivElement | null) => {
      registerLayer(clip.id, node);
    },
    [clip.id, registerLayer],
  );

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
    el.muted = true;
    el.playsInline = true;
    el.preload = 'auto';
    if (el.getAttribute('src') !== url) el.src = url;
    const park = () => {
      if (role !== 'active') {
        const atFrame = role === 'recent' ? Math.max(clip.start, getClipEnd(clip) - 1) : clip.start;
        const at = sourceTimeForFrame(clip, atFrame, sequence.frameRate);
        if (Number.isFinite(el.currentTime) && Math.abs(el.currentTime - at) > PAUSED_EPSILON) el.currentTime = at;
      }
      if (el.readyState >= 2) onDecoded();
    };
    el.addEventListener('loadeddata', park);
    if (el.readyState >= 2) park();
    return () => el.removeEventListener('loadeddata', park);
  }, [clip, isImage, onDecoded, role, sequence.frameRate, url]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || isImage) return;
    if (el.width !== decodeW || el.height !== decodeH) {
      el.width = decodeW;
      el.height = decodeH;
    }
  }, [decodeH, decodeW, isImage]);

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
  }, [regionalBlur, url]);

  if (!asset || !url || box.width <= 0 || box.height <= 0) return null;

  const wrapperStyle = {
    ...programClipWrapperStyle(clip, sequence, playhead, frameWidth, frameHeight, box.width, box.height),
    zIndex: hidden ? 0 : (stackIndex + 1) * LAYER_Z,
    ...(hidden ? { opacity: 0 } : {}),
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
      width={decodeW}
      height={decodeH}
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
      width={decodeW}
      height={decodeH}
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
      ref={bindRoot}
      data-program-layer={clip.id}
      className={'pointer-events-none absolute' + (selected && !hidden ? ' ring-1 ring-accent/40' : '')}
      style={wrapperStyle}
      aria-hidden={hidden}
    >
      {mediaBody}
    </div>
  );
}

function usePictureFrame(sequence: Sequence): number {
  const runtime = useRuntime();
  const [frame, setFrame] = useState(() => runtime.stores.playback.getState().playhead);
  const keyRef = useRef('');

  useEffect(() => {
    const apply = (playhead: number, playing: boolean) => {
      const key = programPictureKey(sequence, playhead);
      if (!playing || key !== keyRef.current) {
        keyRef.current = key;
        setFrame((prev) => (prev === playhead ? prev : playhead));
      }
    };
    const state = runtime.stores.playback.getState();
    apply(state.playhead, state.playing);
    return runtime.stores.playback.subscribe((state) => {
      apply(state.playhead, state.playing);
    });
  }, [runtime, sequence]);

  return frame;
}

type PreviewAsset = {
  kind: string;
  hasVideo: boolean;
  resolution: { width: number; height: number } | null;
};

function videoWaiting(
  layers: readonly ProgramPictureLayer[],
  playhead: number,
  assets: Readonly<Record<string, PreviewAsset | undefined>>,
  videos: VideoRegistry,
): boolean {
  for (const layer of layers) {
    if (!programLayerLive(layer, playhead) || layer.clip.text || !layer.clip.assetId) continue;
    const asset = assets[layer.clip.assetId];
    if (!asset || asset.kind === 'image' || !asset.hasVideo) continue;
    const el = videos.get(layer.clip.id);
    if (!el || el.readyState < 2) return true;
  }
  return false;
}

function paintPicture(
  layers: readonly ProgramPictureLayer[],
  sequence: Sequence,
  playhead: number,
  frameW: number,
  frameH: number,
  assets: Readonly<Record<string, PreviewAsset | undefined>>,
  layerEls: LayerRegistry,
  videos: VideoRegistry,
): void {
  if (frameW <= 0 || frameH <= 0) return;
  const waiting = videoWaiting(layers, playhead, assets, videos);
  for (const layer of layers) {
    if (layer.clip.text) continue;
    const el = layerEls.get(layer.clip.id);
    if (!el) continue;
    const live = programLayerLive(layer, playhead);
    const asset = layer.clip.assetId ? assets[layer.clip.assetId] : undefined;
    const unready =
      live &&
      !!asset &&
      asset.kind !== 'image' &&
      asset.hasVideo &&
      (videos.get(layer.clip.id)?.readyState ?? 0) < 2;
    const hold = waiting && !live && layer.role === 'recent';
    const box = letterboxMediaSize(frameW, frameH, asset?.resolution?.width ?? 0, asset?.resolution?.height ?? 0);
    const sample = hold ? Math.max(layer.clip.start, getClipEnd(layer.clip) - 1) : playhead;
    applyProgramClipStyle(el, layer.clip, sequence, sample, frameW, frameH, box.width, box.height, unready || (!live && !hold));
  }
}

/** Bottom-to-top video/image layers for picture-in-picture compositing. */
export function ProgramCompositeLayers({ sequence }: { readonly sequence: Sequence }) {
  const runtime = useRuntime();
  const { edit } = runtime.actions;
  const outerRef = useRef<HTMLDivElement>(null);
  const videoRegistry = useRef<VideoRegistry>(new Map());
  const layerRegistry = useRef<LayerRegistry>(new Map());
  const { width: frameWidth, height: frameHeight } = useElementSize(outerRef);
  const pictureFrame = usePictureFrame(sequence);
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
  const layers = useMemo(() => programPictureLayers(sequence, pictureFrame), [sequence, pictureFrame]);
  const stack = useMemo(() => layers.filter((layer) => layer.role === 'active'), [layers]);
  const mediaAssets = useProjectState((s) => s.project.mediaAssets);
  const reduced = decodeFactor < 0.999 && frameWidth > 1 && frameHeight > 1;
  const stageW = reduced ? Math.max(1, Math.round(frameWidth * decodeFactor)) : frameWidth;
  const stageH = reduced ? Math.max(1, Math.round(frameHeight * decodeFactor)) : frameHeight;
  const scaleX = reduced && stageW > 0 ? frameWidth / stageW : 1;
  const scaleY = reduced && stageH > 0 ? frameHeight / stageH : 1;

  const layersRef = useRef(layers);
  layersRef.current = layers;
  const sequenceRef = useRef(sequence);
  sequenceRef.current = sequence;
  const stageSizeRef = useRef({ w: stageW, h: stageH });
  stageSizeRef.current = { w: stageW, h: stageH };
  const assetsRef = useRef(mediaAssets);
  assetsRef.current = mediaAssets;

  const registerVideo = useCallback((clipId: ClipId, el: HTMLVideoElement | null) => {
    if (el) videoRegistry.current.set(clipId, el);
    else videoRegistry.current.delete(clipId);
  }, []);

  const registerLayer = useCallback((clipId: ClipId, el: HTMLElement | null) => {
    if (el) layerRegistry.current.set(clipId, el);
    else layerRegistry.current.delete(clipId);
  }, []);

  const syncVideos = useCallback((frame: number, isPlaying: boolean) => {
    syncStackVideos(layersRef.current, sequenceRef.current, frame, videoRegistry.current, isPlaying, assetsRef.current);
  }, []);

  const paintNow = useCallback(() => {
    const { w, h } = stageSizeRef.current;
    paintPicture(
      layersRef.current,
      sequenceRef.current,
      runtime.stores.playback.getState().playhead,
      w,
      h,
      assetsRef.current,
      layerRegistry.current,
      videoRegistry.current,
    );
  }, [runtime]);

  useLayoutEffect(() => {
    syncVideos(pictureFrame, playing);
    paintNow();
  }, [paintNow, pictureFrame, playing, syncVideos]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const frame = runtime.stores.playback.getState().playhead;
      const { w, h } = stageSizeRef.current;
      syncVideos(frame, true);
      paintPicture(
        layersRef.current,
        sequenceRef.current,
        frame,
        w,
        h,
        assetsRef.current,
        layerRegistry.current,
        videoRegistry.current,
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, runtime, syncVideos]);

  const tool = useUiState((s) => s.tool);

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
    const frame = outerRef.current;
    if (!frame) return;
    const hitId = hitTestProgramClipAt(event.clientX, event.clientY, frame, stack);
    if (tool === 'text') {
      event.preventDefault();
      event.stopPropagation();
      const hit = hitId ? stack.find(({ clip }) => clip.id === hitId) : undefined;
      if (hit?.clip.text) {
        runtime.stores.selection.getState().selectClips([hit.clip.id]);
        runtime.stores.ui.getState().setTextEditingClipId(hit.clip.id);
        return;
      }
      const rect = frame.getBoundingClientRect();
      const nx = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5;
      const ny = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
      const positionX = (nx - 0.5) * sequence.resolution.width;
      const positionY = (ny - 0.5) * sequence.resolution.height;
      const track = [...sequence.videoTracks].reverse().find((item) => !item.locked);
      if (!track) {
        runtime.stores.ui.getState().notify('Unlock a video track to add text.', 'warning');
        return;
      }
      runtime.actions.edit.addTextClip({
        trackId: track.id,
        start: runtime.stores.playback.getState().playhead,
        positionX,
        positionY,
      });
      return;
    }
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

  let activeIndex = 0;

  return (
    <div
      ref={outerRef}
      className={tool === 'text' ? 'absolute inset-0 cursor-text overflow-hidden' : 'absolute inset-0 cursor-default overflow-hidden'}
      onPointerDown={onPointerDown}
      data-testid="program-composite"
    >
      <div
        className="pointer-events-none absolute left-0 top-0"
        style={{
          width: stageW,
          height: stageH,
          transform: reduced ? `scale(${scaleX}, ${scaleY})` : undefined,
          transformOrigin: 'top left',
        }}
      >
        {layers.map((layer) => {
          const index = layer.role === 'active' ? activeIndex++ : 0;
          if (layer.clip.text) {
            if (layer.role !== 'active') return null;
            return (
              <ProgramTextLayer
                key={layer.clip.id}
                clip={layer.clip}
                sequence={sequence}
                stackIndex={index}
                frameWidth={stageW}
                frameHeight={stageH}
                selected={selectedIds.includes(layer.clip.id)}
              />
            );
          }
          return (
            <CompositeLayer
              key={layer.clip.id}
              clip={layer.clip}
              sequence={sequence}
              playhead={pictureFrame}
              stackIndex={index}
              frameWidth={stageW}
              frameHeight={stageH}
              role={layer.role}
              onDecoded={paintNow}
              registerVideo={registerVideo}
              registerLayer={registerLayer}
            />
          );
        })}
      </div>
      {cropEditId ? (
        <ProgramCropOverlay
          sequence={sequence}
          frameRef={outerRef}
          playhead={pictureFrame}
          clipId={cropEditId}
          zIndex={(selectedStackIndex + 1) * LAYER_Z + 20}
        />
      ) : null}
      {blurEditId ? (
        <ProgramBlurOverlay
          sequence={sequence}
          frameRef={outerRef}
          playhead={pictureFrame}
          clipId={blurEditId}
          zIndex={(selectedStackIndex + 1) * LAYER_Z + 21}
        />
      ) : null}
      {selectedId && selectedStackIndex >= 0 && !cropEditId && !blurEditId ? (
        <ProgramTransformOverlay
          sequence={sequence}
          frameRef={outerRef}
          playhead={pictureFrame}
          clipId={selectedId}
          zIndex={(selectedStackIndex + 1) * LAYER_Z + 5}
        />
      ) : null}
    </div>
  );
}
