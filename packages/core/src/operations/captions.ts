import { ok } from '@timeline/shared';
import { type CaptionCue } from '../audio/captions';
import { createClip } from '../model/factory';
import { findTrack } from '../model/queries';
import { DEFAULT_CLIP_TEXT, textClipName, type ClipText } from '../model/text';
import { type Clip, type ClipId, type Project, type Sequence, type SequenceId, type TrackId } from '../model/types';
import { isRangeFree } from '../timeline/placement';
import { type EditResult, fail, replaceTrack, sortClipIds, updateSequence } from './common';
import { removeClips } from './clips';

export function captionClipsFor(sequence: Sequence, captionSourceId: ClipId): Clip[] {
  return Object.values(sequence.clips)
    .filter((clip) => clip.captionSourceId === captionSourceId && clip.text !== null)
    .sort((a, b) => a.start - b.start);
}

export interface AddCaptionClipsInput {
  readonly sequenceId: SequenceId;
  readonly trackId: TrackId;
  readonly captionSourceId: ClipId;
  readonly positionY: number;
  readonly fontSize: number;
  readonly text: CaptionDesignPatch;
  readonly cues: readonly CaptionCue[];
}

export type CaptionDesignPatch = Pick<
  ClipText,
  'fontFamily' | 'color' | 'bold' | 'outlineWidth' | 'outlineColor' | 'shadow' | 'backgroundColor'
>;

function styledText(content: string, fontSize: number, look: CaptionDesignPatch): ClipText {
  return {
    ...DEFAULT_CLIP_TEXT,
    ...look,
    content,
    fontSize,
    align: 'center',
    animation: 'none',
    animationFrames: 1,
    italic: false,
    underline: false,
    strike: false,
    letterSpacing: 0,
    fontDataUrl: null,
  };
}

/** Places one text clip per cue. Does not overwrite picture that is already on the track. */
export function addCaptionClips(project: Project, input: AddCaptionClipsInput): EditResult {
  if (input.cues.length === 0) return fail('INVALID_ARGUMENT', 'There are no caption lines to add.');
  return updateSequence(project, input.sequenceId, (sequence) => {
    const source = sequence.clips[input.captionSourceId];
    if (!source) return fail('NOT_FOUND', 'The audio clip no longer exists.');
    const track = findTrack(sequence, input.trackId);
    if (!track) return fail('NOT_FOUND', `Track ${input.trackId} does not exist.`);
    if (track.kind !== 'video') return fail('INVALID_ARGUMENT', 'Captions belong on a video track.');
    if (track.locked) return fail('LOCKED', `Track ${track.name} is locked.`);
    for (const cue of input.cues) {
      if (!isRangeFree(sequence, track, cue.start, cue.durationFrames)) {
        return fail('CONFLICT', `Track ${track.name} is busy where a caption needs to go.`);
      }
    }

    let clips = { ...sequence.clips };
    const ids = [...track.clipIds];
    input.cues.forEach((cue, index) => {
      const content = cue.content;
      const text = styledText(content, input.fontSize, input.text);
      const clip = createClip({
        assetId: null,
        text,
        trackId: track.id,
        name: content.trim() ? textClipName(content) : `Caption ${index + 1}`,
        start: cue.start,
        sourceIn: 0,
        sourceOut: cue.durationFrames,
        captionSourceId: input.captionSourceId,
      });
      const placed: Clip = {
        ...clip,
        transform: { ...clip.transform, positionX: 0, positionY: input.positionY },
      };
      clips = { ...clips, [placed.id]: placed };
      ids.push(placed.id);
    });
    return ok(replaceTrack({ ...sequence, clips }, { ...track, clipIds: sortClipIds(ids, clips) }));
  });
}

export function removeCaptionClips(project: Project, sequenceId: SequenceId, captionSourceId: ClipId): EditResult {
  const sequence = project.sequences[sequenceId];
  if (!sequence) return fail('NOT_FOUND', `Sequence ${sequenceId} does not exist.`);
  const ids = captionClipsFor(sequence, captionSourceId).map((clip) => clip.id);
  if (ids.length === 0) return ok(project);
  return removeClips(project, { sequenceId, clipIds: ids });
}

export interface CaptionLookInput {
  readonly sequenceId: SequenceId;
  readonly captionSourceId: ClipId;
  readonly text?: CaptionDesignPatch;
  readonly fontSize?: number;
  readonly positionY?: number;
}

/** Updates the shared look of every caption generated from one audio clip. */
export function updateCaptionLook(project: Project, input: CaptionLookInput): EditResult {
  return updateSequence(project, input.sequenceId, (sequence) => {
    const captions = captionClipsFor(sequence, input.captionSourceId);
    if (captions.length === 0) return ok(sequence);
    const clips = { ...sequence.clips };
    for (const clip of captions) {
      const track = findTrack(sequence, clip.trackId);
      if (track?.locked) return fail('LOCKED', `Track ${track.name} is locked.`);
      if (!clip.text) continue;
      clips[clip.id] = {
        ...clip,
        transform:
          input.positionY === undefined ? clip.transform : { ...clip.transform, positionX: 0, positionY: input.positionY },
        text: {
          ...clip.text,
          ...(input.text ?? {}),
          ...(input.fontSize === undefined ? {} : { fontSize: input.fontSize }),
          content: clip.text.content,
        },
      };
    }
    return ok({ ...sequence, clips });
  });
}
