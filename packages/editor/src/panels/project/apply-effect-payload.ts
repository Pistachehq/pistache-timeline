import {
  defaultEdgeTransition,
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
      return applyTransitions(project, sequenceId, clip, { in: edgeFromPayload(payload) });
    case 'transition-out':
      return applyTransitions(project, sequenceId, clip, { out: edgeFromPayload(payload) });
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
        text: { animation: payload.animation },
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

/** Text transitions only land on text clips. Audio presets skip text clips. */
export function effectPayloadMatchesClip(
  payload: EffectLibraryPayload,
  clip: Clip,
  trackKind: 'video' | 'audio',
): boolean {
  if (payload.kind === 'text-animation') return clip.text !== null;
  if (clip.text) {
    if (payload.kind === 'audio-effect') return false;
    if ((payload.kind === 'transition-in' || payload.kind === 'transition-out') && payload.affectsVideo === false) {
      return false;
    }
    return trackKind === 'video';
  }
  return effectPayloadMatchesTrack(payload, trackKind);
}
