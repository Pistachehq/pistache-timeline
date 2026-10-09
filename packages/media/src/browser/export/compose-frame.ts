import {
  canvasFilterFromVideoEffects,
  clipTransitionPaint,
  effectiveClipOpacityPercent,
  libraryEffectClipPath,
  libraryEffectTransform,
  textAnimationFrame,
  textAnimationProgress,
  type ActiveVideoClip,
  type Clip,
  type ClipText,
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

  const t = clip.transform;
  ctx.save();
  ctx.translate(width / 2 + t.positionX * scaleX, height / 2 + t.positionY * scaleY);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scaleX / 100, t.scaleY / 100);
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
  const progress =
    text.animation === 'none'
      ? 1
      : textAnimationProgress(sequenceFrame - clip.start, text.animationFrames || 60);
  const anim = textAnimationFrame(text.content, text.animation, progress);
  const scaleX = width / sequence.resolution.width;
  const scaleY = height / sequence.resolution.height;
  const t = clip.transform;
  const paint = clipTransitionPaint(clip, sequenceFrame);
  const filter = [canvasFilterFromVideoEffects(clip.effects.video), paint.filter].filter(Boolean).join(' ');
  ctx.save();
  ctx.translate(width / 2 + t.positionX * scaleX, height / 2 + t.positionY * scaleY);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale((t.scaleX / 100) * scaleX, (t.scaleY / 100) * scaleY);
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
  const pieces: { text: string; opacity: number; offsetY: number }[] = [];
  for (const run of anim.runs) {
    const parts = run.text.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) pieces.push({ text: '\n', opacity: 1, offsetY: 0 });
      if (part) pieces.push({ text: part, opacity: run.opacity, offsetY: run.offsetY });
    });
  }
  const lines: { text: string; opacity: number; offsetY: number }[][] = [[]];
  for (const piece of pieces) {
    if (piece.text === '\n') lines.push([]);
    else lines[lines.length - 1]?.push(piece);
  }
  const lineHeight = text.fontSize * 1.2;
  lines.forEach((line, index) => {
    const total = line.reduce((sum, part) => sum + ctx.measureText(part.text).width, 0);
    let x = text.align === 'center' ? -total / 2 : text.align === 'right' ? -total : 0;
    const y = (index - (lines.length - 1) / 2) * lineHeight;
    for (const part of line) {
      ctx.save();
      ctx.globalAlpha *= part.opacity;
      const py = y + part.offsetY;
      if (text.outlineWidth > 0) {
        ctx.lineWidth = text.outlineWidth * 2;
        ctx.strokeStyle = text.outlineColor;
        ctx.strokeText(part.text, x, py);
      }
      ctx.fillText(part.text, x, py);
      x += ctx.measureText(part.text).width;
      ctx.restore();
    }
  });
  ctx.restore();
  ctx.filter = 'none';
  ctx.letterSpacing = '0px';
}

export async function drawStackedProgramFrame(
  ctx: CanvasRenderingContext2D,
  options: DrawFrameOptions,
  stack: readonly ActiveVideoClip[],
  sequenceFrame: number,
  resolveSource: (clip: Clip) => Promise<VisualSource | null>,
): Promise<void> {
  const { width, height } = options;
  drawGapFrame(ctx, width, height);
  for (const { clip } of stack) {
    if (clip.text) {
      drawTextClip(ctx, clip, clip.text, options.sequence, sequenceFrame, width, height);
      continue;
    }
    if (!clip.assetId) continue;
    const source = await resolveSource(clip);
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
    paintSource(ctx, source, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    ctx.filter = 'none';
  }
}
