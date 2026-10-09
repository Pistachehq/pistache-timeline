import { unwrap } from '@timeline/shared';
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '../model/defaults';
import { addClip, updateClipTransform } from '../operations/clips';
import { activeSequence, setupProject } from '../test/fixtures';
import { migrateProject } from './migrations';
import { type JsonObject } from './reader';
import { collectMediaPaths, deserializeProject, serializeProject } from './project-file';

function projectWithClip() {
  const { project, sequence, video } = setupProject();
  const withClip = unwrap(
    addClip(project, { sequenceId: sequence.id, trackId: sequence.videoTracks[0]!.id, assetId: video.id, start: 15 }),
  );
  const clipId = activeSequence(withClip).videoTracks[0]!.clipIds[0]!;
  return unwrap(updateClipTransform(withClip, { sequenceId: sequence.id, clipId, transform: { rotation: 12.5 } }));
}

describe('project serialization', () => {
  it('round-trips a project losslessly', () => {
    const project = projectWithClip();
    const text = serializeProject(project);
    const restored = unwrap(deserializeProject(text));
    expect(restored).toEqual(project);
  });

  it('writes the format id and schema version', () => {
    const parsed = JSON.parse(serializeProject(projectWithClip())) as JsonObject;
    expect(parsed.format).toBe('timeline-project');
    expect((parsed.project as JsonObject).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('rejects invalid JSON and foreign files', () => {
    expect(deserializeProject('{nope').ok).toBe(false);
    const foreign = deserializeProject(JSON.stringify({ format: 'something-else' }));
    expect(foreign.ok).toBe(false);
  });

  it('rejects projects from newer schema versions', () => {
    const parsed = JSON.parse(serializeProject(projectWithClip())) as { project: JsonObject };
    parsed.project.schemaVersion = CURRENT_SCHEMA_VERSION + 1;
    const result = deserializeProject(JSON.stringify(parsed));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNSUPPORTED_VERSION');
  });

  it('reports structural errors with a JSON path', () => {
    const parsed = JSON.parse(serializeProject(projectWithClip())) as { project: JsonObject };
    parsed.project.name = 42;
    const result = deserializeProject(JSON.stringify(parsed));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('project.name');
  });

  it('rejects projects that violate model invariants', () => {
    const project = projectWithClip();
    const sequence = activeSequence(project);
    const broken = {
      ...project,
      sequences: { [sequence.id]: { ...sequence, videoTracks: sequence.videoTracks.map((t) => ({ ...t, clipIds: [] })) } },
    };
    const result = deserializeProject(serializeProject(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('not listed on any track');
  });

  it('applies registered migrations step by step', () => {
    const migrated = migrateProject(
      { schemaVersion: 1, title: 'Old' },
      1,
      {
        1: ({ title, ...rest }) => ({ ...rest, name: title }),
        2: (project) => ({ ...project, tags: [] }),
      },
      3,
    );
    expect(migrated).toEqual({ schemaVersion: 3, name: 'Old', tags: [] });
  });

  it('fails when a migration step is missing', () => {
    expect(() => migrateProject({ schemaVersion: 1 }, 1, {}, 2)).toThrow('No migration');
  });

  it('collects media path hints leniently', () => {
    const project = projectWithClip();
    const asset = Object.values(project.mediaAssets)[0]!;
    const withPath = {
      ...project,
      mediaAssets: { ...project.mediaAssets, [asset.id]: { ...asset, source: { ...asset.source, path: '/media/a.mp4' } } },
    };
    expect(collectMediaPaths(serializeProject(withPath))).toEqual(['/media/a.mp4']);
    expect(collectMediaPaths('garbage')).toEqual([]);
  });
});
