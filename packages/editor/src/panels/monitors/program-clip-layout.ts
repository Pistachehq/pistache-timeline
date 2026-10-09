import {
  clipPathFromVideoEffects,
  clipTransitionPaint,
  cssFilterFromVideoEffects,
  effectiveClipOpacityPercent,
  evaluateClipTransform,
  libraryEffectClipPath,
  libraryEffectTransform,
  type ActiveVideoClip,
  type Clip,
  type ClipId,
  type Sequence,
} from '@timeline/core';
import { type CSSProperties } from 'react';

export function programLayerElement(frame: HTMLElement, clipId: ClipId): HTMLElement | null {
  return frame.querySelector<HTMLElement>(`[data-program-layer="${clipId}"]`);
}

/** Topmost clip at a screen point (respects video track stacking). */
export function hitTestProgramClipAt(
  clientX: number,
  clientY: number,
  frame: HTMLElement,
  stack: readonly ActiveVideoClip[],
): ClipId | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    const clip = stack[i]!.clip;
    const layer = programLayerElement(frame, clip.id);
    if (!layer) continue;
    const r = layer.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
      return clip.id;
    }
  }
  return null;
}

/** Letterboxed media size inside the program frame (matches export compositing). */
export function letterboxMediaSize(
  frameWidth: number,
  frameHeight: number,
  mediaWidth: number,
  mediaHeight: number,
): { readonly width: number; readonly height: number } {
  if (frameWidth <= 0 || frameHeight <= 0 || mediaWidth <= 0 || mediaHeight <= 0) {
    return { width: 0, height: 0 };
  }
  const fit = Math.min(frameWidth / mediaWidth, frameHeight / mediaHeight);
  return { width: mediaWidth * fit, height: mediaHeight * fit };
}

/** Transform for a clip layer wrapper centered in the program frame. */
export function programClipWrapperStyle(
  clip: Clip,
  sequence: Sequence,
  sequenceFrame: number,
  frameWidth: number,
  frameHeight: number,
  boxWidth: number,
  boxHeight: number,
): CSSProperties {
  const t = evaluateClipTransform(clip, sequenceFrame);
  const seq = sequence.resolution;
  const px = frameWidth > 0 ? (t.positionX / seq.width) * frameWidth : 0;
  const py = frameHeight > 0 ? (t.positionY / seq.height) * frameHeight : 0;
  const ax = frameWidth > 0 ? (t.anchorX / seq.width) * frameWidth : 0;
  const ay = frameHeight > 0 ? (t.anchorY / seq.height) * frameHeight : 0;
  const sx = t.scaleX / 100;
  const sy = t.scaleY / 100;
  const paint = clipTransitionPaint(clip, sequenceFrame);
  const filter = [cssFilterFromVideoEffects(clip.effects.video), paint.filter].filter(Boolean).join(' ');
  const effectPath = clipPathFromVideoEffects(clip.effects.video) ?? libraryEffectClipPath(clip.effects.video);
  const clipPath = paint.clipPath ?? effectPath;
  const extraTransform = [libraryEffectTransform(clip.effects.video), paint.transform].filter(Boolean).join(' ');
  return {
    left: '50%',
    top: '50%',
    width: boxWidth,
    height: boxHeight,
    transform: `translate(-50%, -50%) translate(${px}px, ${py}px) translate(${ax * sx}px, ${ay * sy}px) rotate(${t.rotation}deg) scale(${sx}, ${sy}) translate(${-ax}px, ${-ay}px)${extraTransform ? ` ${extraTransform}` : ''}`,
    transformOrigin: 'center center',
    opacity: effectiveClipOpacityPercent(clip, sequenceFrame, sequence) / 100,
    ...(t.blendMode !== 'normal' ? { mixBlendMode: t.blendMode } : {}),
    ...(filter ? { filter } : {}),
    ...(clipPath ? { clipPath, overflow: 'hidden' as const } : {}),
  };
}
