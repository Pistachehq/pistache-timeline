import {
  defaultEdgeTransition,
  findTrack,
  getClipEnd,
  mergeClipTransitions,
  type Clip,
  type ClipEdgeTransition,
  type ClipEffects,
  type ClipId,
  type Project,
  type SequenceId,
  updateClipEffects,
  updateClipText,
  updateClipTransitions,
} from '@timeline/core';
import { type EffectLibraryPayload } from '../dnd';

function edgeFromPayload(payload: EffectLibraryPayload): ClipEdgeTransition {
  const base = defaultEdgeTransition();
  if (payload.kind !== 'transition-in' && payload.kind !== 'transition-out') {
    return base;
  }
  const libraryId =
    payload.videoKind === 'library' ? (payload.libraryId ?? null) : null;
  return {
    durationFrames: payload.durationFrames ?? base.durationFrames,
    videoKind: payload.videoKind,
    libraryId,
    audioCurve: payload.audioCurve,
    ...(payload.affectsVideo === false ? { affectsVideo: false } : {}),
  };
}

export function applyEffectPayloadToClip(
  project: Project,
  sequenceId: SequenceId,
  clipId: ClipId,
  payload: EffectLibraryPayload,
): Project | null {
  const sequence = project.sequences[sequenceId];
  const clip = sequence?.clips[clipId];
  if (!sequence || !clip) return null;

  switch (payload.kind) {
    case 'transition-in':
    case 'transition-out': {
      const edge = edgeFromPayload(payload);
      const side = payload.kind === 'transition-in' ? 'in' : 'out';
      const next = applyTransitions(project, sequenceId, clip, side === 'in' ? { in: edge } : { out: edge });
      if (!next || edge.videoKind !== 'cross-dissolve' || edge.affectsVideo === false) return next;
      return pairCrossDissolve(next, sequenceId, clip.id, side, edge) ?? next;
    }
    case 'video-effect':
      return applyEffects(project, sequenceId, clip, {
        video: [...clip.effects.video, payload.effect],
        audio: [...clip.effects.audio],
      });
    case 'audio-effect':
      return applyEffects(project, sequenceId, clip, {
        video: [...clip.effects.video],
        audio: [...clip.effects.audio, payload.effect],
      });
    case 'text-animation': {
      if (!clip.text) return null;
      const result = updateClipText(project, {
        sequenceId,
        clipId: clip.id,
        text: payload.edge === 'out' ? { outAnimation: payload.animation } : { animation: payload.animation },
      });
      return result.ok ? result.value : null;
    }
    default:
      return null;
  }
}

function applyTransitions(
  project: Project,
  sequenceId: SequenceId,
  clip: Clip,
  patch: Parameters<typeof mergeClipTransitions>[1],
): Project | null {
  const result = updateClipTransitions(project, {
    sequenceId,
    clipId: clip.id,
    transitions: mergeClipTransitions(clip.transitions, patch),
  });
  return result.ok ? result.value : null;
}

function applyEffects(
  project: Project,
  sequenceId: SequenceId,
  clip: Clip,
  effects: ClipEffects,
): Project | null {
  const result = updateClipEffects(project, { sequenceId, clipId: clip.id, effects });
  return result.ok ? result.value : null;
}

/**
 * A cross dissolve needs both sides of the cut. Dropping it on one edge also
 * sets the matching edge of the clip that touches it on the same track.
 */
function pairCrossDissolve(
  project: Project,
  sequenceId: SequenceId,
  clipId: ClipId,
  side: 'in' | 'out',
  edge: ClipEdgeTransition,
): Project | null {
  const sequence = project.sequences[sequenceId];
  const clip = sequence?.clips[clipId];
  if (!sequence || !clip) return null;
  const track = findTrack(sequence, clip.trackId);
  if (!track || track.locked) return null;
  const neighbor = track.clipIds
    .map((id) => sequence.clips[id])
    .find((other) =>
      other && other.id !== clip.id && (side === 'in' ? getClipEnd(other) === clip.start : other.start === getClipEnd(clip)),
    );
  if (!neighbor) return null;
  const existing = side === 'in' ? neighbor.transitions.out : neighbor.transitions.in;
  if (existing && existing.videoKind === 'cross-dissolve') return null;
  return applyTransitions(project, sequenceId, neighbor, side === 'in' ? { out: edge } : { in: edge });
}

/**
 * Transitions (video, audio and text) land on the tail when dropped on the
 * second half of a clip and on the head otherwise.
 */
export function aimTransition(payload: EffectLibraryPayload, fraction: number): EffectLibraryPayload {
  if (payload.kind === 'text-animation') return { ...payload, edge: fraction >= 0.5 ? 'out' : 'in' };
  if (payload.kind !== 'transition-in' && payload.kind !== 'transition-out') return payload;
  return { ...payload, kind: fraction >= 0.5 ? 'transition-out' : 'transition-in' };
}

/** Whether this preset applies on a clip of the given track kind. */
export function effectPayloadMatchesTrack(
  payload: EffectLibraryPayload,
  trackKind: 'video' | 'audio',
): boolean {
  switch (payload.kind) {
    case 'transition-in':
    case 'transition-out':
      return true;
    case 'video-effect':
      return trackKind === 'video';
    case 'audio-effect':
      return true;
    case 'text-animation':
      return trackKind === 'video';
    default:
      return false;
  }
}

const KEYER_KINDS: ReadonlySet<string> = new Set(['chroma-key', 'luma-key', 'screen-replace']);

/** Text transitions only land on text clips. Audio presets and keyers skip text clips. */
export function effectPayloadMatchesClip(
  payload: EffectLibraryPayload,
  clip: Clip,
  trackKind: 'video' | 'audio',
): boolean {
  if (payload.kind === 'text-animation') return clip.text !== null;
  if (clip.text) {
    if (payload.kind === 'audio-effect') return false;
    if (payload.kind === 'video-effect' && KEYER_KINDS.has(payload.effect.kind)) return false;
    if ((payload.kind === 'transition-in' || payload.kind === 'transition-out') && payload.affectsVideo === false) {
      return false;
    }
    return trackKind === 'video';
  }
  return effectPayloadMatchesTrack(payload, trackKind);
}
