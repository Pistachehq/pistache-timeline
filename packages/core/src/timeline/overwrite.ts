import { type Result } from '@timeline/shared';
import { getClipEnd, getTrackClips } from '../model/queries';
import { sourceFramesForTimeline } from '../model/speed';
import { type Clip, type ClipId, type Sequence, type Track } from '../model/types';
import { type FrameRange, rangesOverlap } from './placement';

export interface SplitClipStep {
  readonly sequence: Sequence;
  readonly leftId: ClipId;
  readonly rightId: ClipId;
}

export type SplitClipFn = (sequence: Sequence, clipId: ClipId, frame: number) => Result<SplitClipStep>;

function trimClipLeading(clip: Clip, newStart: number): Clip {
  const delta = newStart - clip.start;
  return { ...clip, start: newStart, sourceIn: clip.sourceIn + sourceFramesForTimeline(delta, clip.speed) };
}

function trimClipTrailing(clip: Clip, newEnd: number): Clip {
  const delta = getClipEnd(clip) - newEnd;
  return { ...clip, sourceOut: clip.sourceOut - sourceFramesForTimeline(delta, clip.speed) };
}

function deleteClipFromSequence(sequence: Sequence, clipId: ClipId): Sequence {
  const clip = sequence.clips[clipId];
  if (!clip) return sequence;
  const clips = { ...sequence.clips };
  if (clip.linkId) {
    const partner = clips[clip.linkId];
    if (partner) clips[clip.linkId] = { ...partner, linkId: null };
  }
  delete clips[clipId];
  const prune = <T extends Track>(track: T): T =>
    track.clipIds.includes(clipId) ? { ...track, clipIds: track.clipIds.filter((id) => id !== clipId) } : track;
  return {
    ...sequence,
    clips,
    videoTracks: sequence.videoTracks.map(prune),
    audioTracks: sequence.audioTracks.map(prune),
  };
}

function setClip(sequence: Sequence, clip: Clip): Sequence {
  return { ...sequence, clips: { ...sequence.clips, [clip.id]: clip } };
}

/**
 * Removes or trims clips on `track` so `[range.start, range.end)` is free,
 * except for `excludeClipId` when set.
 */
export function eraseRangeOnTrack(
  sequence: Sequence,
  track: Track,
  range: FrameRange,
  excludeClipId: ClipId | null,
  splitClip: SplitClipFn,
): Sequence {
  const { start: ms, end: me } = range;
  let seq = sequence;
  let guard = 0;
  while (guard++ < 256) {
    const overlapping = getTrackClips(seq, track).find((clip) => {
      if (excludeClipId && clip.id === excludeClipId) return false;
      return rangesOverlap({ start: clip.start, end: getClipEnd(clip) }, range);
    });
    if (!overlapping) break;

    const es = overlapping.start;
    const ee = getClipEnd(overlapping);

    if (ms <= es && me >= ee) {
      seq = deleteClipFromSequence(seq, overlapping.id);
      continue;
    }
    if (ms <= es && me < ee) {
      if (me <= es) break;
      seq = setClip(seq, trimClipLeading(overlapping, me));
      continue;
    }
    if (ms > es && me >= ee) {
      if (ms >= ee) break;
      seq = setClip(seq, trimClipTrailing(overlapping, ms));
      continue;
    }
    if (ms <= es || ms >= ee) break;
    const split = splitClip(seq, overlapping.id, ms);
    if (!split.ok) break;
    seq = split.value.sequence;
    const rightId = split.value.rightId;
    const right = seq.clips[rightId];
    if (!right) break;
    const re = getClipEnd(right);
    if (me >= re) {
      seq = deleteClipFromSequence(seq, rightId);
    } else if (me > right.start) {
      const split2 = splitClip(seq, rightId, me);
      if (!split2.ok) break;
      seq = deleteClipFromSequence(split2.value.sequence, split2.value.leftId);
    }
  }
  return seq;
}
