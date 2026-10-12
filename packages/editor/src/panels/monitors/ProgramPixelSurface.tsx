import {
  BLUR_REFERENCE_HEIGHT,
  cssBlurFilter,
  framesToSeconds,
  insetClipPathFromRegion,
  type BlurVideoEffect,
  type Clip,
  type Sequence,
  type MediaAssetId,
} from '@timeline/core';
import {
  PixelEffectsRenderer,
  PixelTracking,
  replacementAssetIds,
  replacementTimeSeconds,
  type PixelReplacement,
} from '@timeline/media';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useMediaState, useProjectState, useRuntime } from '../../runtime/context';

let sharedRenderer: PixelEffectsRenderer | null = null;

function renderer(): PixelEffectsRenderer {
  sharedRenderer ??= new PixelEffectsRenderer();
  return sharedRenderer;
}

/** Replacement video sync, in seconds: nudge the rate for small drift, seek only for large drift. */
const PAUSED_DRIFT = 0.02;
const RATE_DRIFT = 0.04;
const SEEK_DRIFT = 0.5;
const MAX_RATE_NUDGE = 0.08;

interface ReplacementSource {
  readonly assetId: string;
  readonly url: string;
  readonly isImage: boolean;
  readonly durationSeconds: number;
}

function insetRect(path: string, w: number, h: number): [number, number, number, number] | null {
  const match = /^inset\(([^)]+)\)$/.exec(path);
  if (!match?.[1]) return null;
  const [t = 0, r = 0, b = 0, l = 0] = match[1].trim().split(/\s+/).map((part) => Number.parseFloat(part) || 0);
  return [(l / 100) * w, (t / 100) * h, Math.max(1, w - ((l + r) / 100) * w), Math.max(1, h - ((t + b) / 100) * h)];
}

/**
 * Clip picture run through the keyer (Chroma Key, Screen Replace, Luma Key,
 * sharpen, vignette). The media element stays hidden and feeds the shader.
 */
