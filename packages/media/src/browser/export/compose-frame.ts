import { type ActiveVideoClip, type Clip, type MediaAsset, type Sequence } from '@timeline/core';

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
type VisualSource = HTMLVideoElement | HTMLImageElement;

function sourceDimensions(source: VisualSource): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  return { width: source.naturalWidth, height: source.naturalHeight };
}

export function drawProgramFrame(
  ctx: CanvasRenderingContext2D,
  options: DrawFrameOptions,
  clip: Clip,
  source: VisualSource,
): void {
  const { width, height, sequence } = options;
  const scaleX = width / sequence.resolution.width;
  const scaleY = height / sequence.resolution.height;
  drawGapFrame(ctx, width, height);
  const { width: vw, height: vh } = sourceDimensions(source);
  if (vw <= 0 || vh <= 0) return;

  const t = clip.transform;
  ctx.save();
  ctx.translate(width / 2 + t.positionX * scaleX, height / 2 + t.positionY * scaleY);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scaleX / 100, t.scaleY / 100);
  ctx.globalAlpha = t.opacity / 100;

  const fit = Math.min(width / vw, height / vh);
  const dw = vw * fit;
  const dh = vh * fit;
  ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

export function drawStackedProgramFrame(
  ctx: CanvasRenderingContext2D,
  options: DrawFrameOptions,
  stack: readonly ActiveVideoClip[],
  assets: Readonly<Record<MediaAsset['id'], MediaAsset>>,
  videos: ReadonlyMap<MediaAsset['id'], HTMLVideoElement>,
  images: ReadonlyMap<MediaAsset['id'], HTMLImageElement>,
): void {
  const { width, height } = options;
  drawGapFrame(ctx, width, height);
  for (const { clip } of stack) {
    const asset = assets[clip.assetId];
    if (!asset) continue;
    const source =
      asset.kind === 'image' ? images.get(clip.assetId) : asset.hasVideo ? videos.get(clip.assetId) : undefined;
    if (!source) continue;
    const { width: vw, height: vh } = sourceDimensions(source);
    if (vw <= 0 || vh <= 0) continue;

    const { sequence } = options;
    const scaleX = width / sequence.resolution.width;
    const scaleY = height / sequence.resolution.height;
    const t = clip.transform;
    ctx.save();
    ctx.translate(width / 2 + t.positionX * scaleX, height / 2 + t.positionY * scaleY);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.scale(t.scaleX / 100, t.scaleY / 100);
    ctx.globalAlpha = t.opacity / 100;
    const fit = Math.min(width / vw, height / vh);
    const dw = vw * fit;
    const dh = vh * fit;
    ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
}
