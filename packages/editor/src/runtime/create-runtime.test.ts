import {
  addClip,
  addMediaAssets,
  type ClipId,
  createMediaAsset,
  createProject,
  getActiveSequence,
  mediaTimeFromSeconds,
} from '@timeline/core';
import { type MediaEngine } from '@timeline/media';
import { unwrap } from '@timeline/shared';
import { describe, expect, it } from 'vitest';
import { type EditorPlatform, type ProjectStorage } from '../platform';
import { createEditorRuntime } from './create-runtime';

function createTestMediaEngine(): MediaEngine {
  return {
    platform: 'web',
    capabilities: {
      metadata: 'media-element',
      persistentFileAccess: false,
      thumbnails: false,
      frameDecoding: false,
      export: false,
    },
    pickMedia: () => Promise.resolve({ files: [], rejected: [] }),
    pickMediaFolder: () => Promise.resolve({ files: [], rejected: [] }),
    importLocalFiles: () => Promise.resolve({ files: [], rejected: [] }),
    resolve: () => Promise.resolve(null),
    probe: () =>
      Promise.resolve({
        durationSeconds: 10,
        hasVideo: true,
        hasAudio: true,
        width: 1920,
        height: 1080,
        frameRate: { numerator: 30, denominator: 1 },
        videoCodec: null,
        audioCodec: null,
        probedBy: 'test',
      }),
    createThumbnail: () => Promise.resolve(null),
    createPlayer: () => {
      throw new Error('Players are not used in this test.');
    },
    exportSequence: () => Promise.reject(new Error('Export is not available.')),
    release() {
      /* no-op */
    },
    dispose() {
      /* no-op */
    },
  };
}

function createMemoryStorage(initial: { contents: string; displayName: string } | null = null): ProjectStorage & {
  lastSaved: string | null;
} {
  let stored = initial;
  const storage: ProjectStorage & { lastSaved: string | null } = {
    lastSaved: initial?.contents ?? null,
    open() {
      if (!stored) return Promise.resolve(null);
      return Promise.resolve({
        contents: stored.contents,
        location: { displayName: stored.displayName, ref: stored.displayName },
      });
    },
    save(request) {
      stored = { contents: request.contents, displayName: request.suggestedName };
      storage.lastSaved = request.contents;
      return Promise.resolve({ displayName: request.suggestedName, ref: request.suggestedName });
    },
  };
  return storage;
}

function createTestPlatform(storage: ProjectStorage = createMemoryStorage()): EditorPlatform {
  return {
    kind: 'web',
    label: 'Test',
    media: createTestMediaEngine(),
    storage,
    setDocumentState() {
      /* no-op */
    },
    openExternal() {
      /* no-op */
    },
  };
}

function projectWithClip() {
  const empty = createProject({ name: 'Edit Test' });
  const sequence = getActiveSequence(empty);
  if (!sequence) throw new Error('Expected a default sequence.');
  const asset = createMediaAsset({
    name: 'Clip',
    kind: 'video',
    hasVideo: true,
    hasAudio: true,
    duration: mediaTimeFromSeconds(10),
    resolution: { width: 1920, height: 1080 },
    frameRate: sequence.frameRate,
    source: {
      kind: 'local-file',
      fileName: 'clip.mp4',
      size: 1024,
      lastModified: 1,
      mimeType: 'video/mp4',
      path: null,
    },
  });
  const withAsset = unwrap(addMediaAssets(empty, [asset]));
  const trackId = sequence.videoTracks[0]?.id;
  if (!trackId) throw new Error('Expected a video track.');
  const withClip = unwrap(
    addClip(withAsset, { sequenceId: sequence.id, trackId, assetId: asset.id, start: 0 }),
  );
  return { project: withClip, sequenceId: sequence.id, trackId, assetId: asset.id };
}

describe('createEditorRuntime', () => {
  it('loads a default project with empty tracks', () => {
    const runtime = createEditorRuntime(createTestPlatform());
    const sequence = getActiveSequence(runtime.stores.project.getState().project);
    expect(sequence?.videoTracks.length).toBeGreaterThan(0);
    expect(sequence?.audioTracks.length).toBeGreaterThan(0);
    expect(Object.keys(sequence?.clips ?? {})).toHaveLength(0);
    runtime.dispose();
  });

  it('records moving a clip as a single undoable edit', () => {
    const { project } = projectWithClip();
    const runtime = createEditorRuntime(createTestPlatform(), { initialProject: project });
    const sequence = getActiveSequence(runtime.stores.project.getState().project);
    const clipId = Object.keys(sequence?.clips ?? {})[0] as ClipId | undefined;
    const trackId = sequence?.videoTracks[0]?.id;
    if (!clipId || !trackId || !sequence) throw new Error('Expected a clip on V1.');

    expect(sequence.clips[clipId]?.start).toBe(0);
    expect(runtime.actions.edit.moveClip(clipId, trackId, 45)).toBe(true);

    const moved = getActiveSequence(runtime.stores.project.getState().project);
    expect(moved?.clips[clipId]?.start).toBe(45);

    runtime.actions.edit.undo();
    const restored = getActiveSequence(runtime.stores.project.getState().project);
    expect(restored?.clips[clipId]?.start).toBe(0);

    runtime.actions.edit.redo();
    const redone = getActiveSequence(runtime.stores.project.getState().project);
    expect(redone?.clips[clipId]?.start).toBe(45);
    runtime.dispose();
  });

  it('saves and reopens a project through platform storage', async () => {
    const { project } = projectWithClip();
    const storage = createMemoryStorage();
    const runtime = createEditorRuntime(createTestPlatform(storage), { initialProject: project });

    expect(await runtime.actions.project.saveProject()).toBe(true);
    expect(storage.lastSaved).toContain('timeline-project');

    await runtime.actions.project.newProject();
    expect(Object.keys(getActiveSequence(runtime.stores.project.getState().project)?.clips ?? {})).toHaveLength(0);

    expect(await runtime.actions.project.openProject()).toBe(true);
    const reopened = getActiveSequence(runtime.stores.project.getState().project);
    expect(Object.keys(reopened?.clips ?? {})).toHaveLength(1);
    runtime.dispose();
  });
});
