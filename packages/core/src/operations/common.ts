import { type ErrorCode, TimelineError, err, ok, type Err, type Result } from '@timeline/shared';
import { type ClipId, type Project, type Sequence, type SequenceId, type Track } from '../model/types';

/** Outcome of an editing operation: the new project or a domain error. */
export type EditResult = Result<Project, TimelineError>;

export function fail(code: ErrorCode, message: string): Err<TimelineError> {
  return err(new TimelineError(code, message));
}

/** Applies `update` to one sequence and returns the project with it replaced. */
export function updateSequence(
  project: Project,
  sequenceId: SequenceId,
  update: (sequence: Sequence) => Result<Sequence, TimelineError>,
): EditResult {
  const sequence = project.sequences[sequenceId];
  if (!sequence) return fail('NOT_FOUND', `Sequence ${sequenceId} does not exist.`);
  const result = update(sequence);
  if (!result.ok) return result;
  if (result.value === sequence) return ok(project);
  return ok({ ...project, sequences: { ...project.sequences, [sequenceId]: result.value } });
}

/** Replaces a track (matched by id) in whichever track list contains it. */
export function replaceTrack(sequence: Sequence, track: Track): Sequence {
  if (track.kind === 'video') {
    return {
      ...sequence,
      videoTracks: sequence.videoTracks.map((t) => (t.id === track.id ? track : t)),
    };
  }
  return {
    ...sequence,
    audioTracks: sequence.audioTracks.map((t) => (t.id === track.id ? track : t)),
  };
}

/** Returns clip ids ordered by start frame using the given clip lookup. */
export function sortClipIds(
  clipIds: readonly ClipId[],
  clips: Sequence['clips'],
): ClipId[] {
  return [...clipIds].sort((a, b) => (clips[a]?.start ?? 0) - (clips[b]?.start ?? 0));
}
