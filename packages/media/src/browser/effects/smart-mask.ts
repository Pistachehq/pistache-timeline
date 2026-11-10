import { resizeMask, type AlphaMask } from '@timeline/core';
import { type SmartMaskFrame } from '../../types';

export type SmartMaskView = 'result' | 'original' | 'confidence' | 'binary' | 'matte' | 'overlay' | 'split';

const maskCanvas = typeof document === 'undefined' ? null : document.createElement('canvas');

function maskImage(mask: AlphaMask, width: number, height: number): CanvasImageSource | null {
  if (!maskCanvas) return null;
  const fitted = mask.width === width && mask.height === height ? mask : resizeMask(mask, width, height);
  if (maskCanvas.width !== width || maskCanvas.height !== height) {
    maskCanvas.width = width;
    maskCanvas.height = height;
  }
  const ctx = maskCanvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(width, height);
  for (let i = 0; i < fitted.data.length; i++) {
    const a = fitted.data[i] ?? 0;
    const o = i * 4;
    image.data[o] = 255;
    image.data[o + 1] = 255;
    image.data[o + 2] = 255;
    image.data[o + 3] = a;
  }
  ctx.putImageData(image, 0, 0);
  return maskCanvas;
}

/**
 * Draws `picture` with a semantic keep mask. Transparent pixels composite onto
 * lower tracks; they are never filled with black.
 */
export function paintSmartMaskedFrame(
  ctx: CanvasRenderingContext2D,
  picture: CanvasImageSource,
  mask: AlphaMask | null,
  width: number,
  height: number,
  view: SmartMaskView,
  split = 50,
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, width, height);
  if (!mask || view === 'original') {
    ctx.drawImage(picture, 0, 0, width, height);
    ctx.restore();
    return;
  }
  if (view === 'matte' || view === 'confidence' || view === 'binary') {
    const fitted = mask.width === width && mask.height === height ? mask : resizeMask(mask, width, height);
    const image = ctx.createImageData(width, height);
    for (let i = 0; i < fitted.data.length; i++) {
      const a = fitted.data[i] ?? 0;
      const o = i * 4;
      image.data[o] = a;
      image.data[o + 1] = a;
      image.data[o + 2] = a;
      image.data[o + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    ctx.restore();
    return;
  }
  const plate = maskImage(mask, width, height);
  ctx.drawImage(picture, 0, 0, width, height);
  if (plate) {
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(plate, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (view === 'overlay') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(picture, 0, 0, width, height);
    const fitted = mask.width === width && mask.height === height ? mask : resizeMask(mask, width, height);
    const overlay = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < fitted.data.length; i++) {
      const keep = (fitted.data[i] ?? 0) / 255;
      const o = i * 4;
      overlay.data[o] = clampMix(overlay.data[o] ?? 0, 16, keep, 220);
      overlay.data[o + 1] = clampMix(overlay.data[o + 1] ?? 0, 200, keep, 40);
      overlay.data[o + 2] = clampMix(overlay.data[o + 2] ?? 0, 80, keep, 40);
      overlay.data[o + 3] = 255;
    }
    ctx.putImageData(overlay, 0, 0);
  } else if (view === 'split') {
    const cut = Math.round((Math.min(100, Math.max(0, split)) / 100) * width);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(picture, 0, 0, cut, height, 0, 0, cut, height);
    ctx.fillStyle = '#f5c518';
    ctx.fillRect(cut, 0, 2, height);
  }
  ctx.restore();
}

function clampMix(src: number, keepTint: number, keep: number, dropTint: number): number {
  const mixed = src * 0.45 + keepTint * keep + dropTint * (1 - keep) * 0.55;
  return mixed < 0 ? 0 : mixed > 255 ? 255 : mixed | 0;
}

export function toAlphaMask(frame: SmartMaskFrame): AlphaMask {
  return { data: frame.data, width: frame.width, height: frame.height };
}
