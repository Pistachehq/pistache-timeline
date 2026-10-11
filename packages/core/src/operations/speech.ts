import { refitClipAnimation } from '../model/animation';
import { textClipName } from '../model/text';
import { countAssetUsage, findTrack, getAssetFrameCount, getClipDuration, getSequence } from '../model/queries';
import { newClipId } from '../model/factory';
import { sourceFramesForTimeline } from '../model/speed';
import { isRangeFree } from '../timeline/placement';
import {
  type Clip,
  type ClipId,
  type MediaAssetId,
  type Project,
  type Sequence,
  type SequenceId,
  type TrackId,
} from '../model/types';
import { ok, type Result, type TimelineError } from '@timeline/shared';
import { addClip } from './clips';
import { type EditResult, fail, updateSequence } from './common';
import { removeMediaAsset } from './media';
import { addTrack } from './tracks';

export interface MarkSpeechLinkInput {
  readonly sequenceId: SequenceId;
  readonly textClipId: ClipId;
  readonly audioClipId: ClipId;
}

/** Links a text clip to the audio clip that speaks it. */
export function markSpeechLink(project: Project, input: MarkSpeechLinkInput): EditResult {
  return updateSequence(project, input.sequenceId, (sequence) => {
    const text = sequence.clips[input.textClipId];
    const audio = sequence.clips[input.audioClipId];
    if (!text?.text) return fail('INVALID_ARGUMENT', 'Speech belongs on a text clip.');
    if (!audio || audio.text) return fail('INVALID_ARGUMENT', 'Speech audio must be an audio clip.');
    return ok({
      ...sequence,
      clips: {
        ...sequence.clips,
        [text.id]: { ...text, speaks: true, linkId: audio.id },
        [audio.id]: { ...audio, linkId: text.id, speechSourceId: text.id },
      },
    });
  });
}

export interface ReplaceSpokenAudioInput {
  readonly sequenceId: SequenceId;
  readonly clipId: ClipId;
  /** Words that were synthesized. The take is dropped when the clip text no longer matches. */
  readonly spokenText: string;
  readonly assetId: MediaAssetId;
  /** Timeline length of the new recording at 100% speed. */
  readonly durationFrames: number;
  /** Previous take to drop once nothing else uses it. */
  readonly retireAssetId?: MediaAssetId | null;
}

/**
 * Points the linked voice clip at a new recording and keeps the text on screen
 * for at least as long as the speech. A text clip the user already made longer
 * than the previous take stays that long.
 */
export function replaceSpokenAudio(project: Project, input: ReplaceSpokenAudioInput): EditResult {
  const sequence = getSequence(project, input.sequenceId);
  if (!sequence) return fail('NOT_FOUND', `Sequence ${input.sequenceId} does not exist.`);
  const text = sequence.clips[input.clipId];
  if (!text?.text || !text.speaks) return fail('NOT_FOUND', 'This clip has no spoken text.');
  if (text.text.content !== input.spokenText) {
    return fail('CONFLICT', 'The text changed while the voice was generated.');
  }
  const asset = project.mediaAssets[input.assetId];
  if (!asset?.hasAudio) return fail('NOT_FOUND', 'Spoken audio is missing.');
  const frames = Math.min(Math.round(input.durationFrames), getAssetFrameCount(asset, sequence));
  if (!Number.isInteger(frames) || frames < 1) return fail('INVALID_ARGUMENT', 'Spoken audio has no duration.');

  const textTrack = findTrack(sequence, text.trackId);
  if (textTrack?.locked) return fail('LOCKED', `${textTrack.name} is locked.`);

  const existing = speechPartner(sequence, text);
  if (existing) {
    const audioTrack = findTrack(sequence, existing.trackId);
    if (audioTrack?.locked) return fail('LOCKED', `${audioTrack.name} is locked.`);
  }

  let working = project;
  let audioClipId: ClipId;
  if (existing) {
    audioClipId = existing.id;
  } else {
    const placed = placeSpeechClip(working, sequence, text, input.assetId, frames);
    if (!placed.ok) return placed;
    working = placed.value.project;
    audioClipId = placed.value.audioId;
  }

  const next = updateSequence(working, input.sequenceId, (current) => {
    const liveText = current.clips[text.id];
    const audio = current.clips[audioClipId];
    if (!liveText?.text || !audio) return fail('NOT_FOUND', 'Spoken clips are missing.');
    if (liveText.text.content !== input.spokenText) {
      return fail('CONFLICT', 'The text changed while the voice was generated.');
    }
    const previousDuration = existing ? getClipDuration(existing) : null;
    const textDuration = getClipDuration(liveText);
    const nextTextDuration =
      previousDuration !== null && textDuration === previousDuration ? frames : Math.max(textDuration, frames);
    const textSourceOut = liveText.sourceIn + sourceFramesForTimeline(nextTextDuration, liveText.speed);
    const audioSourceOut = sourceFramesForTimeline(frames, audio.speed);
    const name = textClipName(input.spokenText);
    return okClips(current, {
      [liveText.id]: {
        ...liveText,
        speaks: true,
        spokenText: input.spokenText,
        linkId: audio.id,
        sourceOut: Math.max(liveText.sourceIn + 1, textSourceOut),
        name,
        animation: refitClipAnimation(liveText.animation ?? {}, 0, nextTextDuration),
      },
      [audio.id]: {
        ...audio,
        assetId: input.assetId,
        name,
        start: existing && existing.start !== text.start ? audio.start : liveText.start,
        sourceIn: 0,
        sourceOut: Math.max(1, audioSourceOut),
        linkId: liveText.id,
        speechSourceId: liveText.id,
      },
    });
  });
  if (!next.ok) return next;

  const retire = input.retireAssetId;
  if (!retire || retire === input.assetId) return next;
  const stillUsed = Object.values(next.value.sequences).some((item) => countAssetUsage(item, retire) > 0);
  if (stillUsed) return next;
  return removeMediaAsset(next.value, retire);
}

function speechPartner(sequence: Sequence, text: Clip): Clip | undefined {
  if (!text.linkId) return undefined;
  const audio = sequence.clips[text.linkId];
  if (!audio || audio.speechSourceId !== text.id) return undefined;
  return audio;
}

function placeSpeechClip(
  project: Project,
  sequence: Sequence,
  text: Clip,
  assetId: MediaAssetId,
  frames: number,
): Result<{ readonly project: Project; readonly audioId: ClipId }, TimelineError> {
  let working = project;
  let current = sequence;
  let trackId: TrackId | undefined;
  for (const track of current.audioTracks) {
    if (track.locked || !isRangeFree(current, track, text.start, frames)) continue;
    trackId = track.id;
    break;
  }
  if (!trackId) {
    const added = addTrack(working, { sequenceId: sequence.id, kind: 'audio' });
    if (!added.ok) return added;
    working = added.value;
    const created = getSequence(working, sequence.id)?.audioTracks.at(-1);
    if (!created) return fail('NOT_FOUND', 'Could not add an audio track.');
    trackId = created.id;
    current = getSequence(working, sequence.id) ?? current;
  }
  const audioId = newClipId();
  const placed = addClip(working, {
    sequenceId: sequence.id,
    trackId,
    assetId,
    start: text.start,
    sourceIn: 0,
    sourceOut: frames,
    clipId: audioId,
  });
  if (!placed.ok) return placed;
  return ok({ project: placed.value, audioId });
}

function okClips(sequence: Sequence, clips: Record<string, Clip>) {
  return { ok: true as const, value: { ...sequence, clips: { ...sequence.clips, ...clips } } };
}
