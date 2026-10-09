import { ok } from '@timeline/shared';
import { createAudioTrack, createVideoTrack } from '../model/factory';
import { findTrack } from '../model/queries';
import { type Project, type SequenceId, type Track, type TrackId, type TrackKind } from '../model/types';
import { type EditResult, fail, replaceTrack, updateSequence } from './common';

export const MAX_TRACKS_PER_KIND = 99;

export interface AddTrackInput {
  readonly sequenceId: SequenceId;
  readonly kind: TrackKind;
  readonly trackId?: TrackId;
}

/** Appends a track: video tracks are added on top, audio tracks at the bottom. */
export function addTrack(project: Project, input: AddTrackInput): EditResult {
  return updateSequence(project, input.sequenceId, (sequence) => {
    const list = input.kind === 'video' ? sequence.videoTracks : sequence.audioTracks;
    if (list.length >= MAX_TRACKS_PER_KIND) return fail('INVALID_ARGUMENT', 'Maximum number of tracks reached.');
    if (input.trackId && findTrack(sequence, input.trackId)) return fail('CONFLICT', 'Track already exists.');
    if (input.kind === 'video') {
      const track = createVideoTrack(list.length, input.trackId);
      return ok({ ...sequence, videoTracks: [...sequence.videoTracks, track] });
    }
    const track = createAudioTrack(list.length, input.trackId);
    return ok({ ...sequence, audioTracks: [...sequence.audioTracks, track] });
  });
}

export interface TrackChanges {
  readonly name?: string;
  readonly enabled?: boolean;
  readonly locked?: boolean;
  /** Video tracks only. */
  readonly visible?: boolean;
  /** Audio tracks only. */
  readonly muted?: boolean;
}

export interface UpdateTrackInput {
  readonly sequenceId: SequenceId;
  readonly trackId: TrackId;
  readonly changes: TrackChanges;
}

export function updateTrack(project: Project, input: UpdateTrackInput): EditResult {
  return updateSequence(project, input.sequenceId, (sequence) => {
    const track = findTrack(sequence, input.trackId);
    if (!track) return fail('NOT_FOUND', `Track ${input.trackId} does not exist.`);
    const { changes } = input;
    const name = changes.name?.trim();
    if (changes.name !== undefined && !name) return fail('INVALID_ARGUMENT', 'Track name cannot be empty.');
    const base = {
      name: name ?? track.name,
      enabled: changes.enabled ?? track.enabled,
      locked: changes.locked ?? track.locked,
    };
    const next: Track =
      track.kind === 'video'
        ? { ...track, ...base, visible: changes.visible ?? track.visible }
        : { ...track, ...base, muted: changes.muted ?? track.muted };
    const unchanged = (Object.keys(next) as (keyof Track)[]).every(
      (key) => (next as unknown as Record<string, unknown>)[key] === (track as unknown as Record<string, unknown>)[key],
    );
    return ok(unchanged ? sequence : replaceTrack(sequence, next));
  });
}
