import {
  BLUR_REFERENCE_HEIGHT,
  clipPathFromVideoEffects,
  clipTransitionPaint,
  cssFilterFromVideoEffects,
  effectiveClipOpacityPercent,
  evaluateClipTransform,
  findTrack,
  getClipAtFrame,
  getClipEnd,
  getSeamlessClipSuccessor,
  getStackedVideoClipsAt,
  libraryEffectClipPath,
  libraryEffectTransform,
  type ActiveVideoClip,
  type Clip,
  type ClipId,
  type Sequence,
  type VideoTrack,
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
  const filter = [cssFilterFromVideoEffects(clip.effects.video, frameHeight / BLUR_REFERENCE_HEIGHT), paint.filter]
    .filter(Boolean)
    .join(' ');
  const pixelScale = frameHeight > 0 ? frameHeight / seq.height : 1;
  const effectPath =
    clipPathFromVideoEffects(clip.effects.video, pixelScale) ?? libraryEffectClipPath(clip.effects.video);
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

/** Writes the program-layer presentation for the current sequence frame. */
export function applyProgramClipStyle(
  el: HTMLElement,
  clip: Clip,
  sequence: Sequence,
  sequenceFrame: number,
  frameWidth: number,
  frameHeight: number,
  boxWidth: number,
  boxHeight: number,
  hidden: boolean,
): void {
  const style = programClipWrapperStyle(clip, sequence, sequenceFrame, frameWidth, frameHeight, boxWidth, boxHeight);
  el.style.left = '50%';
  el.style.top = '50%';
  el.style.width = `${boxWidth}px`;
  el.style.height = `${boxHeight}px`;
  el.style.transform = typeof style.transform === 'string' ? style.transform : '';
  el.style.transformOrigin = 'center center';
  el.style.opacity = hidden ? '0' : String(style.opacity ?? 1);
  el.style.mixBlendMode = typeof style.mixBlendMode === 'string' ? style.mixBlendMode : 'normal';
  el.style.filter = typeof style.filter === 'string' ? style.filter : '';
  el.style.clipPath = typeof style.clipPath === 'string' ? style.clipPath : '';
  el.style.overflow = style.overflow === 'hidden' ? 'hidden' : '';
}

export type ProgramLayerRole = 'active' | 'warm' | 'recent';

export interface ProgramPictureLayer extends ActiveVideoClip {
  readonly role: ProgramLayerRole;
}

function isMediaClip(clip: Clip | undefined): clip is Clip {
  return !!clip && clip.enabled && !clip.text && clip.assetId !== null;
}

function nextMediaClip(sequence: Sequence, track: VideoTrack, frame: number): Clip | undefined {
  let next: Clip | undefined;
  for (const id of track.clipIds) {
    const clip = sequence.clips[id];
    if (!isMediaClip(clip) || clip.start <= frame) continue;
    if (!next || clip.start < next.start) next = clip;
  }
  return next;
}

function previousMediaClip(sequence: Sequence, track: VideoTrack, frame: number): Clip | undefined {
  let prev: Clip | undefined;
  for (const id of track.clipIds) {
    const clip = sequence.clips[id];
    if (!isMediaClip(clip) || getClipEnd(clip) > frame) continue;
    if (!prev || clip.start > prev.start) prev = clip;
  }
  return prev;
}

/**
 * Stable key for one media element across a razor cut of the same file.
 * A second element of that file stalls the one that is already playing.
 */
export function playbackElementKey(sequence: Sequence, clip: Clip): ClipId {
  let current = clip;
  const seen = new Set<ClipId>();
  while (!seen.has(current.id)) {
    seen.add(current.id);
    if (current.start <= 0) return current.id;
    const track = findTrack(sequence, current.trackId);
    if (!track) return current.id;
    const prev = getClipAtFrame(sequence, track, current.start - 1);
    if (!prev || getClipEnd(prev) !== current.start) return current.id;
    if (prev.assetId !== current.assetId || prev.sourceOut !== current.sourceIn) return current.id;
    current = prev;
  }
  return clip.id;
}

/**
 * The piece of a razor chain that covers `playhead`, starting from the clip
 * whose element is already mounted. Playback can cross the cut before React
 * swaps the layer.
 */
export function followSeamlessClip(sequence: Sequence, clip: Clip, playhead: number): Clip {
  let current = clip;
  for (let guard = 0; guard < 32; guard++) {
    if (playhead < getClipEnd(current)) return current;
    const next = getSeamlessClipSuccessor(sequence, current);
    if (!next) return current;
    current = next;
  }
  return current;
}

/**
 * Clips to keep mounted in Program: the current stack, the next media clip
 * (already seeked to its first frame), and the clip that just ended.
 * A razor cut of the same file stays on the element that is already playing.
 */
export function programPictureLayers(sequence: Sequence, frame: number): ProgramPictureLayer[] {
  const active = getStackedVideoClipsAt(sequence, frame);
  const seen = new Set(active.map((item) => item.clip.id));
  const extras: ProgramPictureLayer[] = [];
  const fps = sequence.frameRate.numerator / Math.max(1, sequence.frameRate.denominator);
  const horizon = Math.max(1, Math.round(fps * 2));

  for (const track of sequence.videoTracks) {
    if (!track.enabled || !track.visible) continue;
    const current = getClipAtFrame(sequence, track, frame);
    const next = nextMediaClip(sequence, track, frame);
    const continues =
      current && !current.text ? getSeamlessClipSuccessor(sequence, current)?.id === next?.id : false;
    if (next && !continues && !seen.has(next.id) && (current || next.start - frame <= horizon)) {
      seen.add(next.id);
      extras.push({ clip: next, track, role: 'warm' });
      if (getClipEnd(next) - next.start <= horizon) {
        const after = nextMediaClip(sequence, track, next.start);
        const afterContinues = getSeamlessClipSuccessor(sequence, next)?.id === after?.id;
        if (after && !afterContinues && !seen.has(after.id)) {
          seen.add(after.id);
          extras.push({ clip: after, track, role: 'warm' });
        }
      }
    }
    const prev = previousMediaClip(sequence, track, frame);
    const continued = prev && current && !current.text && getSeamlessClipSuccessor(sequence, prev)?.id === current.id;
    if (prev && !continued && !seen.has(prev.id) && current && !current.text) {
      seen.add(prev.id);
      extras.push({ clip: prev, track, role: 'recent' });
    }
  }

  return [
    ...extras.filter((item) => item.role === 'recent'),
    ...extras.filter((item) => item.role === 'warm'),
    ...active.map((item) => ({ ...item, role: 'active' as const })),
  ];
}

export function programPictureKey(sequence: Sequence, frame: number): string {
  return programPictureLayers(sequence, frame)
    .map((item) => `${item.role}:${item.clip.id}`)
    .join('|');
}

/**
 * True while a video has not decoded a frame yet.
 * A seek drops `readyState` below 2; once a frame has been shown, hiding the
 * layer for that dip paints the black program background.
 */
export function programVideoUnready(readyState: number, hasPresentedFrame: boolean): boolean {
  return readyState < 2 && !hasPresentedFrame;
}

/** Whether this mounted layer should be visible at `playhead`, including the frame a cut lands. */
export function programLayerLive(layer: ProgramPictureLayer, playhead: number): boolean {
  const { clip } = layer;
  const inside = playhead >= clip.start && playhead < getClipEnd(clip);
  if (inside) return true;
  if (layer.role !== 'active') return false;
  const fade = clip.transitions.in?.durationFrames ?? 0;
  return fade > 0 && playhead >= clip.start - fade && playhead < clip.start;
}