export function ProgramPixelSurface({
  clip,
  sequence,
  playhead,
  playing,
  decodeW,
  decodeH,
  frameHeight,
  isImage,
  url,
  videoRef,
  sourceRef,
  regionalBlur,
  picking,
  onPick,
}: {
  readonly clip: Clip;
  readonly sequence: Sequence;
  readonly playhead: number;
  readonly playing: boolean;
  readonly decodeW: number;
  readonly decodeH: number;
  readonly frameHeight: number;
  readonly isImage: boolean;
  readonly url: string;
  readonly videoRef: (node: HTMLVideoElement | null) => void;
  readonly sourceRef: (node: HTMLVideoElement | HTMLImageElement | null) => void;
  readonly regionalBlur: BlurVideoEffect | null;
  readonly picking: boolean;
  readonly onPick: (u: number, v: number) => void;
}) {
  // The `playhead` prop only changes when the picture layers change during playback,
  // so per-frame work reads the playback clock directly.
  const playbackStore = useRuntime().stores.playback;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceNode = useRef<HTMLVideoElement | HTMLImageElement | null>(null);
  const replacementNodes = useRef(new Map<string, HTMLVideoElement | HTMLImageElement>());
  const tracking = useRef(new PixelTracking());
  const dirty = useRef(true);
  const live = useRef({ clip, sequence, playhead, playing, decodeW, decodeH, frameHeight, regionalBlur });
  live.current = { clip, sequence, playhead, playing, decodeW, decodeH, frameHeight, regionalBlur };

  const mediaAssets = useProjectState((s) => s.project.mediaAssets);
  const entries = useMediaState((s) => s.entries);
  const replacementKey = replacementAssetIds(clip.effects.video).join('|');
  const replacements = useMemo<ReplacementSource[]>(() => {
    const out: ReplacementSource[] = [];
    for (const assetId of (replacementKey ? replacementKey.split('|') : []) as MediaAssetId[]) {
      const asset = mediaAssets[assetId];
      const entry = entries[assetId];
      if (!asset || asset.kind === 'audio' || entry?.status !== 'online' || !entry.handle) continue;
      out.push({
        assetId,
        url: entry.handle.url,
        isImage: asset.kind === 'image',
        durationSeconds: asset.duration.value / Math.max(1, asset.duration.timescale),
      });
    }
    return out;
  }, [entries, mediaAssets, replacementKey]);
  const replacementsRef = useRef(replacements);
  replacementsRef.current = replacements;

  const bindSource = useCallback(
    (node: HTMLVideoElement | HTMLImageElement | null) => {
      sourceNode.current = node;
      sourceRef(node);
      if (node instanceof HTMLVideoElement || node === null) videoRef(node instanceof HTMLVideoElement ? node : null);
    },
    [sourceRef, videoRef],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const source = sourceNode.current;
    const state = live.current;
    if (!canvas || !source) return;
    const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    const ready = source instanceof HTMLVideoElement ? source.readyState >= 2 : source.complete;
    if (!ready || width <= 0 || height <= 0) return;

    const pictures = new Map<string, PixelReplacement>();
    for (const [assetId, el] of replacementNodes.current) {
      if (el instanceof HTMLVideoElement) {
        if (el.readyState >= 2 && el.videoWidth > 0) pictures.set(assetId, { source: el, width: el.videoWidth, height: el.videoHeight });
      } else if (el.complete && el.naturalWidth > 0) {
        pictures.set(assetId, { source: el, width: el.naturalWidth, height: el.naturalHeight });
      }
    }

    const w = Math.max(2, state.decodeW);
    const h = Math.max(2, state.decodeH);
    const out = renderer().render({
      source,
      sourceWidth: width,
      sourceHeight: height,
      outputWidth: w,
      outputHeight: h,
      effects: state.clip.effects.video,
      replacements: pictures,
      frame: playbackStore.getState().playhead,
      tracking: tracking.current,
    });
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const picture = out ?? source;
    ctx.filter = 'none';
    ctx.drawImage(picture, 0, 0, w, h);
    const blur = state.regionalBlur;
    const blurFilter = blur ? cssBlurFilter(blur.amount, state.frameHeight / BLUR_REFERENCE_HEIGHT) : undefined;
    if (blur?.region && blurFilter) {
      const rect = insetRect(insetClipPathFromRegion(blur.region), w, h);
      if (rect) {
        if (blur.region.internal) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(...rect);
          ctx.clip();
          ctx.clearRect(0, 0, w, h);
          ctx.filter = blurFilter;
          ctx.drawImage(picture, 0, 0, w, h);
          ctx.restore();
        } else {
          ctx.clearRect(0, 0, w, h);
          ctx.filter = blurFilter;
          ctx.drawImage(picture, 0, 0, w, h);
          ctx.filter = 'none';
          ctx.save();
          ctx.beginPath();
          ctx.rect(...rect);
          ctx.clip();
          ctx.clearRect(...rect);
          ctx.drawImage(picture, 0, 0, w, h);
          ctx.restore();
        }
        ctx.filter = 'none';
      }
    }
  }, [playbackStore]);

  const syncReplacements = useCallback(() => {
    const state = live.current;
    const { playhead, playing } = playbackStore.getState();
    const local = framesToSeconds(playhead - state.clip.start, state.sequence.frameRate);
    for (const item of replacementsRef.current) {
      const el = replacementNodes.current.get(item.assetId);
      if (!(el instanceof HTMLVideoElement) || el.readyState < 1) continue;
      const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : item.durationSeconds;
      const target = replacementTimeSeconds(local, duration);
      let drift = el.currentTime - target;
      if (duration > 0) {
        if (drift > duration / 2) drift -= duration;
        else if (drift < -duration / 2) drift += duration;
      }
      if (!playing) {
        if (!el.paused) el.pause();
        el.playbackRate = 1;
        if (!el.seeking && Math.abs(drift) > PAUSED_DRIFT) el.currentTime = target;
        continue;
      }
      if (el.paused) {
        if (Math.abs(drift) > PAUSED_DRIFT) el.currentTime = target;
        void el.play().catch(() => undefined);
        continue;
      }
      if (el.seeking) continue;
      if (Math.abs(drift) > SEEK_DRIFT) {
        el.playbackRate = 1;
        el.currentTime = target;
      } else if (Math.abs(drift) > RATE_DRIFT) {
        el.playbackRate = Math.min(1 + MAX_RATE_NUDGE, Math.max(1 - MAX_RATE_NUDGE, 1 - drift));
      } else if (el.playbackRate !== 1) {
        el.playbackRate = 1;
      }
    }
  }, [playbackStore]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      syncReplacements();
      if (!playbackStore.getState().playing && !dirty.current) return;
      dirty.current = false;
      draw();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [draw, syncReplacements, playbackStore]);

  useLayoutEffect(() => {
    dirty.current = true;
  }, [clip.effects.video, playhead, decodeW, decodeH, regionalBlur, replacements, playing]);

  useEffect(() => {
    const el = sourceNode.current;
    if (!el) return;
    const mark = () => {
      dirty.current = true;
    };
    const events = el instanceof HTMLVideoElement ? ['seeked', 'loadeddata', 'canplay'] : ['load'];
    for (const name of events) el.addEventListener(name, mark);
    return () => {
      for (const name of events) el.removeEventListener(name, mark);
    };
  }, [url, isImage]);

  useEffect(() => {
    tracking.current.reset();
  }, [clip.id]);

  const bindReplacement = useCallback(
    (assetId: string) => (node: HTMLVideoElement | HTMLImageElement | null) => {
      const map = replacementNodes.current;
      const previous = map.get(assetId);
      if (previous && previous !== node) {
        previous.onload = null;
        if (previous instanceof HTMLVideoElement) {
          previous.onseeked = null;
          previous.onloadeddata = null;
        }
      }
      if (!node) {
        map.delete(assetId);
        return;
      }
      map.set(assetId, node);
      const mark = () => {
        dirty.current = true;
      };
      if (node instanceof HTMLVideoElement) {
        node.onseeked = mark;
        node.onloadeddata = mark;
      } else node.onload = mark;
    },
    [],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!picking || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    const u = target.clientWidth > 0 ? event.nativeEvent.offsetX / target.clientWidth : 0.5;
    const v = target.clientHeight > 0 ? event.nativeEvent.offsetY / target.clientHeight : 0.5;
    onPick(Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v)));
  };

  const hiddenClass = 'pointer-events-none absolute inset-0 h-full w-full object-fill opacity-0';
  return (
    <div className="relative h-full w-full">
      {isImage ? (
        <img ref={bindSource} src={url} alt="" draggable={false} className={hiddenClass} decoding="async" />
      ) : (
        <video ref={bindSource} muted playsInline preload="auto" width={decodeW} height={decodeH} className={hiddenClass} />
      )}
      {replacements.map((item) =>
        item.isImage ? (
          <img key={item.assetId} ref={bindReplacement(item.assetId)} src={item.url} alt="" className="hidden" />
        ) : (
          <video
            key={item.assetId}
            ref={bindReplacement(item.assetId)}
            src={item.url}
            muted
            playsInline
            loop
            preload="auto"
            className="pointer-events-none absolute h-px w-px opacity-0"
          />
        ),
      )}
      <canvas
        ref={canvasRef}
        data-key-surface={clip.id}
        onPointerDown={onPointerDown}
        className={
          picking
            ? 'pointer-events-auto absolute inset-0 h-full w-full cursor-crosshair'
            : 'pointer-events-none absolute inset-0 h-full w-full'
        }
      />
    </div>
  );
}
