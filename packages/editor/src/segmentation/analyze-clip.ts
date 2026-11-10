import {
  framesToSeconds,
  getClipDuration,
  sequenceFrameForClipMedia,
  sourceMediaFrame,
  type Clip,
  type FrameRate,
  type VideoEffect,
} from '@timeline/core';
import { putMask } from './mask-cache';
import { bitmapFromElement, maxEdgeForQuality, seekVideo } from './capture-frame';
import { propagateMask, segmentFrame } from './segment-client';

export function clipSourceFrame(clip: Clip, sequenceFrame: number): number {
  return sourceMediaFrame(clip, sequenceFrameForClipMedia(clip, sequenceFrame));
}

export function analysisStep(effect: VideoEffect & { kind: 'smart-background' }, clipFrames: number): number {
  const dense = effect.quality === 'final' ? 2 : 4;
  const sparse = Math.max(dense, Math.round(6 + ((100 - effect.temporalStability) / 100) * 10));
  return Math.min(Math.max(1, clipFrames - 1), sparse);
}

async function bitmapAtVideo(
  video: HTMLVideoElement,
  seconds: number,
  maxEdge: number,
  signal: AbortSignal,
): Promise<ImageBitmap> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  await seekVideo(video, seconds);
  if (video.videoWidth <= 0) throw new Error('The clip has no picture at this time.');
  return bitmapFromElement(video, video.videoWidth, video.videoHeight, maxEdge);
}

/**
 * Infers keyframes and warps the mask in between. Results land in the mask cache
 * keyed by source media frame.
 */
export async function analyzeClipSource(input: {
  readonly clip: Clip;
  readonly effect: VideoEffect & { kind: 'smart-background' };
  readonly frameRate: FrameRate;
  readonly url: string;
  readonly isImage: boolean;
  readonly fromSourceFrame: number;
  readonly toSourceFrame: number;
  readonly signal: AbortSignal;
  readonly onStatus: (message: string) => void;
}): Promise<void> {
  const { clip, effect } = input;
  const start = Math.max(clip.sourceIn, Math.min(input.fromSourceFrame, input.toSourceFrame));
  const end = Math.min(clip.sourceOut - 1, Math.max(input.fromSourceFrame, input.toSourceFrame));
  if (end < start) return;
  const maxEdge = maxEdgeForQuality(effect.quality);
  const duration = getClipDuration(clip);
  const step = analysisStep(effect, duration);

  if (input.isImage) {
    const image = await loadImage(input.url);
    const bitmap = await bitmapFromElement(image, image.naturalWidth, image.naturalHeight, maxEdge);
    const mask = await segmentFrame({
      bitmap,
      keepPrompt: effect.keepPrompt,
      removePrompt: effect.removePrompt,
      points: effect.points,
      boxes: effect.boxes,
      sourceFrame: clip.sourceIn,
      quality: effect.quality,
      signal: input.signal,
      onStatus: input.onStatus,
    });
    putMask(effect.cacheId, clip.sourceIn, mask);
    return;
  }

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = input.url;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('Could not open this clip for segmentation.'));
  });

  const direction = input.toSourceFrame >= input.fromSourceFrame ? 1 : -1;
  const frames: number[] = [];
  if (direction > 0) {
    for (let frame = start; frame <= end; frame += step) frames.push(frame);
    if (frames[frames.length - 1] !== end) frames.push(end);
  } else {
    for (let frame = end; frame >= start; frame -= step) frames.push(frame);
    if (frames[frames.length - 1] !== start) frames.push(start);
  }

  let prevBitmap: ImageBitmap | null = null;
  let prevMask = null as Awaited<ReturnType<typeof segmentFrame>> | null;
  let prevFrame = -1;
  try {
    for (let i = 0; i < frames.length; i++) {
      if (input.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const frame = frames[i]!;
      input.onStatus(`Analysing frame ${i + 1} of ${frames.length}…`);
      const seconds = framesToSeconds(frame + 0.5, input.frameRate);
      const bitmap = await bitmapAtVideo(video, seconds, maxEdge, input.signal);
      const inferred = await segmentFrame({
        bitmap,
        keepPrompt: effect.keepPrompt,
        removePrompt: effect.removePrompt,
        points: effect.points,
        boxes: effect.boxes,
        sourceFrame: frame,
        quality: effect.quality,
        signal: input.signal,
        onStatus: input.onStatus,
      });
      putMask(effect.cacheId, frame, inferred);

      if (prevBitmap && prevMask && prevFrame >= 0) {
        const gap = Math.abs(frame - prevFrame);
        for (let mid = 1; mid < gap; mid++) {
          const at = prevFrame + Math.sign(frame - prevFrame) * mid;
          const t = mid / gap;
          const prevClone = await createImageBitmap(prevBitmap);
          const nextClone = await bitmapAtVideo(video, framesToSeconds(at + 0.5, input.frameRate), maxEdge, input.signal);
          const warped = await propagateMask({
            prev: prevClone,
            next: nextClone,
            mask: prevMask,
            signal: input.signal,
            onStatus: input.onStatus,
          });
          putMask(effect.cacheId, at, warped);
          void t;
        }
      }
      prevBitmap?.close();
      prevBitmap = await bitmapAtVideo(video, seconds, maxEdge, input.signal);
      prevMask = inferred;
      prevFrame = frame;
    }
  } finally {
    prevBitmap?.close();
    video.src = '';
    video.load();
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not open this image for segmentation.'));
    image.src = url;
  });
}
