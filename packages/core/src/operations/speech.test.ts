import { unwrap } from '@timeline/shared';
import { describe, expect, it } from 'vitest';
import { createMediaAsset, createProject } from '../model/factory';
import { getClipDuration } from '../model/queries';
import { type ClipId, type MediaAssetId } from '../model/types';
import { mediaTimeFromSeconds } from '../time/rational';
import { activeSequence } from '../test/fixtures';
import { addClip, addTextClip, removeClips } from './clips';
import { addMediaAssets } from './media';
import { markSpeechLink, replaceSpokenAudio } from './speech';

const TEXT = 'clip_text' as ClipId;
const AUDIO = 'clip_voice' as ClipId;

function audioAsset(id: string, seconds: number) {
  return createMediaAsset({
    id: id as MediaAssetId,
    name: id,
    kind: 'audio',
    source: {
      kind: 'local-file',
      fileName: `${id}.wav`,
      size: 100,
      lastModified: 1,
      mimeType: 'audio/wav',
      path: null,
    },
    duration: mediaTimeFromSeconds(seconds),
    hasVideo: false,
    hasAudio: true,
    now: new Date('2026-01-01T00:00:00Z'),
  });
}

function spokenProject(textSeconds: number, audioSeconds: number) {
  const project = createProject({ now: new Date('2026-01-01T00:00:00Z') });
  const sequence = activeSequence(project);
  const fps = sequence.frameRate.numerator / sequence.frameRate.denominator;
  const withAssets = unwrap(addMediaAssets(project, [audioAsset('voice_a', audioSeconds), audioAsset('voice_b', 3)]));
  const withText = unwrap(
    addTextClip(withAssets, {
      sequenceId: sequence.id,
      trackId: sequence.videoTracks[0]!.id,
      start: 30,
      durationFrames: Math.round(fps * textSeconds),
      clipId: TEXT,
      content: 'Hello',
    }),
  );
  const seq = activeSequence(withText);
  const withAudio = unwrap(
    addClip(withText, {
      sequenceId: seq.id,
      trackId: seq.audioTracks[0]!.id,
      assetId: 'voice_a' as MediaAssetId,
      start: 30,
      sourceOut: Math.round(fps * audioSeconds),
      clipId: AUDIO,
    }),
  );
  return unwrap(
    markSpeechLink(withAudio, { sequenceId: seq.id, textClipId: TEXT, audioClipId: AUDIO }),
  );
}

describe('replaceSpokenAudio', () => {
  it('keeps a text clip that is already longer than the voice', () => {
    const project = spokenProject(5, 0.5);
    const sequence = activeSequence(project);
    const before = sequence.clips[TEXT]!;
    const updated = unwrap(
      replaceSpokenAudio(project, {
        sequenceId: sequence.id,
        clipId: TEXT,
        spokenText: 'Hello',
        assetId: 'voice_b' as MediaAssetId,
        durationFrames: 40,
        retireAssetId: 'voice_a' as MediaAssetId,
      }),
    );
    const next = activeSequence(updated);
    const text = next.clips[TEXT]!;
    const audio = next.clips[AUDIO]!;
    expect(getClipDuration(text)).toBe(getClipDuration(before));
    expect(getClipDuration(audio)).toBe(40);
    expect(audio.assetId).toBe('voice_b');
    expect(text.spokenText).toBe('Hello');
    expect(text.linkId).toBe(AUDIO);
    expect(audio.speechSourceId).toBe(TEXT);
    expect(updated.mediaAssets['voice_a' as MediaAssetId]).toBeUndefined();
  });

  it('resizes both clips when the text still matches the previous voice', () => {
    const project = spokenProject(2, 2);
    const sequence = activeSequence(project);
    const next = activeSequence(
      unwrap(
        replaceSpokenAudio(project, {
          sequenceId: sequence.id,
          clipId: TEXT,
          spokenText: 'Hello',
          assetId: 'voice_b' as MediaAssetId,
          durationFrames: 90,
        }),
      ),
    );
    expect(getClipDuration(next.clips[TEXT]!)).toBe(90);
    expect(getClipDuration(next.clips[AUDIO]!)).toBe(90);
  });
});

describe('removeClips', () => {
  it('removes the linked voice when the spoken text is deleted', () => {
    const project = spokenProject(5, 1);
    const sequence = activeSequence(project);
    const next = activeSequence(unwrap(removeClips(project, { sequenceId: sequence.id, clipIds: [TEXT] })));
    expect(next.clips[TEXT]).toBeUndefined();
    expect(next.clips[AUDIO]).toBeUndefined();
  });

  it('stops speaking when only the voice clip is deleted', () => {
    const project = spokenProject(5, 1);
    const sequence = activeSequence(project);
    const next = activeSequence(unwrap(removeClips(project, { sequenceId: sequence.id, clipIds: [AUDIO] })));
    expect(next.clips[AUDIO]).toBeUndefined();
    expect(next.clips[TEXT]?.speaks).toBe(false);
    expect(next.clips[TEXT]?.linkId).toBeNull();
  });
});
