import {
  framesToSeconds,
  frameRateToNumber,
  getSequence,
  getStackedVideoClipsAt,
  sourceMediaFrame,
  type Clip,
  type FrameRate,
  type MediaAssetId,
  type Sequence,
} from '@timeline/core';
import { isAbortError, TimelineError, throwIfAborted } from '@timeline/shared';
import { ArrayBufferTarget as Mp4Target, Muxer as Mp4Muxer } from 'mp4-muxer';
import { ArrayBufferTarget as WebmTarget, Muxer as WebmMuxer } from 'webm-muxer';
import { type ExportOptions, type ExportRequest, type ExportResult } from '../../types';
import { waitForMediaEvent } from '../media-element';
import { type CanvasDrawable, drawGapFrame, drawStackedProgramFrame } from './compose-frame';
import { type BrowserExportContext } from './export-context';
import { chooseVideoEncoder, type ChosenVideoEncoder } from './export-codecs';
import { encodeMixedAudioToMuxer, EXPORT_AUDIO_SAMPLE_RATE, mixSequenceAudio } from './export-audio-mix';
import { getExportFrameCount, sequenceFrameForOutputFrame, validateExportOutput } from './export-output';
import { downloadExportBlob } from './save-export';
import { openSequentialVideo, type SequentialFrameSource } from './sequential-video';

export type { BrowserExportContext } from './export-context';

function sourceTimeForFrame(clip: Clip, frame: number, rate: FrameRate): number {
  return framesToSeconds(sourceMediaFrame(clip, frame) + 0.5, rate);
}

async function seekVideoForExport(video: HTMLVideoElement, seconds: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (Math.abs(video.currentTime - seconds) < 0.0005) return;
  video.pause();
  const seeked = waitForMediaEvent(video, 'seeked', { signal, timeoutMs: 60_000 });
  video.currentTime = seconds;
  await seeked;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function loadImage(handle: { url: string }, signal?: AbortSignal): Promise<HTMLImageElement> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new TimelineError('UNSUPPORTED_MEDIA', 'Could not load an image for export.'));
    if (!handle.url.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.src = handle.url;
  });
}

async function loadVideo(handle: { url: string }, signal?: AbortSignal): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  if (!handle.url.startsWith('blob:')) video.crossOrigin = 'anonymous';
  video.src = handle.url;
  await waitForMediaEvent(video, 'loadedmetadata', { signal, timeoutMs: 120_000 });
  await waitForMediaEvent(video, 'canplay', { signal, timeoutMs: 120_000 });
  return video;
}

const ENCODE_QUEUE_LIMIT = 8;

async function waitForEncodeQueue(encoder: VideoEncoder, signal?: AbortSignal): Promise<void> {
  while (encoder.encodeQueueSize >= ENCODE_QUEUE_LIMIT) {
    throwIfAborted(signal);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function drawableFromImage(image: HTMLImageElement): CanvasDrawable {
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    draw: (ctx, x, y, w, h) => {
      ctx.drawImage(image, x, y, w, h);
    },
  };
}

function drawableFromVideo(video: HTMLVideoElement): CanvasDrawable {
  return {
    width: video.videoWidth,
    height: video.videoHeight,
    draw: (ctx, x, y, w, h) => {
      ctx.drawImage(video, x, y, w, h);
    },
  };
}

async function blobFromUrl(url: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(url, signal ? { signal } : {});
  if (!response.ok) {
    throw new TimelineError('MEDIA_UNAVAILABLE', 'Could not read a media file for export.');
  }
  return response.blob();
}

function uniqueVideoAssetIds(sequence: Sequence): MediaAssetId[] {
  const ids = new Set<MediaAssetId>();
  for (const clip of Object.values(sequence.clips)) {
    if (clip.assetId) ids.add(clip.assetId);
  }
  return [...ids];
}

function throwEncoderFailure(error: Error | null): void {
  if (error !== null) throw error;
}

function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex -- strip illegal filename characters
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : 'export';
}

