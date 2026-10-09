import { type MediaHandle, type Thumbnail, type ThumbnailRequest } from '../types';
import { createProbeElement, releaseMediaElement, waitForMediaEvent } from './media-element';

/**
 * Captures a single frame as a small JPEG data URL. The decoded frame is only
 * held on a temporary canvas and released immediately.
 */
export async function captureVideoThumbnail(handle: MediaHandle, request: ThumbnailRequest): Promise<Thumbnail | null> {
  const video = createProbeElement('video', handle.url);
  try {
    const { signal } = request;
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForMediaEvent(video, 'loadedmetadata', { signal });
    }
    if (!video.videoWidth || !video.videoHeight) return null;
    const duration = Number.isFinite(video.duration) ? video.duration : request.timeSeconds;
    const target = Math.max(0, Math.min(request.timeSeconds, Math.max(0, duration - 0.1)));
    const seeked = waitForMediaEvent(video, 'seeked', { signal });
    video.currentTime = target;
    await seeked;

    const scale = Math.min(1, request.maxWidth / video.videoWidth);
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, width, height);
    const url = canvas.toDataURL('image/jpeg', 0.72);
    canvas.width = 0;
    canvas.height = 0;
    return { url, width, height };
  } finally {
    releaseMediaElement(video);
  }
}
