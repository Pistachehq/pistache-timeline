import {
  BLUR_REFERENCE_HEIGHT,
  canvasFilterFromVideoEffects,
  clipPathFromVideoEffects,
  clipTransitionPaint,
  cssBlurFilter,
  effectiveClipOpacityPercent,
  evaluateClipTransform,
  getBlurVideoEffect,
  getClipDuration,
  hasPixelVideoEffects,
  insetClipPathFromRegion,
  isRegionalBlurEffect,
  libraryEffectClipPath,
  libraryEffectTransform,
  textClipAnimationFrame,
  type ActiveVideoClip,
  type BlurVideoEffect,
  type Clip,
  type ClipText,
  type ClipTransform,
  type Sequence,
} from '@timeline/core';
import {
  PixelTracking,
  replacementAssetIds,
  type PixelEffectsRenderer,
  type PixelReplacement,
} from '../effects/pixel-effects';

/** Position, anchor, rotation, and scale. Anchor 0 keeps the previous centre pivot. */
function applyClipMotion(
  ctx: CanvasRenderingContext2D,
  t: ClipTransform,
  originX: number,
  originY: number,
  seqScaleX: number,
  seqScaleY: number,
  scaleIncludesSequence: boolean,
): void {
  if (t.blendMode !== 'normal') ctx.globalCompositeOperation = t.blendMode;
  const clipSx = t.scaleX / 100;
  const clipSy = t.scaleY / 100;
  ctx.translate(originX, originY);
  ctx.translate(t.anchorX * seqScaleX * clipSx, t.anchorY * seqScaleY * clipSy);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(scaleIncludesSequence ? clipSx * seqScaleX : clipSx, scaleIncludesSequence ? clipSy * seqScaleY : clipSy);
  ctx.translate(scaleIncludesSequence ? -t.anchorX : -t.anchorX * seqScaleX, scaleIncludesSequence ? -t.anchorY : -t.anchorY * seqScaleY);
}

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
    const [box = '', roundPart] = inset[1].split(/\s+round\s+/);
    const parts = box.trim().split(/\s+/).map((part) => Number.parseFloat(part) || 0);
    const [t = 0, r = t, b = t, l = r] =
      parts.length === 1 ? [parts[0], parts[0], parts[0], parts[0]] : parts.length === 2 ? [parts[0], parts[1], parts[0], parts[1]] : parts;
    const top = (dh * t) / 100;
    const right = (dw * r) / 100;
    const bottom = (dh * b) / 100;
    const left = (dw * l) / 100;
    const width = Math.max(1, dw - left - right);
    const height = Math.max(1, dh - top - bottom);
    const radius = roundPart ? Math.min(width / 2, height / 2, Number.parseFloat(roundPart) || 0) : 0;
    ctx.beginPath();
    if (radius > 0 && typeof ctx.roundRect === 'function') ctx.roundRect(-dw / 2 + left, -dh / 2 + top, width, height, radius);
    else ctx.rect(-dw / 2 + left, -dh / 2 + top, width, height);
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
export interface CanvasDrawable {
  readonly width: number;
  readonly height: number;
  draw(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void;
}

type VisualSource = HTMLVideoElement | HTMLImageElement | CanvasDrawable;

function isMediaElement(source: VisualSource): source is HTMLVideoElement | HTMLImageElement {
  return source instanceof HTMLVideoElement || source instanceof HTMLImageElement;
}

function sourceDimensions(source: VisualSource): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

function paintSource(
  ctx: CanvasRenderingContext2D,
  source: VisualSource,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (isMediaElement(source)) ctx.drawImage(source, x, y, width, height);
  else source.draw(ctx, x, y, width, height);
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

  const t = evaluateClipTransform(clip, clip.start);
  ctx.save();
  applyClipMotion(ctx, t, width / 2 + t.positionX * scaleX, height / 2 + t.positionY * scaleY, scaleX, scaleY, false);
  ctx.globalAlpha = t.opacity / 100;

  const fit = Math.min(width / vw, height / vh);
  const dw = vw * fit;
  const dh = vh * fit;
  paintSource(ctx, source, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function drawTextClip(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  text: ClipText,
  sequence: Sequence,
  sequenceFrame: number,
  width: number,
  height: number,
): void {
  const anim = textClipAnimationFrame(text, sequenceFrame - clip.start, getClipDuration(clip));
  const scaleX = width / sequence.resolution.width;
  const scaleY = height / sequence.resolution.height;
  const t = evaluateClipTransform(clip, sequenceFrame);
  const paint = clipTransitionPaint(clip, sequenceFrame);
  const filter = [canvasFilterFromVideoEffects(clip.effects.video, height / BLUR_REFERENCE_HEIGHT), paint.filter]
    .filter(Boolean)
    .join(' ');
  ctx.save();
  applyClipMotion(ctx, t, width / 2 + t.positionX * scaleX, height / 2 + t.positionY * scaleY, scaleX, scaleY, true);
  applyExtraTransform(ctx, [libraryEffectTransform(clip.effects.video), paint.transform].filter(Boolean).join(' '));
  ctx.globalAlpha = effectiveClipOpacityPercent(clip, sequenceFrame, sequence) / 100;
  if (filter) ctx.filter = filter;
  const fontStyle = `${text.italic ? 'italic ' : ''}${text.bold ? '700 ' : '400 '}${text.fontSize}px "${text.fontFamily}"`;
  ctx.font = fontStyle;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = text.color;
  ctx.letterSpacing = `${text.letterSpacing + anim.letterSpacing}px`;
  if (text.shadow) {
    ctx.shadowColor = text.shadow.color;
    ctx.shadowBlur = text.shadow.blur;
    ctx.shadowOffsetX = text.shadow.offsetX;
    ctx.shadowOffsetY = text.shadow.offsetY;
  }
  interface Piece {
    readonly text: string;
    readonly opacity: number;
    readonly offsetY: number;
    readonly blur: number;
    readonly scale: number;
  }
  const pieces: Piece[] = [];
  for (const run of anim.runs) {
    const parts = run.text.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) pieces.push({ text: '\n', opacity: 1, offsetY: 0, blur: 0, scale: 1 });
      if (part) pieces.push({ text: part, opacity: run.opacity, offsetY: run.offsetY, blur: run.blur, scale: run.scale });
    });
  }
  const lines: Piece[][] = [[]];
  for (const piece of pieces) {
    if (piece.text === '\n') lines.push([]);
    else lines[lines.length - 1]?.push(piece);
  }
  const lineHeight = text.fontSize * 1.2;
  if (text.backgroundColor) {
    const widths = lines.map((line) => line.reduce((sum, part) => sum + ctx.measureText(part.text).width, 0));
    const maxW = Math.max(0, ...widths);
    if (maxW > 0) {
      const padX = text.fontSize * 0.45;
      const padY = text.fontSize * 0.22;
      const blockH = lines.length * lineHeight;
      const x = text.align === 'center' ? -maxW / 2 : text.align === 'right' ? -maxW : 0;
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = text.backgroundColor;
      ctx.beginPath();
      const radius = text.fontSize * 0.28;
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x - padX, -blockH / 2 - padY, maxW + padX * 2, blockH + padY * 2, radius);
      else ctx.rect(x - padX, -blockH / 2 - padY, maxW + padX * 2, blockH + padY * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  lines.forEach((line, index) => {
    const total = line.reduce((sum, part) => sum + ctx.measureText(part.text).width, 0);
    let x = text.align === 'center' ? -total / 2 : text.align === 'right' ? -total : 0;
    const y = (index - (lines.length - 1) / 2) * lineHeight;
    for (const part of line) {
      ctx.save();
      ctx.globalAlpha *= part.opacity;
      const partWidth = ctx.measureText(part.text).width;
      let px = x;
      let py = y + part.offsetY;
      if (Math.abs(part.scale - 1) > 0.001) {
        ctx.translate(x + partWidth / 2, py);
        ctx.scale(part.scale, part.scale);
        px = -partWidth / 2;
        py = 0;
      }
      if (part.blur > 0.2) ctx.filter = `${filter ? `${filter} ` : ''}blur(${part.blur}px)`;
      if (text.outlineWidth > 0) {
        ctx.lineWidth = text.outlineWidth * 2;
        ctx.strokeStyle = text.outlineColor;
        ctx.strokeText(part.text, px, py);
      }
      ctx.fillText(part.text, px, py);
      x += partWidth;
      ctx.restore();
    }
  });
  ctx.restore();
  ctx.filter = 'none';
  ctx.letterSpacing = '0px';
}

/** Keying, Screen Replace, sharpen and vignette for export. One per export run. */
export interface PixelEffectsContext {
  readonly renderer: PixelEffectsRenderer;
  readonly tracking: Map<string, PixelTracking>;
  /** Replacement picture for a Screen Replace source at this sequence frame. */
  readonly resolveReplacement: (assetId: string, clip: Clip, sequenceFrame: number) => Promise<PixelReplacement | null>;
}

const scratchCanvases: HTMLCanvasElement[] = [];

function scratch(index: number, width: number, height: number): CanvasRenderingContext2D | null {
  let canvas = scratchCanvases[index];
  if (!canvas) {
    canvas = document.createElement('canvas');
    scratchCanvases[index] = canvas;
  }
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  ctx?.clearRect(0, 0, width, height);
  return ctx;
}

async function processPixels(
  pixel: PixelEffectsContext,
  clip: Clip,
  source: VisualSource,
  dw: number,
  dh: number,
  sequenceFrame: number,
): Promise<VisualSource> {
  const w = Math.max(1, Math.round(dw));
  const h = Math.max(1, Math.round(dh));
  const base = scratch(0, w, h);
  if (!base) return source;
  paintSource(base, source, 0, 0, w, h);
  const replacements = new Map<string, PixelReplacement>();
  for (const assetId of replacementAssetIds(clip.effects.video)) {
    const replacement = await pixel.resolveReplacement(assetId, clip, sequenceFrame);
    if (replacement) replacements.set(assetId, replacement);
  }
  let tracking = pixel.tracking.get(clip.id);
  if (!tracking) {
    tracking = new PixelTracking();
    pixel.tracking.set(clip.id, tracking);
  }
  const out = pixel.renderer.render({
    source: base.canvas,
    sourceWidth: w,
    sourceHeight: h,
    outputWidth: w,
    outputHeight: h,
    effects: clip.effects.video,
    replacements,
    frame: sequenceFrame,
    tracking,
  });
  if (!out) return source;
  const copy = scratch(1, w, h);
  if (!copy) return source;
  copy.drawImage(out, 0, 0);
  const canvas = copy.canvas;
  return { width: w, height: h, draw: (target, x, y, dx, dy) => target.drawImage(canvas, x, y, dx, dy) };
}

/** Sharp picture with a blurred copy inside (or outside) the region, like the Program monitor. */
function paintWithRegionalBlur(
  ctx: CanvasRenderingContext2D,
  source: VisualSource,
  dw: number,
  dh: number,
  baseFilter: string,
  blur: BlurVideoEffect,
  blurScale: number,
): void {
  const region = blur.region;
  const blurFilter = cssBlurFilter(blur.amount, blurScale);
  if (!region || !blurFilter) {
    paintSource(ctx, source, -dw / 2, -dh / 2, dw, dh);
    return;
  }
  const withBlur = [baseFilter, blurFilter].filter(Boolean).join(' ');
  const inner = insetClipPathFromRegion(region);
  ctx.filter = region.internal ? baseFilter || 'none' : withBlur;
  paintSource(ctx, source, -dw / 2, -dh / 2, dw, dh);
  ctx.save();
  clipCssPath(ctx, inner, dw, dh);
  ctx.filter = region.internal ? withBlur : baseFilter || 'none';
  paintSource(ctx, source, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

export async function drawStackedProgramFrame(
  ctx: CanvasRenderingContext2D,
  options: DrawFrameOptions,
  stack: readonly ActiveVideoClip[],
  sequenceFrame: number,
  resolveSource: (clip: Clip) => Promise<VisualSource | null>,
  pixel: PixelEffectsContext | null = null,
): Promise<void> {
  const { width, height } = options;
  drawGapFrame(ctx, width, height);
  const blurScale = height / BLUR_REFERENCE_HEIGHT;
  for (const { clip } of stack) {
    if (clip.text) {
      drawTextClip(ctx, clip, clip.text, options.sequence, sequenceFrame, width, height);
      continue;
    }
    if (!clip.assetId) continue;
    let source = await resolveSource(clip);
    if (!source) continue;
    const { width: vw, height: vh } = sourceDimensions(source);
    if (vw <= 0 || vh <= 0) continue;

    const { sequence } = options;
    const scaleX = width / sequence.resolution.width;
    const scaleY = height / sequence.resolution.height;
    const fit = Math.min(width / vw, height / vh);
    const dw = vw * fit;
    const dh = vh * fit;
    if (pixel && hasPixelVideoEffects(clip.effects.video)) {
      source = await processPixels(pixel, clip, source, dw, dh, sequenceFrame);
    }
    const t = evaluateClipTransform(clip, sequenceFrame);
    const paint = clipTransitionPaint(clip, sequenceFrame);
    const filter = [canvasFilterFromVideoEffects(clip.effects.video, blurScale), paint.filter].filter(Boolean).join(' ');
    const clipPath =
      paint.clipPath ?? clipPathFromVideoEffects(clip.effects.video, scaleY) ?? libraryEffectClipPath(clip.effects.video);
    ctx.save();
    applyClipMotion(ctx, t, width / 2 + t.positionX * scaleX, height / 2 + t.positionY * scaleY, scaleX, scaleY, false);
    applyExtraTransform(ctx, [libraryEffectTransform(clip.effects.video), paint.transform].filter(Boolean).join(' '));
    ctx.globalAlpha = effectiveClipOpacityPercent(clip, sequenceFrame, sequence) / 100;
    if (clipPath) clipCssPath(ctx, clipPath, dw, dh);
    const blur = getBlurVideoEffect(clip.effects.video);
    if (blur && isRegionalBlurEffect(blur)) {
      paintWithRegionalBlur(ctx, source, dw, dh, filter, blur, blurScale);
    } else {
      if (filter) ctx.filter = filter;
      paintSource(ctx, source, -dw / 2, -dh / 2, dw, dh);
    }
    ctx.restore();
    ctx.filter = 'none';
  }
}
