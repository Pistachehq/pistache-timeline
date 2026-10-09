import {
  canvasFilterFromVideoEffects,
  clipTransitionPaint,
  effectiveClipOpacityPercent,
  libraryEffectClipPath,
  libraryEffectTransform,
  type ActiveVideoClip,
  type Clip,
  type MediaAsset,
  type Sequence,
} from '@timeline/core';

function applyExtraTransform(ctx: CanvasRenderingContext2D, transform: string): void {
  if (!transform) return;
  if (transform.includes('scaleX(-1)')) ctx.scale(-1, 1);
  if (transform.includes('scaleY(-1)')) ctx.scale(1, -1);
  const rotate = /rotate\(([-\d.]+)deg\)/.exec(transform);
  if (rotate?.[1]) ctx.rotate((Number(rotate[1]) * Math.PI) / 180);
  const scale = /scale\(([-\d.]+)\)/.exec(transform);
  if (scale?.[1]) ctx.scale(Number(scale[1]), Number(scale[1]));
}

function clipCssPath(ctx: CanvasRenderingContext2D, clipPath: string, dw: number, dh: number): void {
  const inset = /^inset\(([^)]+)\)$/.exec(clipPath);
  if (inset?.[1]) {
    const parts = inset[1].trim().split(/\s+/).map((part) => Number.parseFloat(part));
    const [t = 0, r = t, b = t, l = r] =
      parts.length === 1 ? [parts[0], parts[0], parts[0], parts[0]] : parts.length === 2 ? [parts[0], parts[1], parts[0], parts[1]] : parts;
    const top = (dh * t) / 100;
    const right = (dw * r) / 100;
    const bottom = (dh * b) / 100;
    const left = (dw * l) / 100;
    ctx.beginPath();
    ctx.rect(-dw / 2 + left, -dh / 2 + top, Math.max(1, dw - left - right), Math.max(1, dh - top - bottom));
    ctx.clip();
    return;
  }
  const circle = /^circle\(([-\d.]+)%/.exec(clipPath);
  if (circle?.[1]) {
    ctx.beginPath();
    ctx.arc(0, 0, (Math.min(dw, dh) * Number(circle[1])) / 100, 0, Math.PI * 2);
    ctx.clip();
  }
}

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
  sequenceFrame: number,
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
    const paint = clipTransitionPaint(clip, sequenceFrame);
    const filter = [canvasFilterFromVideoEffects(clip.effects.video), paint.filter].filter(Boolean).join(' ');
    const clipPath = paint.clipPath ?? libraryEffectClipPath(clip.effects.video);
    ctx.save();
    ctx.translate(width / 2 + t.positionX * scaleX, height / 2 + t.positionY * scaleY);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.scale(t.scaleX / 100, t.scaleY / 100);
    applyExtraTransform(ctx, [libraryEffectTransform(clip.effects.video), paint.transform].filter(Boolean).join(' '));
    ctx.globalAlpha = effectiveClipOpacityPercent(clip, sequenceFrame, sequence) / 100;
    if (filter) ctx.filter = filter;
    const fit = Math.min(width / vw, height / vh);
    const dw = vw * fit;
    const dh = vh * fit;
    if (clipPath) clipCssPath(ctx, clipPath, dw, dh);
    ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    ctx.filter = 'none';
  }
}
