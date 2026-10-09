import { describe, expect, it } from 'vitest';
import { programVideoDecodeSize } from './playback-decode';

describe('programVideoDecodeSize', () => {
  it('scales from sequence letterbox size, not monitor pixels', () => {
    const full = programVideoDecodeSize(1920, 1080, 1920, 1080, 1);
    expect(full).toEqual({ width: 1920, height: 1080 });

    const half = programVideoDecodeSize(1920, 1080, 1920, 1080, 0.5);
    expect(half).toEqual({ width: 960, height: 540 });

    const eighth = programVideoDecodeSize(1920, 1080, 1920, 1080, 0.125);
    expect(eighth).toEqual({ width: 240, height: 135 });
  });

  it('letterboxes vertical media in sequence frame before scaling', () => {
    const full = programVideoDecodeSize(1920, 1080, 1080, 1920, 1);
    expect(full.width).toBe(608);
    expect(full.height).toBe(1080);

    const quarter = programVideoDecodeSize(1920, 1080, 1080, 1920, 0.25);
    expect(quarter.width).toBe(152);
    expect(quarter.height).toBe(270);
  });
});
