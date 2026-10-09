import { clamp, ok } from '@timeline/shared';
import {
  maxTransitionFramesForClip,
  TRANSITION_LIMITS,
  type ClipEdgeTransition,
  type ClipEffects,
  type ClipTransitions,
} from '../model/effects';
import { getClipDuration } from '../model/queries';
import { type Clip, type ClipId, type Project, type SequenceId } from '../model/types';
import { type EditResult, fail, updateSequence } from './common';

function clampDuration(frames: number, maxFrames: number): number {
  return Math.round(
    clamp(frames, TRANSITION_LIMITS.durationFrames.min, Math.min(TRANSITION_LIMITS.durationFrames.max, maxFrames)),
  );
}

function normalizeEdge(edge: ClipEdgeTransition | null, maxFrames: number): ClipEdgeTransition | null {
  if (!edge) return null;
  const durationFrames = clampDuration(edge.durationFrames, maxFrames);
  if (durationFrames <= 0 || edge.videoKind === 'none') return null;
  if (edge.videoKind === 'library' && !edge.libraryId) return null;
  const libraryId = edge.videoKind === 'library' ? edge.libraryId : null;
  return { ...edge, durationFrames, libraryId };
}

export interface UpdateClipTransitionsInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  readonly transitions: ClipTransitions;
}

export function updateClipTransitions(project: Project, input: UpdateClipTransitionsInput): EditResult {
  return updateClipField(project, input.sequenceId, input.clipId, (clip) => ({
    ...clip,
    transitions: {
      in: normalizeEdge(input.transitions.in, maxTransitionFramesForClip(getClipDuration(clip))),
      out: normalizeEdge(input.transitions.out, maxTransitionFramesForClip(getClipDuration(clip))),
    },
  }));
}

export interface UpdateClipEffectsInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  readonly effects: ClipEffects;
}

export function updateClipEffects(project: Project, input: UpdateClipEffectsInput): EditResult {
  return updateClipField(project, input.sequenceId, input.clipId, (clip) => ({
    ...clip,
    effects: {
      video: [...input.effects.video],
      audio: [...input.effects.audio],
    },
  }));
}

function updateClipField(
  project: Project,
  sequenceId: SequenceId,
  clipId: ClipId,
  update: (clip: Clip) => Clip,
): EditResult {
  return updateSequence(project, sequenceId, (sequence) => {
    const clip = sequence.clips[clipId];
    if (!clip) return fail('NOT_FOUND', `Clip ${clipId} does not exist.`);
    const next = update(clip);
    if (next === clip) return ok(sequence);
    return ok({ ...sequence, clips: { ...sequence.clips, [clipId]: next } });
  });
}

export function mergeClipTransitions(current: ClipTransitions, patch: Partial<ClipTransitions>): ClipTransitions {
  return {
    in: patch.in !== undefined ? normalizeEdge(patch.in, TRANSITION_LIMITS.durationFrames.max) : current.in,
    out: patch.out !== undefined ? normalizeEdge(patch.out, TRANSITION_LIMITS.durationFrames.max) : current.out,
  };
}
