import { type ActiveVideoClip, type Clip, type ClipId, type Sequence } from '@timeline/core';
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
  frameWidth: number,
  frameHeight: number,
  boxWidth: number,
  boxHeight: number,
): CSSProperties {
  const t = clip.transform;
  const seq = sequence.resolution;
  const px = frameWidth > 0 ? (t.positionX / seq.width) * frameWidth : 0;
  const py = frameHeight > 0 ? (t.positionY / seq.height) * frameHeight : 0;
  return {
    left: '50%',
    top: '50%',
    width: boxWidth,
    height: boxHeight,
    transform: `translate(-50%, -50%) translate(${px}px, ${py}px) rotate(${t.rotation}deg) scale(${t.scaleX / 100}, ${t.scaleY / 100})`,
    transformOrigin: 'center center',
    opacity: t.opacity / 100,
  };
}
