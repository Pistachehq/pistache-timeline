import { addTextClip, createProject, getActiveSequence, getClipEnd, type ClipId } from '@timeline/core';
import { unwrap } from '@timeline/shared';
import { describe, expect, it } from 'vitest';
import { expandTrimPreviews } from './clip-trim-preview';

describe('expandTrimPreviews', () => {
  it('grows a text clip from the left edge and keeps the end', () => {
    const created = createProject({ now: new Date('2026-01-01T00:00:00Z') });
    const sequence = getActiveSequence(created);
    if (!sequence) throw new Error('missing sequence');
    const project = unwrap(
      addTextClip(created, {
        sequenceId: sequence.id,
        trackId: sequence.videoTracks[0]!.id,
        start: 90,
        durationFrames: 150,
        clipId: 'clip_text' as ClipId,
      }),
    );
    const next = getActiveSequence(project);
    if (!next) throw new Error('missing sequence');
    const clip = next.clips['clip_text' as ClipId]!;
    const end = getClipEnd(clip);

    const [preview] = expandTrimPreviews(next, project, clip, 'start', 30);
    expect(preview?.start).toBe(30);
    expect(preview?.sourceIn).toBe(0);
    expect(preview?.sourceOut).toBe(clip.sourceOut + 60);
    expect(preview && preview.start + (preview.sourceOut - preview.sourceIn)).toBe(end);
  });
});