/**
 * Renders the active sequence with WebCodecs. Fast exports use H.264 (hardware
 * when the device can); otherwise VP9 or VP8 in WebM. Video is decoded in order
 * and the encoder stays a few frames ahead of the compositor.
 */
export async function exportSequenceToWebm(
  request: ExportRequest,
  context: BrowserExportContext,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const { signal, onProgress } = options;
  throwIfAborted(signal);

  if (request.format.container !== 'webm' && request.format.container !== 'mp4') {
    throw new TimelineError(
      'NOT_IMPLEMENTED',
      `Export to ${request.format.container} is not supported in the browser yet. Choose WebM or MP4.`,
    );
  }

  const sequence = getSequence(request.project, request.sequenceId);
  if (!sequence) throw new TimelineError('NOT_FOUND', 'The sequence to export does not exist.');

  validateExportOutput(request.output);
  const { width, height, frameRate: outputFrameRate } = request.output;
  const outputFrames = getExportFrameCount(sequence, outputFrameRate);
  if (outputFrames <= 0) {
    throw new TimelineError('INVALID_ARGUMENT', 'There is nothing to export: the sequence has no clips.');
  }

  onProgress?.({ phase: 'preparing', progress: 0 });

  const fps = frameRateToNumber(outputFrameRate);
  const frameDurationUs = Math.round(1_000_000 / fps);
  const keyFrameInterval = Math.max(1, Math.round(fps));
  const drawOptions = { width, height, sequence };

  const videos = new Map<MediaAssetId, HTMLVideoElement>();
  const images = new Map<MediaAssetId, HTMLImageElement>();
  const decoders = new Map<MediaAssetId, SequentialFrameSource>();

  const releaseSources = () => {
    for (const decoder of decoders.values()) decoder.close();
    decoders.clear();
    for (const video of videos.values()) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    videos.clear();
  };

  try {
    for (const assetId of uniqueVideoAssetIds(sequence)) {
      throwIfAborted(signal);
      const asset = request.project.mediaAssets[assetId];
      if (!asset) continue;
      const handle = await context.resolve(asset.source);
      if (!handle) {
        throw new TimelineError('MEDIA_UNAVAILABLE', `${asset.name} is offline and cannot be exported.`);
      }
      if (asset.kind === 'image') {
        images.set(assetId, await loadImage(handle, signal));
      } else if (asset.hasVideo) {
        let decoder: SequentialFrameSource | null = null;
        try {
          decoder = await openSequentialVideo(await blobFromUrl(handle.url, signal));
        } catch (error) {
          if (isAbortError(error)) throw error;
          decoder = null;
        }
        if (decoder) decoders.set(assetId, decoder);
        else videos.set(assetId, await loadVideo(handle, signal));
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new TimelineError('UNKNOWN', 'Could not create an export canvas.');

    const audioMix = await mixSequenceAudio(sequence, request.project, context, {
      ...options,
      onProgress: (p) => onProgress?.({ phase: 'audio', progress: p.progress * 0.25 }),
    });

    const chosen = await chooseVideoEncoder(request.format, width, height, fps);
    const { muxer, target } = createExportMuxer(chosen, width, height, fps, audioMix !== null);

    if (audioMix) {
      await encodeMixedAudioToMuxer(
        audioMix,
        muxer,
        {
          ...options,
          onProgress: (p) => onProgress?.({ phase: 'audio', progress: 0.25 + p.progress * 0.15 }),
        },
        chosen.audioCodec,
      );
    }

    let encoderError: Error | null = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (error: Error) => {
        encoderError = error;
      },
    });

    encoder.configure(chosen.config);

    onProgress?.({ phase: 'rendering', progress: audioMix ? 0.4 : 0 });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const videoProgressStart = audioMix ? 0.4 : 0;
    const videoProgressSpan = audioMix ? 0.55 : 1;
    for (let outFrame = 0; outFrame < outputFrames; outFrame++) {
      throwIfAborted(signal);
      throwEncoderFailure(encoderError);

      const seqFrame = sequenceFrameForOutputFrame(outFrame, outputFrameRate, sequence);
      const stack = getStackedVideoClipsAt(sequence, seqFrame);
      if (stack.length > 0) {
        await drawStackedProgramFrame(ctx, drawOptions, stack, seqFrame, async (clip) => {
          if (!clip.assetId) return null;
          const asset = request.project.mediaAssets[clip.assetId];
          if (!asset) return null;
          if (asset.kind === 'image') {
            const image = images.get(clip.assetId);
            return image ? drawableFromImage(image) : null;
          }
          const seconds = sourceTimeForFrame(clip, seqFrame, sequence.frameRate);
          const decoder = decoders.get(clip.assetId);
          if (decoder) {
            const sample = await decoder.frameAt(seconds);
            if (!sample || sample.displayWidth <= 0 || sample.displayHeight <= 0) return null;
            return {
              width: sample.displayWidth,
              height: sample.displayHeight,
              draw: (drawCtx, x, y, w, h) => sample.draw(drawCtx, x, y, w, h),
            };
          }
          const video = videos.get(clip.assetId);
          if (!video) return null;
          await seekVideoForExport(video, seconds, signal);
          return drawableFromVideo(video);
        });
      } else {
        drawGapFrame(ctx, width, height);
      }

      await waitForEncodeQueue(encoder, signal);
      throwEncoderFailure(encoderError);
      const videoFrame = new VideoFrame(canvas, {
        timestamp: outFrame * frameDurationUs,
        duration: frameDurationUs,
      });
      encoder.encode(videoFrame, { keyFrame: outFrame % keyFrameInterval === 0 });
      videoFrame.close();

      onProgress?.({
        phase: 'rendering',
        progress: videoProgressStart + ((outFrame + 1) / outputFrames) * videoProgressSpan,
      });

      if (outFrame % 8 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    await encoder.flush();
    throwEncoderFailure(encoderError);

    onProgress?.({ phase: 'finalizing', progress: 1 });
    muxer.finalize();
    encoder.close();

    const extension = chosen.container === 'mp4' ? 'mp4' : 'webm';
    const fileName = `${sanitizeFileName(sequence.name)}.${extension}`;
    const mime = chosen.container === 'mp4' ? 'video/mp4' : 'video/webm';
    downloadExportBlob(new Blob([target.buffer], { type: mime }), fileName);
    return { displayName: fileName, hardwareAccelerated: chosen.accelerated };
  } finally {
    releaseSources();
  }
}

interface ExportMuxer {
  addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
  addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void;
  finalize(): void;
}

function createExportMuxer(
  chosen: ChosenVideoEncoder,
  width: number,
  height: number,
  fps: number,
  withAudio: boolean,
): { muxer: ExportMuxer; target: { buffer: ArrayBuffer } } {
  if (chosen.container === 'mp4') {
    const target = new Mp4Target();
    const muxer = new Mp4Muxer({
      target,
      video: { codec: 'avc', width, height, frameRate: fps },
      fastStart: 'in-memory',
      ...(withAudio
        ? { audio: { codec: chosen.audioCodec, numberOfChannels: 2, sampleRate: EXPORT_AUDIO_SAMPLE_RATE } }
        : {}),
    });
    return { muxer, target };
  }

  const target = new WebmTarget();
  const webmCodec = chosen.webmCodec ?? 'V_VP9';
  const muxer = new WebmMuxer({
    target,
    video: { codec: webmCodec, width, height, frameRate: fps },
    firstTimestampBehavior: 'offset',
    ...(withAudio
      ? { audio: { codec: 'A_OPUS' as const, numberOfChannels: 2, sampleRate: EXPORT_AUDIO_SAMPLE_RATE } }
      : {}),
  });
  return { muxer, target };
}
