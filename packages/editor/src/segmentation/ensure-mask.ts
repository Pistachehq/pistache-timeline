import {
  applyManualStrokes,
  smartBackgroundOf,
  type AlphaMask,
  type Clip,
  type VideoEffect,
} from '@timeline/core';
import { type SmartMaskFrame } from '@timeline/media';
import { clipSourceFrame } from './analyze-clip';
import { nearestMask, peekMask, putMask } from './mask-cache';
import { bitmapFromElement, maxEdgeForQuality } from './capture-frame';
import { segmentFrame } from './segment-client';

const inflight = new Map<string, Promise<AlphaMask | null>>();

export function maskForClipFrame(
  effect: VideoEffect & { kind: 'smart-background' },
  sourceFrame: number,
): AlphaMask | null {
  const exact = peekMask(effect.cacheId, sourceFrame);
  if (exact) return applyManualStrokes(exact, effect, sourceFrame);
  const hold = Math.round(1 + (effect.temporalStability / 100) * 8);
  const near = nearestMask(effect.cacheId, sourceFrame, hold);
  if (!near) return null;
  return applyManualStrokes(near.mask, effect, sourceFrame);
}

export async function inferMaskForSource(
  effect: VideoEffect & { kind: 'smart-background' },
  sourceFrame: number,
  bitmap: ImageBitmap,
  signal: AbortSignal,
  onStatus: (message: string) => void,
): Promise<AlphaMask> {
  const key = `${effect.cacheId}:${sourceFrame}`;
  const pending = inflight.get(key);
  if (pending) {
    bitmap.close();
    const ready = await pending;
    if (ready) return ready;
  }
  const run = segmentFrame({
    bitmap,
    keepPrompt: effect.keepPrompt,
    removePrompt: effect.removePrompt,
    points: effect.points,
    boxes: effect.boxes,
    sourceFrame,
    quality: effect.quality,
    signal,
    onStatus,
  }).then((mask) => {
    putMask(effect.cacheId, sourceFrame, mask);
    return mask;
  });
  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

export async function captureAndInfer(
  source: CanvasImageSource,
  width: number,
  height: number,
  effect: VideoEffect & { kind: 'smart-background' },
  sourceFrame: number,
  signal: AbortSignal,
  onStatus: (message: string) => void,
): Promise<AlphaMask> {
  const bitmap = await bitmapFromElement(source, width, height, maxEdgeForQuality(effect.quality));
  return inferMaskForSource(effect, sourceFrame, bitmap, signal, onStatus);
}

export async function resolveExportMask(clip: Clip, sequenceFrame: number): Promise<SmartMaskFrame | null> {
  const effect = smartBackgroundOf(clip.effects.video);
  if (!effect || !effect.cacheId) return null;
  const sourceFrame = clipSourceFrame(clip, sequenceFrame);
  const mask = maskForClipFrame(effect, sourceFrame);
  if (!mask) return null;
  return { data: mask.data, width: mask.width, height: mask.height };
}
