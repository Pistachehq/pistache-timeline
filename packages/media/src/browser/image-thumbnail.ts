import { TimelineError } from '@timeline/shared';
import { type MediaHandle, type Thumbnail, type ThumbnailRequest } from '../types';

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

/** Encodes a scaled JPEG thumbnail from a still image file. */
export async function captureImageThumbnail(
  handle: MediaHandle,
  request: ThumbnailRequest,
): Promise<Thumbnail | null> {
  const img = await loadImage(handle.url, request.signal);
  const scale = Math.min(1, request.maxWidth / img.naturalWidth);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, width, height);
  return { url: canvas.toDataURL('image/jpeg', 0.72), width, height };
}
