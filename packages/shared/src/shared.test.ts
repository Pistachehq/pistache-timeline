import { describe, expect, it } from 'vitest';
import {
  clamp,
  createId,
  err,
  formatBytes,
  formatSeconds,
  getExtension,
  ok,
  stripExtension,
  unwrap,
} from './index';

describe('createId', () => {
  it('produces prefixed, unique identifiers', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createId('clip')));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^clip_[0-9a-z]{16}$/);
  });
});

describe('result helpers', () => {
  it('unwraps successes and throws failures', () => {
    expect(unwrap(ok(3))).toBe(3);
    expect(() => unwrap(err(new Error('nope')))).toThrow('nope');
  });
});

describe('formatting', () => {
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(-1)).toBe('—');
  });

  it('formats seconds', () => {
    expect(formatSeconds(5)).toBe('0:05');
    expect(formatSeconds(3725)).toBe('1:02:05');
  });

  it('handles file extensions', () => {
    expect(getExtension('Clip.MP4')).toBe('mp4');
    expect(stripExtension('my.clip.webm')).toBe('my.clip');
    expect(stripExtension('.hidden')).toBe('.hidden');
  });

  it('clamps values', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});
