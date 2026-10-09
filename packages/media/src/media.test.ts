import { type DesktopMediaFile } from '@timeline/shared';
import { describe, expect, it, vi } from 'vitest';
import { createDesktopMediaEngine, type DesktopMediaBridge } from './desktop/desktop-media-engine';
import { detectMediaKind, guessMimeType } from './media-kind';

describe('media kind detection', () => {
  it('prefers MIME types and falls back to extensions', () => {
    expect(detectMediaKind('clip.bin', 'video/mp4')).toBe('video');
    expect(detectMediaKind('song.FLAC', '')).toBe('audio');
    expect(detectMediaKind('clip.mov')).toBe('video');
    expect(detectMediaKind('notes.txt', 'text/plain')).toBeNull();
    expect(guessMimeType('a.webm')).toBe('video/webm');
  });
});

function file(name: string, token: string): DesktopMediaFile {
  return { token, url: `timeline-media://media/${token}`, path: `/media/${name}`, name, size: 10, lastModified: 1 };
}

function fakeBridge(overrides: Partial<DesktopMediaBridge> = {}): DesktopMediaBridge {
  return {
    pick: vi.fn(() => Promise.resolve([file('a.mp4', 't1'), file('notes.txt', 't2')])),
    resolve: vi.fn((path: string) => Promise.resolve(path === '/media/a.mp4' ? file('a.mp4', 't3') : null)),
    probe: vi.fn(() =>
      Promise.resolve({
        durationSeconds: 4,
        width: 1280,
        height: 720,
        frameRate: { numerator: 30000, denominator: 1001 },
        hasVideo: true,
        hasAudio: false,
        videoCodec: 'h264',
        audioCodec: null,
      }),
    ),
    release: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe('desktop media engine', () => {
  it('maps picked files to portable sources and rejects unsupported ones', async () => {
    const bridge = fakeBridge();
    const engine = createDesktopMediaEngine(bridge);
    const result = await engine.pickMedia({ multiple: true });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.source).toEqual({
      kind: 'local-file',
      fileName: 'a.mp4',
      size: 10,
      lastModified: 1,
      mimeType: 'video/mp4',
      path: '/media/a.mp4',
    });
    expect(result.rejected).toEqual([{ fileName: 'notes.txt', reason: 'Unsupported file type.' }]);
    expect(bridge.release).toHaveBeenCalledWith('t2');
  });

  it('resolves sources by path and reports offline media as null', async () => {
    const engine = createDesktopMediaEngine(fakeBridge());
    const base = { kind: 'local-file', fileName: 'a.mp4', size: 10, lastModified: 1, mimeType: null } as const;
    expect(await engine.resolve({ ...base, path: '/media/a.mp4' })).toEqual({ id: 't3', url: 'timeline-media://media/t3' });
    expect(await engine.resolve({ ...base, path: '/elsewhere/a.mp4' })).toBeNull();
    expect(await engine.resolve({ ...base, path: null })).toBeNull();
  });

  it('uses FFprobe metadata when available', async () => {
    const engine = createDesktopMediaEngine(fakeBridge());
    const metadata = await engine.probe({ id: 't1', url: 'timeline-media://media/t1' }, 'video');
    expect(metadata.probedBy).toBe('ffprobe');
    expect(metadata.frameRate).toEqual({ numerator: 30000, denominator: 1001 });
  });

  it('releases every tracked grant on dispose', async () => {
    const bridge = fakeBridge();
    const engine = createDesktopMediaEngine(bridge);
    await engine.pickMedia({ multiple: true });
    engine.dispose();
    expect(bridge.release).toHaveBeenCalledWith('t1');
  });

  it('rejects export when WebCodecs is unavailable', async () => {
    const engine = createDesktopMediaEngine(fakeBridge());
    if (engine.capabilities.export) {
      await expect(
        engine.exportSequence({
          project: {} as never,
          sequenceId: 'seq' as never,
          format: { container: 'webm', videoCodec: 'vp9', audioCodec: 'opus' },
          output: {
            width: 1280,
            height: 720,
            frameRate: { numerator: 30, denominator: 1 },
          },
        }),
      ).rejects.toThrow();
      return;
    }
    await expect(engine.exportSequence({} as never)).rejects.toThrow(/WebCodecs/i);
  });
});
