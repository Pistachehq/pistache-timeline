import { detectKeyColor, sampleColorAt, type ClipId, type KeyPreference } from '@timeline/core';

export interface SampledPixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

type SourceElement = HTMLVideoElement | HTMLImageElement;

const sources = new Map<ClipId, () => SourceElement | null>();
const SAMPLE_WIDTH = 256;
let sampleCanvas: HTMLCanvasElement | null = null;

/** The Program monitor registers the media element that shows each clip, so key colors can be read from it. */
export function registerKeySource(clipId: ClipId, source: () => SourceElement | null): () => void {
  sources.set(clipId, source);
  return () => {
    if (sources.get(clipId) === source) sources.delete(clipId);
  };
}

function ready(el: SourceElement): { width: number; height: number } | null {
  if (el instanceof HTMLVideoElement) {
    return el.readyState >= 2 && el.videoWidth > 0 ? { width: el.videoWidth, height: el.videoHeight } : null;
  }
  return el.complete && el.naturalWidth > 0 ? { width: el.naturalWidth, height: el.naturalHeight } : null;
}

/** Unprocessed pixels of the clip as it shows in the Program monitor, or `null` when it is not on screen. */
export function sampleClipPixels(clipId: ClipId): SampledPixels | null {
  const el = sources.get(clipId)?.();
  if (!el) return null;
  const size = ready(el);
  if (!size) return null;
  sampleCanvas ??= document.createElement('canvas');
  const width = Math.min(SAMPLE_WIDTH, size.width);
  const height = Math.max(1, Math.round((width * size.height) / size.width));
  sampleCanvas.width = width;
  sampleCanvas.height = height;
  const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(el, 0, 0, width, height);
    return { data: ctx.getImageData(0, 0, width, height).data, width, height };
  } catch {
    return null;
  }
}

/** Color under a normalized point of the clip picture. */
export function pickClipColor(clipId: ClipId, u: number, v: number): string | null {
  const pixels = sampleClipPixels(clipId);
  if (!pixels) return null;
  return sampleColorAt(pixels.data, pixels.width, pixels.height, u * pixels.width - 0.5, v * pixels.height - 0.5, 2);
}

/** Dominant screen green or blue of the clip at the playhead. */
export function detectClipKeyColor(clipId: ClipId, preference: KeyPreference): string | null {
  const pixels = sampleClipPixels(clipId);
  if (!pixels) return null;
  return detectKeyColor(pixels.data, pixels.width, pixels.height, preference);
}
