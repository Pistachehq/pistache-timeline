import {
  getClipEnd,
  type Clip,
  type ClipEdgeTransition,
  type Sequence,
  type Track,
  type VideoTransitionKind,
} from '@timeline/core';

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
    outEdge?.videoKind === 'cross-dissolve' &&
    inEdge?.videoKind === 'cross-dissolve' &&
    outEdge.durationFrames > 0 &&
    inEdge.durationFrames > 0
  );
}

function edgeDuration(edge: ClipEdgeTransition | null): number {
  if (!edge || edge.videoKind === 'none') return 0;
  return Math.max(0, edge.durationFrames);
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
    const prev = prevClipOnTrack(sequence, track, clip);
    const next = nextClipOnTrack(sequence, track, clip);
    const trIn = clip.transitions.in;
    const trOut = clip.transitions.out;

    const pairedIn =
      prev && trIn && isCrossDissolvePair(prev, clip, prev.transitions.out, trIn);
    const pairedOut =
      next && trOut && isCrossDissolvePair(clip, next, trOut, next.transitions.in);

    if (pairedOut && trOut && next) {
      const pairKey = `${clip.id}:${next.id}`;
      if (!pairedKeys.has(pairKey)) {
        pairedKeys.add(pairKey);
        const duration = Math.max(edgeDuration(trOut), edgeDuration(next.transitions.in));
        const cutFrame = getClipEnd(clip);
        const widthPx = Math.max(4, duration * pixelsPerFrame);
        const leftPx = cutFrame * pixelsPerFrame - widthPx / 2;
        markers.push({
          key: `pair-${pairKey}`,
          leftPx,
          widthPx,
          label: transitionLabel('cross-dissolve'),
          kind: 'cross-dissolve',
          paired: true,
        });
      }
    } else if (trOut && edgeDuration(trOut) > 0) {
      const duration = edgeDuration(trOut);
      const widthPx = Math.max(4, duration * pixelsPerFrame);
      const clipEnd = getClipEnd(clip);
      markers.push({
        key: `out-${clip.id}`,
        leftPx: clipEnd * pixelsPerFrame - widthPx,
        widthPx,
        label: transitionLabel(trOut.videoKind),
        kind: trOut.videoKind,
        paired: false,
      });
    }

    if (!pairedIn && trIn && edgeDuration(trIn) > 0) {
      const duration = edgeDuration(trIn);
      const widthPx = Math.max(4, duration * pixelsPerFrame);
      markers.push({
        key: `in-${clip.id}`,
        leftPx: clip.start * pixelsPerFrame,
        widthPx,
        label: transitionLabel(trIn.videoKind),
        kind: trIn.videoKind,
        paired: false,
      });
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
