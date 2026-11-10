import { describe, expect, it } from 'vitest';
import {
  composeKeepRemove,
  emptyMask,
  expandMask,
  featherMask,
  fillInteriorHoles,
  invertMask,
  lumaOfRgb,
  maskBoxes,
  maskSamplePoints,
  maxMasks,
  mixMasks,
  preserveContactShadows,
  refineMask,
  removeSpeckles,
  resizeMask,
  splitPromptPhrases,
  subtractMask,
  thresholdMask,
  warpMaskWithFlow,
} from './mask-refine';

function rect(width: number, height: number, x: number, y: number, w: number, h: number, fill = 255) {
  const mask = emptyMask(width, height);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) mask.data[yy * width + xx] = fill;
  }
  return mask;
}

function at(mask: { data: Uint8Array; width: number }, x: number, y: number): number {
  return mask.data[y * mask.width + x] ?? 0;
}

describe('mask refine', () => {
  it('unions keep regions and subtracts remove regions', () => {
    const rover = rect(32, 32, 8, 8, 8, 8);
    const floor = rect(32, 32, 0, 20, 32, 12);
    const curtain = rect(32, 32, 0, 0, 32, 6);
    const keep = maxMasks(rover, floor);
    const result = subtractMask(keep, curtain);
    expect(at(result, 16, 4)).toBe(0);
    expect(at(result, 16, 24)).toBe(255);
    expect(at(result, 12, 12)).toBe(255);
  });

  it('thresholds semantic confidence instead of using it as alpha', () => {
    const soft = emptyMask(8, 8, 90);
    for (let i = 0; i < 16; i++) soft.data[16 + i] = 200;
    const hard = thresholdMask(soft, 128);
    expect(at(hard, 0, 0)).toBe(0);
    expect(at(hard, 1, 2)).toBe(255);
    expect([...hard.data].every((v) => v === 0 || v === 255)).toBe(true);
  });

  it('lets SAM keep override CLIPSeg remove, and SAM remove override CLIPSeg keep', () => {
    const keep = emptyMask(8, 8, 200);
    const remove = emptyMask(8, 8, 200);
    const samKeep = rect(8, 8, 0, 0, 4, 8);
    const samRemove = rect(8, 8, 4, 0, 4, 8);
    const composed = composeKeepRemove(8, 8, {
      keepConfidence: keep,
      removeConfidence: remove,
      samKeep,
      samRemove,
    });
    expect(at(composed, 1, 4)).toBe(255);
    expect(at(composed, 6, 4)).toBe(0);
  });

  it('uses winner-take-all for overlapping CLIPSeg keep and remove, not multiplication', () => {
    const rover = emptyMask(16, 16, 40);
    const floor = emptyMask(16, 16, 40);
    for (let y = 4; y < 10; y++) for (let x = 4; x < 10; x++) rover.data[y * 16 + x] = 210;
    for (let y = 10; y < 16; y++) for (let x = 0; x < 16; x++) floor.data[y * 16 + x] = 190;
    const keep = maxMasks(rover, floor);
    const curtain = emptyMask(16, 16, 30);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 16; x++) curtain.data[y * 16 + x] = 220;
    const composed = composeKeepRemove(16, 16, {
      keepConfidence: keep,
      removeConfidence: curtain,
      samKeep: null,
      samRemove: null,
    });
    const binary = thresholdMask(composed, 140);
    expect(at(binary, 8, 2)).toBe(0);
    expect(at(binary, 6, 6)).toBe(255);
    expect(at(binary, 8, 13)).toBe(255);
    expect(at(binary, 8, 2)).not.toBeGreaterThan(0);
  });

  it('resolves SAM keep vs SAM remove conflict in favour of keep', () => {
    const both = rect(4, 4, 0, 0, 4, 4);
    const composed = composeKeepRemove(4, 4, {
      keepConfidence: null,
      removeConfidence: null,
      samKeep: both,
      samRemove: both,
    });
    expect(at(composed, 1, 1)).toBe(255);
  });

  it('leaves the frame opaque when no keep or remove is provided', () => {
    const composed = composeKeepRemove(4, 4, {
      keepConfidence: null,
      removeConfidence: null,
      samKeep: null,
      samRemove: null,
    });
    expect(at(composed, 0, 0)).toBe(255);
  });

  it('keeps fully opaque interiors when feathering', () => {
    const src = rect(32, 32, 8, 8, 16, 16);
    const feathered = featherMask(src, 3);
    expect(at(feathered, 16, 16)).toBe(255);
    expect(at(feathered, 0, 0)).toBe(0);
    const edge = at(feathered, 8, 16);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });

  it('expands and contracts only at the boundary', () => {
    const src = rect(16, 16, 4, 4, 8, 8);
    const grown = expandMask(src, 2);
    const shrunk = expandMask(src, -2);
    expect(at(grown, 3, 8)).toBe(255);
    expect(at(src, 3, 8)).toBe(0);
    expect(at(shrunk, 4, 8)).toBe(0);
    expect(at(src, 4, 8)).toBe(255);
    expect(at(grown, 8, 8)).toBe(255);
    expect(at(shrunk, 8, 8)).toBe(255);
  });

  it('drops speckle and fills holes without eating the subject', () => {
    const src = rect(24, 24, 4, 4, 16, 16);
    src.data[0] = 255;
    src.data[12 * 24 + 12] = 0;
    const cleaned = fillInteriorHoles(removeSpeckles(src, 4), 8);
    expect(at(cleaned, 0, 0)).toBe(0);
    expect(at(cleaned, 12, 12)).toBe(255);
    expect(at(cleaned, 10, 10)).toBe(255);
  });

  it('does not globally fade a solid keep mask during refine', () => {
    const src = rect(64, 64, 8, 8, 48, 48, 180);
    const refined = refineMask({
      mask: src,
      luma: null,
      expansion: 0,
      smoothing: 10,
      feather: 4,
      threshold: 55,
      invert: false,
      preserveShadows: false,
    });
    expect(at(refined, 32, 32)).toBe(255);
    expect(at(refined, 0, 0)).toBe(0);
  });

  it('snaps contact shadows to opaque instead of translucent', () => {
    const mask = rect(16, 16, 4, 4, 6, 6);
    const luma = new Uint8Array(16 * 16).fill(200);
    for (let x = 4; x < 10; x++) luma[11 * 16 + x] = 20;
    const next = preserveContactShadows(mask, luma, 100);
    expect(at(next, 6, 11)).toBe(255);
  });

  it('applies later manual remove over automatic keep', () => {
    const keep = emptyMask(8, 8, 200);
    const composed = composeKeepRemove(8, 8, {
      keepConfidence: keep,
      removeConfidence: null,
      samKeep: null,
      samRemove: rect(8, 8, 0, 0, 8, 4),
    });
    expect(at(composed, 4, 1)).toBe(0);
    expect(at(composed, 4, 6)).toBe(200);
  });

  it('resizes without emptying a solid region', () => {
    const src = rect(8, 8, 2, 2, 4, 4);
    const up = resizeMask(src, 32, 32);
    expect(at(up, 16, 16)).toBeGreaterThan(200);
    expect(at(up, 0, 0)).toBe(0);
  });

  it('warps a mask with the picture when the subject moves', () => {
    const prev = new Uint8Array(32 * 32);
    const next = new Uint8Array(32 * 32);
    for (let y = 8; y < 16; y++) {
      for (let x = 8; x < 16; x++) prev[y * 32 + x] = 200;
      for (let x = 12; x < 20; x++) next[y * 32 + x] = 200;
    }
    const mask = rect(32, 32, 8, 8, 8, 8);
    const warped = warpMaskWithFlow(mask, prev, next, 32, 32);
    const left = at(warped, 9, 12);
    const right = at(warped, 16, 12);
    expect(right).toBeGreaterThan(left);
  });

  it('splits keep/remove phrases and finds blobs', () => {
    expect(splitPromptPhrases('rover, floor and wheels')).toEqual(['rover', 'floor', 'wheels']);
    const boxes = maskBoxes(rect(40, 40, 5, 5, 10, 10));
    expect(boxes.length).toBe(1);
    expect(boxes[0]?.w).toBeCloseTo(10 / 40, 5);
    expect(maskSamplePoints(rect(20, 20, 2, 2, 8, 8), 3).length).toBe(3);
  });

  it('inverts and interpolates', () => {
    const a = emptyMask(4, 4, 0);
    const b = emptyMask(4, 4, 255);
    expect(invertMask(a).data[0]).toBe(255);
    expect(mixMasks(a, b, 0.5).data[0]).toBe(127);
  });

  it('reads luma from rgb', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const luma = lumaOfRgb(pixels, 2, 1);
    expect(luma[0]).toBe(0);
    expect(luma[1]).toBe(255);
  });
});
