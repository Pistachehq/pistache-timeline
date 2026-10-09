import { type Clip, type Sequence } from '@timeline/core';

/** Clears the canvas to black (sequence gap or empty frame). */
export function drawGapFrame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
}

export interface DrawFrameOptions {
  readonly width: number;
  readonly height: number;
  /** Scales clip transform offsets when export size differs from the sequence. */
  readonly sequence: Sequence;
}

/**
 * Draws one program frame: letterboxed source video with clip transform,
 * matching the Program monitor's object-contain + transform stack.
 */
export function drawProgramFrame(
  ctx: CanvasRenderingContext2D,
  options: DrawFrameOptions,
  clip: Clip,
  video: HTMLVideoElement,
): void {
  const { width, height, sequence } = options;
  const scaleX = width / sequence.resolution.width;
  const scaleY = height / sequence.resolution.height;
  drawGapFrame(ctx, width, height);
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return;

  const t = clip.transform;
  ctx.save();
  ctx.translate(width / 2 + t.positionX * scaleX, height / 2 + t.positionY * scaleY);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scale / 100, t.scale / 100);
  ctx.globalAlpha = t.opacity / 100;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const fit = Math.min(width / vw, height / vh);
  const dw = vw * fit;
  const dh = vh * fit;
  ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}
