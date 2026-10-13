import { unwrap } from '@timeline/shared';
import { describe, expect, it } from 'vitest';
import { setSequenceResolution } from '../operations/sequence-settings';
import { activeSequence, setupProject } from '../test/fixtures';
import { addClip } from '../operations/clips';
import { frameSizeForMedia, resolutionForEmptySequence } from './sequence-frame';

describe('sequence frame', () => {
  it('uses a vertical phone frame instead of 16:9', () => {
    const { sequence } = setupProject();
    expect(resolutionForEmptySequence(sequence, { width: 1080, height: 1920 })).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it('leaves a 16:9 source on the default frame', () => {
    const { sequence } = setupProject();
    expect(resolutionForEmptySequence(sequence, { width: 1280, height: 720 })).toBeNull();
  });

  it('does not resize a sequence that already has a picture', () => {
    const { project, sequence, video } = setupProject();
    const next = activeSequence(
      unwrap(addClip(project, { sequenceId: sequence.id, trackId: sequence.videoTracks[0]!.id, assetId: video.id, start: 0 })),
    );
    expect(resolutionForEmptySequence(next, { width: 1080, height: 1920 })).toBeNull();
  });

  it('scales an oversized frame down to an even size', () => {
    expect(frameSizeForMedia(8000, 4000)).toEqual({ width: 7680, height: 3840 });
  });

  it('stores the chosen frame', () => {
    const { project, sequence } = setupProject();
    const next = activeSequence(
      unwrap(setSequenceResolution(project, { sequenceId: sequence.id, width: 1080, height: 1920 })),
    );
    expect(next.resolution).toEqual({ width: 1080, height: 1920 });
    expect(setSequenceResolution(project, { sequenceId: sequence.id, width: 1081, height: 1920 }).ok).toBe(false);
  });
});
