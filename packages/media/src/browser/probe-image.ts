import { DEFAULT_STILL_IMAGE_DURATION_SECONDS } from '@timeline/core';
import { TimelineError } from '@timeline/shared';
import { type MediaHandle, type MediaMetadata } from '../types';

function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      img.onload = null;
      img.onerror = null;
    };
    img.onload = () => {
      cleanup();
      resolve(img);
    };
    img.onerror = () => {
      cleanup();
      reject(new TimelineError('UNSUPPORTED_MEDIA', 'The image could not be decoded.'));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    if (!url.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

/** Reads dimensions and assigns a default still duration for timeline use. */
export async function probeImage(handle: MediaHandle, signal?: AbortSignal): Promise<MediaMetadata> {
  const img = await loadImage(handle.url, signal);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (width <= 0 || height <= 0) {
    throw new TimelineError('UNSUPPORTED_MEDIA', 'The image has no readable dimensions.');
  }
  return {
    durationSeconds: DEFAULT_STILL_IMAGE_DURATION_SECONDS,
    hasVideo: false,
    hasAudio: false,
    width,
    height,
    frameRate: null,
    videoCodec: null,
    audioCodec: null,
    probedBy: 'image-element',
  };
}
