import { mediaTimeToFrames } from '../time/rational';
import {
  type AudioTrack,
  type Clip,
  type ClipId,
  type MediaAsset,
  type Project,
  type Sequence,
  type SequenceId,
  type Track,
  type TrackId,
  type VideoTrack,
} from './types';

export function getSequence(project: Project, sequenceId: SequenceId): Sequence | undefined {
  return project.sequences[sequenceId];
}

export function getActiveSequence(project: Project): Sequence | undefined {
  return project.sequences[project.activeSequenceId];
}

export function getMediaAssets(project: Project): MediaAsset[] {
  return Object.values(project.mediaAssets);
}

/** All tracks, video first (bottom to top) then audio. */
export function getTracks(sequence: Sequence): Track[] {
  return [...sequence.videoTracks, ...sequence.audioTracks];
}

export function findTrack(sequence: Sequence, trackId: TrackId): Track | undefined {
  return (
    sequence.videoTracks.find((track) => track.id === trackId) ??
    sequence.audioTracks.find((track) => track.id === trackId)
  );
}

export function getClip(sequence: Sequence, clipId: ClipId): Clip | undefined {
  return sequence.clips[clipId];
}

export function getClipDuration(clip: Clip): number {
  return clip.sourceOut - clip.sourceIn;
}

/** Exclusive end frame of the clip on the sequence. */
export function getClipEnd(clip: Clip): number {
  return clip.start + getClipDuration(clip);
}

/**
 * When `linkId` is set, audio is expected on the paired A-track clip only
 * (Premiere-style linked clip). The video file's embedded audio is not mixed in.
 */
export function clipContributesEmbeddedAudio(clip: Clip): boolean {
  return clip.linkId === null && !clip.audio.muted;
}

export function getTrackClips(sequence: Sequence, track: Track): Clip[] {
  const clips: Clip[] = [];
  for (const id of track.clipIds) {
    const clip = sequence.clips[id];
    if (clip) clips.push(clip);
  }
  return clips;
}

/** Sequence duration in frames: the end of the last clip on any track. */
export function getSequenceDuration(sequence: Sequence): number {
  let end = 0;
  for (const clip of Object.values(sequence.clips)) {
    end = Math.max(end, getClipEnd(clip));
  }
  return end;
}

/** Number of whole sequence frames available in an asset. */
export function getAssetFrameCount(asset: MediaAsset, sequence: Sequence): number {
  return mediaTimeToFrames(asset.duration, sequence.frameRate, 'floor');
}

/**
 * Clips of a track that intersect `[startFrame, endFrame)`. Relies on the
 * ordering invariant (clips sorted and non-overlapping, so ends are sorted
 * too) to binary-search the first visible clip. Intended for virtualised
 * rendering of long timelines.
 */
export function getClipsInRange(
  sequence: Sequence,
  track: Track,
  startFrame: number,
  endFrame: number,
): Clip[] {
  const ids = track.clipIds;
  let low = 0;
  let high = ids.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const clip = sequence.clips[ids[mid]!];
    if (clip && getClipEnd(clip) <= startFrame) low = mid + 1;
    else high = mid;
  }
  const result: Clip[] = [];
  for (let i = low; i < ids.length; i++) {
    const clip = sequence.clips[ids[i]!];
    if (!clip) continue;
    if (clip.start >= endFrame) break;
    result.push(clip);
  }
  return result;
}

export function getClipAtFrame(sequence: Sequence, track: Track, frame: number): Clip | undefined {
  return getClipsInRange(sequence, track, frame, frame + 1)[0];
}

/** Clips that can be split at `frame` (cut point strictly inside the clip). */
/** Audio track paired with a video track at the same index (V1 ↔ A1). */
export function pairedAudioTrack(sequence: Sequence, videoTrackId: TrackId): AudioTrack | undefined {
  const index = sequence.videoTracks.findIndex((track) => track.id === videoTrackId);
  return index >= 0 ? sequence.audioTracks[index] : undefined;
}

export function pairedVideoTrack(sequence: Sequence, audioTrackId: TrackId): VideoTrack | undefined {
  const index = sequence.audioTracks.findIndex((track) => track.id === audioTrackId);
  return index >= 0 ? sequence.videoTracks[index] : undefined;
}

/** Topmost active audio clip at `frame` (last matching track wins). */
export function getTopmostAudioClipAt(sequence: Sequence, frame: number): ActiveAudioClip | null {
  let active: ActiveAudioClip | null = null;
  for (const track of sequence.audioTracks) {
    if (!track.enabled || track.muted) continue;
    const clip = getClipAtFrame(sequence, track, frame);
    if (clip?.enabled && !clip.audio.muted) active = { clip, track };
  }
  return active;
}

export function getSplittableClipsAt(sequence: Sequence, frame: number): Clip[] {
  if (!Number.isInteger(frame) || frame < 0) return [];
  return Object.values(sequence.clips).filter((clip) => clip.start < frame && frame < getClipEnd(clip));
}

export interface ActiveVideoClip {
  readonly clip: Clip;
  readonly track: VideoTrack;
}

/**
 * The clip shown in the program monitor at `frame`: the topmost enabled,
 * visible video track that has an enabled clip under the playhead.
 */
export function getTopmostVideoClipAt(sequence: Sequence, frame: number): ActiveVideoClip | null {
  for (let i = sequence.videoTracks.length - 1; i >= 0; i--) {
    const track = sequence.videoTracks[i];
    if (!track?.enabled || !track.visible) continue;
    const clip = getClipAtFrame(sequence, track, frame);
    if (clip?.enabled) return { clip, track };
  }
  return null;
}

export interface ActiveAudioClip {
  readonly clip: Clip;
  readonly track: AudioTrack;
}

/** Enabled, unmuted audio clips on enabled audio tracks at `frame`. */
export function getActiveAudioClipsAt(sequence: Sequence, frame: number): ActiveAudioClip[] {
  const active: ActiveAudioClip[] = [];
  for (const track of sequence.audioTracks) {
    if (!track.enabled || track.muted) continue;
    const clip = getClipAtFrame(sequence, track, frame);
    if (!clip?.enabled || clip.audio.muted) continue;
    active.push({ clip, track });
  }
  return active;
}

/** Audio clips that should be heard at `frame` (audio tracks + program video clip). */
export function getAudibleClipsAt(
  sequence: Sequence,
  frame: number,
  assets: Readonly<Record<MediaAsset['id'], MediaAsset>>,
): Clip[] {
  const clips: Clip[] = [];
  for (const { clip } of getActiveAudioClipsAt(sequence, frame)) {
    const asset = assets[clip.assetId];
    if (asset?.hasAudio) clips.push(clip);
  }
  const program = getTopmostVideoClipAt(sequence, frame);
  if (program && clipContributesEmbeddedAudio(program.clip)) {
    const asset = assets[program.clip.assetId];
    if (asset?.hasAudio && !clips.some((c) => c.id === program.clip.id)) clips.push(program.clip);
  }
  return clips;
}

/** Number of clips on the sequence that reference the given asset. */
export function countAssetUsage(sequence: Sequence, assetId: string): number {
  let count = 0;
  for (const clip of Object.values(sequence.clips)) {
    if (clip.assetId === assetId) count++;
  }
  return count;
}
