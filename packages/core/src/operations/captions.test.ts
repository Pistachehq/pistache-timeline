import { unwrap } from '@timeline/shared';
import { describe, expect, it } from 'vitest';
import { CAPTION_DESIGNS } from '../model/caption-styles';
import { validateProjectInvariants } from '../model/invariants';
import { type ClipId } from '../model/types';
import { activeSequence, setupProject } from '../test/fixtures';
import { addCaptionClips, captionClipsFor, removeCaptionClips, updateCaptionLook } from './captions';
import { addClip, removeClips } from './clips';

const AUDIO = 'clip_audio' as ClipId;

describe('captions', () => {
  it('adds a shared look, keeps each line, and leaves with the audio clip', () => {
    const { project, sequence, audio } = setupProject();
    const withAudio = unwrap(
      addClip(project, {
        sequenceId: sequence.id,
        trackId: sequence.audioTracks[0]!.id,
        assetId: audio.id,
        start: 0,
        clipId: AUDIO,
      }),
    );
    const added = unwrap(
      addCaptionClips(withAudio, {
        sequenceId: sequence.id,
        trackId: sequence.videoTracks[2]!.id,
        captionSourceId: AUDIO,
        positionY: 380,
        fontSize: 52,
        text: CAPTION_DESIGNS[0]!.text,
        cues: [
          { start: 0, durationFrames: 30, content: 'Hola' },
          { start: 40, durationFrames: 20, content: '' },
        ],
      }),
    );
    const captions = captionClipsFor(activeSequence(added), AUDIO);
    expect(captions.map((clip) => clip.text?.content)).toEqual(['Hola', '']);
    expect(captions[1]?.name).toBe('Caption 2');
    expect(captions[0]?.transform.positionY).toBe(380);
    expect(validateProjectInvariants(added)).toEqual([]);

    const styled = unwrap(
      updateCaptionLook(added, {
        sequenceId: sequence.id,
        captionSourceId: AUDIO,
        fontSize: 36,
        positionY: 10,
        text: CAPTION_DESIGNS[1]!.text,
      }),
    );
    const next = captionClipsFor(activeSequence(styled), AUDIO);
    expect(next[0]?.text?.fontSize).toBe(36);
    expect(next[0]?.text?.content).toBe('Hola');
    expect(next[0]?.text?.backgroundColor).toBe('#000000cc');
    expect(next[0]?.transform.positionY).toBe(10);

    const removed = unwrap(removeCaptionClips(styled, sequence.id, AUDIO));
    expect(captionClipsFor(activeSequence(removed), AUDIO)).toEqual([]);

    const again = unwrap(
      addCaptionClips(removed, {
        sequenceId: sequence.id,
        trackId: sequence.videoTracks[2]!.id,
        captionSourceId: AUDIO,
        positionY: 380,
        fontSize: 52,
        text: CAPTION_DESIGNS[0]!.text,
        cues: [{ start: 0, durationFrames: 30, content: 'Hola' }],
      }),
    );
    const deleted = unwrap(removeClips(again, { sequenceId: sequence.id, clipIds: [AUDIO] }));
    expect(activeSequence(deleted).clips[AUDIO]).toBeUndefined();
    expect(captionClipsFor(activeSequence(deleted), AUDIO)).toEqual([]);
    expect(validateProjectInvariants(deleted)).toEqual([]);
  });
});
