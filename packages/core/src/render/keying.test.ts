import { describe, expect, it } from 'vitest';
import { DEFAULT_KEY_CONTROLS, KEY_COLOR_PRESETS } from '../model/effects';
import {
  applyMat3,
  detectKeyColor,
  findKeyRegion,
  homographyFromUnitSquare,
  invertMat3,
  keyAlpha,
  keyUniforms,
  parseHexColor,
  rgbToHex,
  ScreenTracker,
  suppressSpill,
  type Quad,
} from './keying';

const green = keyUniforms(DEFAULT_KEY_CONTROLS);

function frame(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return data;
}

describe('keyer', () => {
  it('keys the screen color and its shadows, keeps skin and grey', () => {
    const [r, g, b] = parseHexColor(KEY_COLOR_PRESETS.green);
    expect(keyAlpha(r, g, b, green)).toBe(0);
    expect(keyAlpha(0, 0.35, 0.12, green)).toBeLessThan(0.2);
    expect(keyAlpha(0.9, 0.7, 0.6, green)).toBe(1);
    expect(keyAlpha(0.5, 0.5, 0.5, green)).toBe(1);
    expect(keyAlpha(0.05, 0.05, 0.05, green)).toBe(1);
  });

  it('keys blue with the blue preset only', () => {
    const blue = keyUniforms({ ...DEFAULT_KEY_CONTROLS, color: KEY_COLOR_PRESETS.blue });
    const [r, g, b] = parseHexColor(KEY_COLOR_PRESETS.blue);
    expect(keyAlpha(r, g, b, blue)).toBe(0);
    const [gr, gg, gb] = parseHexColor(KEY_COLOR_PRESETS.green);
    expect(keyAlpha(gr, gg, gb, blue)).toBe(1);
  });

  it('pulls green spill out of a greenish highlight', () => {
    const [r, g, b] = suppressSpill(0.6, 0.8, 0.6, green);
    expect(g).toBeLessThan(0.8);
    expect(Math.abs(r - b)).toBeLessThan(0.15);
  });

  it('round-trips hex colors', () => {
    expect(rgbToHex(parseHexColor('#00b140'))).toBe('#00b140');
  });
});

describe('detectKeyColor', () => {
  it('finds the screen green in a frame', () => {
    const data = frame(40, 30, (x) => (x < 25 ? [10, 180, 70] : [200, 160, 140]));
    const hex = detectKeyColor(data, 40, 30);
    expect(hex).toBe('#0ab446');
  });

  it('returns null when there is no screen color', () => {
    const data = frame(20, 20, () => [120, 120, 120]);
    expect(detectKeyColor(data, 20, 20)).toBeNull();
  });
});

describe('findKeyRegion', () => {
  it('finds the corners of a green phone screen', () => {
    const data = frame(80, 60, (x, y) => (x >= 20 && x < 40 && y >= 10 && y < 50 ? [0, 177, 64] : [30, 30, 30]));
    const region = findKeyRegion(data, 80, 60, green);
    expect(region).not.toBeNull();
    const [tl, tr, br, bl] = region!.quad;
    expect(tl[0]).toBeCloseTo(20 / 80, 1);
    expect(tl[1]).toBeCloseTo(10 / 60, 1);
    expect(tr[0]).toBeCloseTo(40 / 80, 1);
    expect(br[1]).toBeCloseTo(50 / 60, 1);
    expect(bl[0]).toBeCloseTo(20 / 80, 1);
  });

  it('follows the seed to pick one of two screens', () => {
    const data = frame(80, 40, (x, y) =>
      (x >= 5 && x < 25 && y >= 5 && y < 35) || (x >= 50 && x < 60 && y >= 10 && y < 20) ? [0, 177, 64] : [30, 30, 30],
    );
    const largest = findKeyRegion(data, 80, 40, green);
    expect(largest!.box[0]).toBeCloseTo(5 / 80, 3);
    const seeded = findKeyRegion(data, 80, 40, green, [55 / 80, 15 / 40]);
    expect(seeded!.box[0]).toBeCloseTo(50 / 80, 3);
  });
});

describe('homography', () => {
  it('maps the unit square onto a perspective quad and back', () => {
    const quad: Quad = [
      [0.2, 0.1],
      [0.7, 0.2],
      [0.8, 0.9],
      [0.1, 0.8],
    ];
    const h = homographyFromUnitSquare(quad)!;
    const corner = applyMat3(h, [1, 1]);
    expect(corner[0]).toBeCloseTo(0.8, 6);
    expect(corner[1]).toBeCloseTo(0.9, 6);
    const back = applyMat3(invertMat3(h)!, [0.7, 0.2]);
    expect(back[0]).toBeCloseTo(1, 6);
    expect(back[1]).toBeCloseTo(0, 6);
  });
});

describe('ScreenTracker', () => {
  it('smooths small moves and resets after a jump in time', () => {
    const tracker = new ScreenTracker();
    const a: Quad = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const b: Quad = [
      [0.01, 0],
      [1.01, 0],
      [1.01, 1],
      [0.01, 1],
    ];
    tracker.update(0, a);
    const smoothed = tracker.update(1, b)!;
    expect(smoothed[0][0]).toBeCloseTo(0.005, 6);
    const jumped = tracker.update(40, b)!;
    expect(jumped[0][0]).toBeCloseTo(0.01, 6);
    expect(tracker.update(41, null)).toBe(jumped);
  });
});
