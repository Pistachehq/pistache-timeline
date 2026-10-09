import { unwrap } from '@timeline/shared';
import { createMediaAsset, createProject } from '../model/factory';
import { getActiveSequence } from '../model/queries';
import { type MediaAsset, type MediaAssetId, type Project, type Sequence } from '../model/types';
import { addMediaAssets } from '../operations/media';
import { mediaTimeFromSeconds } from '../time/rational';

export function videoAsset(id = 'asset_video', seconds = 10): MediaAsset {
  return createMediaAsset({
    id: id as MediaAssetId,
    name: 'Interview',
    kind: 'video',
    source: {
      kind: 'local-file',
      fileName: 'interview.mp4',
      size: 1024,
      lastModified: 1_700_000_000_000,
      mimeType: 'video/mp4',
      path: null,
    },
    duration: mediaTimeFromSeconds(seconds),
    hasVideo: true,
    hasAudio: true,
    resolution: { width: 1920, height: 1080 },
    now: new Date('2026-01-01T00:00:00Z'),
  });
}

export function audioAsset(id = 'asset_audio', seconds = 5): MediaAsset {
  return createMediaAsset({
    id: id as MediaAssetId,
    name: 'Music',
    kind: 'audio',
    source: {
      kind: 'local-file',
      fileName: 'music.mp3',
      size: 512,
      lastModified: 1_700_000_000_000,
      mimeType: 'audio/mpeg',
      path: null,
    },
    duration: mediaTimeFromSeconds(seconds),
    hasVideo: false,
    hasAudio: true,
    now: new Date('2026-01-01T00:00:00Z'),
  });
}

export interface Fixture {
  project: Project;
  sequence: Sequence;
  video: MediaAsset;
  audio: MediaAsset;
}

/** A 30 fps project with a 10 s video asset and a 5 s audio asset imported. */
export function setupProject(): Fixture {
  const video = videoAsset();
  const audio = audioAsset();
  const project = unwrap(
    addMediaAssets(createProject({ now: new Date('2026-01-01T00:00:00Z') }), [video, audio]),
  );
  const sequence = getActiveSequence(project);
  if (!sequence) throw new Error('missing sequence');
  return { project, sequence, video, audio };
}

export function activeSequence(project: Project): Sequence {
  const sequence = getActiveSequence(project);
  if (!sequence) throw new Error('missing sequence');
  return sequence;
}
