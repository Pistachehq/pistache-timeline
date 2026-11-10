export async function bitmapFromElement(
  el: CanvasImageSource,
  width: number,
  height: number,
  maxEdge: number,
): Promise<ImageBitmap> {
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
  const w = Math.max(2, Math.round(width * scale));
  const h = Math.max(2, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not capture this frame.');
  ctx.drawImage(el, 0, 0, w, h);
  return createImageBitmap(canvas);
}

export function maxEdgeForQuality(quality: 'preview' | 'final'): number {
  return quality === 'final' ? 768 : 512;
}

export function seekVideo(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Could not seek the clip for segmentation.'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    if (Math.abs(video.currentTime - seconds) < 0.01 && video.readyState >= 2) {
      cleanup();
      resolve();
      return;
    }
    video.currentTime = seconds;
  });
}
