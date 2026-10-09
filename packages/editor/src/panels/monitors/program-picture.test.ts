import {
  addClip,
  addMediaAssets,
  createMediaAsset,
  createProject,
  getActiveSequence,
  mediaTimeFromSeconds,
  type ClipId,
  type MediaAssetId,
} from '@timeline/core';
import { unwrap } from '@timeline/shared';
import { describe, expect, it } from 'vitest';
import { programLayerLive, programPictureLayers, programVideoUnready } from './program-clip-layout';

function sequenceWithTwoClips() {
  const asset = createMediaAsset({
    id: 'asset_video' as MediaAssetId,
    name: 'Interview',
    kind: 'video',
    source: {
      kind: 'local-file',
      fileName: 'interview.mp4',
      size: 1024,
      lastModified: 1,
      mimeType: 'video/mp4',
      path: null,
    },
    duration: mediaTimeFromSeconds(10),
    hasVideo: true,
    hasAudio: true,
    resolution: { width: 1920, height: 1080 },
    now: new Date('2026-01-01T00:00:00Z'),
  });
  const project = unwrap(addMediaAssets(createProject({ now: new Date('2026-01-01T00:00:00Z') }), [asset]));
  const sequence = getActiveSequence(project);
  if (!sequence) throw new Error('missing sequence');
  const trackId = sequence.videoTracks[0]!.id;
  const withFirst = unwrap(
    addClip(project, {
      sequenceId: sequence.id,
      trackId,
      assetId: asset.id,
      start: 0,
      sourceOut: 30,
      clipId: 'clip_a' as ClipId,
    }),
  );
  const withSecond = unwrap(
    addClip(withFirst, {
      sequenceId: sequence.id,
      trackId,
      assetId: asset.id,
      start: 30,
      sourceIn: 30,
      sourceOut: 60,
      clipId: 'clip_b' as ClipId,
    }),
  );
  const next = getActiveSequence(withSecond);
  if (!next) throw new Error('missing sequence');
  return next;
}

describe('programPictureLayers', () => {
  it('keeps the next clip mounted before the cut and the previous clip after it', () => {
    const sequence = sequenceWithTwoClips();
    const during = programPictureLayers(sequence, 10);
    expect(during.find((layer) => layer.clip.id === 'clip_a')?.role).toBe('active');
    expect(during.find((layer) => layer.clip.id === 'clip_b')?.role).toBe('warm');

    const after = programPictureLayers(sequence, 30);
    expect(after.find((layer) => layer.clip.id === 'clip_b')?.role).toBe('active');
    expect(after.find((layer) => layer.clip.id === 'clip_a')?.role).toBe('recent');
  });

  it('shows a warmed clip on the same frame the playhead enters it', () => {
    const sequence = sequenceWithTwoClips();
    const warmed = programPictureLayers(sequence, 10).find((layer) => layer.clip.id === 'clip_b');
    if (!warmed) throw new Error('missing warm clip');
    expect(programLayerLive(warmed, 29)).toBe(false);
    expect(programLayerLive(warmed, 30)).toBe(true);
  });
});

describe('programVideoUnready', () => {
  it('hides a video only until its first frame, not during a later seek', () => {
    expect(programVideoUnready(1, false)).toBe(true);
    expect(programVideoUnready(2, false)).toBe(false);
    expect(programVideoUnready(1, true)).toBe(false);
  });
});
