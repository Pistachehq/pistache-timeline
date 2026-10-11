import { ok } from '@timeline/shared';
import { AUDIO_LIMITS } from '../model/defaults';
import { createAudioTrack, createVideoTrack } from '../model/factory';
import { findTrack } from '../model/queries';
import { type Project, type SequenceId, type Track, type TrackId, type TrackKind } from '../model/types';
import { type EditResult, fail, replaceTrack, updateSequence } from './common';

function limitVolume(value: number | undefined, current: number): number {
  if (value === undefined) return current;
  return Math.max(AUDIO_LIMITS.volume.min, value);
}

export const MAX_TRACKS_PER_KIND = 99;

/** V1–V3 and A1–A3 stay. Tracks created after those can be removed once empty. */
export const BASE_TRACKS_PER_KIND = 3;

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

export interface RemoveTrackInput {
  readonly sequenceId: SequenceId;
  readonly trackId: TrackId;
}

/**
 * Removes one video or audio track past the base three, and only when it holds
 * no clips. Deleting a middle extra track leaves later extras removable.
 */
export function removeTrack(project: Project, input: RemoveTrackInput): EditResult {
  return updateSequence(project, input.sequenceId, (sequence) => {
    const track = findTrack(sequence, input.trackId);
    if (!track) return fail('NOT_FOUND', `Track ${input.trackId} does not exist.`);
    const list = track.kind === 'video' ? sequence.videoTracks : sequence.audioTracks;
    const index = list.findIndex((item) => item.id === track.id);
    if (index < BASE_TRACKS_PER_KIND) {
      return fail('INVALID_ARGUMENT', `${track.name} is a base track and cannot be deleted.`);
    }
    const occupied =
      track.clipIds.length > 0 || Object.values(sequence.clips).some((clip) => clip.trackId === track.id);
    if (occupied) {
      return fail('CONFLICT', `Clear ${track.name} before deleting it.`);
    }
    if (track.kind === 'video') {
      return ok({ ...sequence, videoTracks: sequence.videoTracks.filter((item) => item.id !== track.id) });
    }
    return ok({ ...sequence, audioTracks: sequence.audioTracks.filter((item) => item.id !== track.id) });
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
  /** Audio tracks only. */
  readonly volume?: number;
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
        : {
            ...track,
            ...base,
            muted: changes.muted ?? track.muted,
            volume: limitVolume(changes.volume, track.volume),
          };
    const unchanged = (Object.keys(next) as (keyof Track)[]).every(
      (key) => (next as unknown as Record<string, unknown>)[key] === (track as unknown as Record<string, unknown>)[key],
    );
    return ok(unchanged ? sequence : replaceTrack(sequence, next));
  });
}
