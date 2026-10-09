import {
  getClipEnd,
  isCrossDissolveTransition,
  type Clip,
  type ClipEdgeTransition,
  type Sequence,
  type Track,
  type VideoTransitionKind,
} from '@timeline/core';
import { textAnimationLabel } from '../project/text-animation-label';
import { transitionDisplayName } from '../project/transition-display';

export interface ClipEdgeTag {
  readonly key: string;
  /** Glued to the head or the tail of the clip. */
  readonly side: 'start' | 'end';
  readonly widthPx: number;
  readonly label: string;
}

function tagWidth(frames: number, clipWidthPx: number, pixelsPerFrame: number): number {
  return Math.min(clipWidthPx, Math.max(4, frames * pixelsPerFrame));
}

/** Head/tail labels drawn inside the clip so they stay flush with its edges. */
export function clipEdgeTags(sequence: Sequence, track: Track, clip: Clip, clipWidthPx: number, pixelsPerFrame: number): ClipEdgeTag[] {
  const tags: ClipEdgeTag[] = [];
  const prev = prevClipOnTrack(sequence, track, clip);
  const next = nextClipOnTrack(sequence, track, clip);
  const trIn = clip.transitions.in;
  const trOut = clip.transitions.out;
  const pairedIn = prev && trIn && isCrossDissolvePair(prev, clip, prev.transitions.out, trIn);
  const pairedOut = next && trOut && isCrossDissolvePair(clip, next, trOut, next.transitions.in);

  if (!pairedIn && trIn && edgeDuration(trIn) > 0) {
    tags.push({
      key: `in-${clip.id}`,
      side: 'start',
      widthPx: tagWidth(edgeDuration(trIn), clipWidthPx, pixelsPerFrame),
      label: transitionDisplayName(trIn),
    });
  }
  if (!pairedOut && trOut && edgeDuration(trOut) > 0) {
    tags.push({
      key: `out-${clip.id}`,
      side: 'end',
      widthPx: tagWidth(edgeDuration(trOut), clipWidthPx, pixelsPerFrame),
      label: transitionDisplayName(trOut),
    });
  }

  const text = clip.text;
  if (text && text.animation !== 'none' && (text.animationFrames ?? 0) > 0) {
    tags.push({
      key: `text-${clip.id}`,
      side: 'start',
      widthPx: tagWidth(text.animationFrames || 60, clipWidthPx, pixelsPerFrame),
      label: textAnimationLabel(text.animation),
    });
  }
  return tags;
}

export interface TransitionMarker {
  readonly key: string;
  readonly leftPx: number;
  readonly widthPx: number;
  readonly label: string;
  readonly kind: VideoTransitionKind;
  readonly paired: boolean;
}

export function transitionLabel(kind: VideoTransitionKind): string {
  switch (kind) {
    case 'fade':
      return 'Fade';
    case 'dip-black':
      return 'Dip to Black';
    case 'cross-dissolve':
      return 'Cross Dissolve';
    default:
      return 'Transition';
  }
}

function prevClipOnTrack(sequence: Sequence, track: Track, clip: Clip): Clip | undefined {
  let prev: Clip | undefined;
  for (const id of track.clipIds) {
    const candidate = sequence.clips[id];
    if (!candidate || candidate.start >= clip.start) continue;
    if (!prev || candidate.start > prev.start) prev = candidate;
  }
  return prev;
}

function nextClipOnTrack(sequence: Sequence, track: Track, clip: Clip): Clip | undefined {
  let next: Clip | undefined;
  for (const id of track.clipIds) {
    const candidate = sequence.clips[id];
    if (!candidate || candidate.start <= clip.start) continue;
    if (!next || candidate.start < next.start) next = candidate;
  }
  return next;
}

function isCrossDissolvePair(
  left: Clip,
  right: Clip,
  outEdge: ClipEdgeTransition | null,
  inEdge: ClipEdgeTransition | null,
): boolean {
  return (
    getClipEnd(left) === right.start &&
    outEdge !== null &&
    inEdge !== null &&
    isCrossDissolveTransition(outEdge) &&
    isCrossDissolveTransition(inEdge) &&
    outEdge.durationFrames > 0 &&
    inEdge.durationFrames > 0
  );
}

function edgeDuration(edge: ClipEdgeTransition | null): number {
  if (!edge || edge.videoKind === 'none') return 0;
  return Math.max(0, edge.durationFrames);
}

/** Keep transition blocks inside the track lane (no negative inset / header overlap). */
function clampMarkerGeometry(leftPx: number, widthPx: number): { readonly leftPx: number; readonly widthPx: number } {
  let left = leftPx;
  let width = Math.max(4, widthPx);
  if (left < 0) {
    width = Math.max(4, width + left);
    left = 0;
  }
  return { leftPx: left, widthPx: width };
}

/** Absolute timeline markers for transition overlays on one track (Premiere-style). */
export function collectTransitionMarkers(
  sequence: Sequence,
  track: Track,
  clips: readonly Clip[],
  pixelsPerFrame: number,
): TransitionMarker[] {
  const markers: TransitionMarker[] = [];
  const pairedKeys = new Set<string>();

  for (const clip of clips) {
    const next = nextClipOnTrack(sequence, track, clip);
    const trOut = clip.transitions.out;
    const pairedOut = next && trOut && isCrossDissolvePair(clip, next, trOut, next.transitions.in);

    if (pairedOut && trOut && next) {
      const pairKey = `${clip.id}:${next.id}`;
      if (!pairedKeys.has(pairKey)) {
        pairedKeys.add(pairKey);
        const duration = Math.max(edgeDuration(trOut), edgeDuration(next.transitions.in));
        const cutFrame = getClipEnd(clip);
        const widthPx = Math.max(4, duration * pixelsPerFrame);
        const rawLeft = cutFrame * pixelsPerFrame - widthPx / 2;
        const { leftPx, widthPx: w } = clampMarkerGeometry(rawLeft, widthPx);
        markers.push({
          key: `pair-${pairKey}`,
          leftPx,
          widthPx: w,
          label: transitionLabel('cross-dissolve'),
          kind: 'cross-dissolve',
          paired: true,
        });
      }
    }
  }

  return markers;
}

export function clipEffectCount(clip: Clip): number {
  let n = clip.effects.audio.length;
  for (const e of clip.effects.video) {
    if (e.kind === 'crop') {
      if (e.top + e.right + e.bottom + e.left > 0) n++;
    } else n++;
  }
  return n;
}
