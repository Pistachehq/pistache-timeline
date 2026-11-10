import { type SmartBackgroundStroke, type SmartBackgroundView, type VideoEffect } from '../model/effects';

export interface AlphaMask {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value | 0;
}

export function emptyMask(width: number, height: number, fill = 0): AlphaMask {
  const data = new Uint8Array(Math.max(1, width) * Math.max(1, height));
  if (fill) data.fill(clampByte(fill));
  return { data, width: Math.max(1, width), height: Math.max(1, height) };
}

export function copyMask(mask: AlphaMask): AlphaMask {
  return { data: new Uint8Array(mask.data), width: mask.width, height: mask.height };
}

/** Bilinear resize of an 8-bit alpha map. */
export function resizeMask(mask: AlphaMask, width: number, height: number): AlphaMask {
  const dw = Math.max(1, Math.round(width));
  const dh = Math.max(1, Math.round(height));
  if (dw === mask.width && dh === mask.height) return copyMask(mask);
  const out = new Uint8Array(dw * dh);
  const xScale = (mask.width - 1) / Math.max(1, dw - 1);
  const yScale = (mask.height - 1) / Math.max(1, dh - 1);
  for (let y = 0; y < dh; y++) {
    const fy = y * yScale;
    const y0 = Math.floor(fy);
    const y1 = Math.min(mask.height - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = x * xScale;
      const x0 = Math.floor(fx);
      const x1 = Math.min(mask.width - 1, x0 + 1);
      const tx = fx - x0;
      const a = mask.data[y0 * mask.width + x0] ?? 0;
      const b = mask.data[y0 * mask.width + x1] ?? 0;
      const c = mask.data[y1 * mask.width + x0] ?? 0;
      const d = mask.data[y1 * mask.width + x1] ?? 0;
      out[y * dw + x] = clampByte(a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty);
    }
  }
  return { data: out, width: dw, height: dh };
}

export function maxMasks(a: AlphaMask, b: AlphaMask): AlphaMask {
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const left = a.width === w && a.height === h ? a : resizeMask(a, w, h);
  const right = b.width === w && b.height === h ? b : resizeMask(b, w, h);
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = Math.max(left.data[i] ?? 0, right.data[i] ?? 0);
  return { data, width: w, height: h };
}

/** Hard subtract: remove pixels at/above 128 become 0, otherwise keep is unchanged. */
export function subtractMask(keep: AlphaMask, remove: AlphaMask): AlphaMask {
  const w = Math.max(keep.width, remove.width);
  const h = Math.max(keep.height, remove.height);
  const left = keep.width === w && keep.height === h ? keep : resizeMask(keep, w, h);
  const right = remove.width === w && remove.height === h ? remove : resizeMask(remove, w, h);
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) {
    data[i] = (right.data[i] ?? 0) >= 128 ? 0 : (left.data[i] ?? 0);
  }
  return { data, width: w, height: h };
}

export function thresholdMask(mask: AlphaMask, threshold: number): AlphaMask {
  const cut = Math.max(0, Math.min(255, Math.round(threshold)));
  const data = new Uint8Array(mask.data.length);
  for (let i = 0; i < data.length; i++) data[i] = (mask.data[i] ?? 0) >= cut ? 255 : 0;
  return { data, width: mask.width, height: mask.height };
}

export interface KeepRemoveLayers {
  readonly keepConfidence: AlphaMask | null;
  readonly removeConfidence: AlphaMask | null;
  readonly samKeep: AlphaMask | null;
  readonly samRemove: AlphaMask | null;
}

/**
 * CLIPSeg scores stay as keep-likelihood (not alpha). SAM 0/255 overrides.
 * Conflicting SAM keep+remove resolves to keep. Neither layer → opaque.
 */
export function composeKeepRemove(width: number, height: number, layers: KeepRemoveLayers): AlphaMask {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const keep = layers.keepConfidence ? resizeMask(layers.keepConfidence, w, h) : null;
  const remove = layers.removeConfidence ? resizeMask(layers.removeConfidence, w, h) : null;
  const samKeep = layers.samKeep ? resizeMask(layers.samKeep, w, h) : null;
  const samRemove = layers.samRemove ? resizeMask(layers.samRemove, w, h) : null;
  const data = new Uint8Array(w * h);
  if (!keep && !remove && !samKeep && !samRemove) {
    data.fill(255);
    return { data, width: w, height: h };
  }
  const margin = 12;
  for (let i = 0; i < data.length; i++) {
    const sk = samKeep?.data[i] ?? 0;
    const sr = samRemove?.data[i] ?? 0;
    if (sk >= 128) {
      data[i] = 255;
      continue;
    }
    if (sr >= 128) {
      data[i] = 0;
      continue;
    }
    const k = keep?.data[i] ?? 0;
    const r = remove?.data[i] ?? 0;
    if (keep && remove) {
      if (k >= r + margin) data[i] = k;
      else if (r >= k + margin) data[i] = 0;
      else data[i] = k >= r ? k : 0;
    } else if (keep) data[i] = k;
    else data[i] = 255 - r;
  }
  return { data, width: w, height: h };
}

export function invertMask(mask: AlphaMask): AlphaMask {
  const data = new Uint8Array(mask.data.length);
  for (let i = 0; i < data.length; i++) data[i] = 255 - (mask.data[i] ?? 0);
  return { data, width: mask.width, height: mask.height };
}

function boxBlur(src: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return new Uint8Array(src);
  const tmp = new Uint32Array(width * height);
  const out = new Uint8Array(width * height);
  const span = r * 2 + 1;
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * width + Math.min(width - 1, Math.max(0, x))] ?? 0;
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = sum;
      const add = src[y * width + Math.min(width - 1, x + r + 1)] ?? 0;
      const sub = src[y * width + Math.max(0, x - r)] ?? 0;
      sum += add - sub;
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x] ?? 0;
    for (let y = 0; y < height; y++) {
      out[y * width + x] = clampByte(sum / (span * span));
      const add = tmp[Math.min(height - 1, y + r + 1) * width + x] ?? 0;
      const sub = tmp[Math.max(0, y - r) * width + x] ?? 0;
      sum += add - sub;
    }
  }
  return out;
}

function morph(mask: AlphaMask, radius: number, dilate: boolean): AlphaMask {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return copyMask(mask);
  const { width, height, data } = mask;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = dilate ? 0 : 255;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const value = data[yy * width + xx] ?? 0;
          best = dilate ? Math.max(best, value) : Math.min(best, value);
        }
      }
      out[y * width + x] = best;
    }
  }
  return { data: out, width, height };
}

export function expandMask(mask: AlphaMask, radius: number): AlphaMask {
  if (radius === 0) return copyMask(mask);
  return radius > 0 ? morph(mask, radius, true) : morph(mask, -radius, false);
}

export function smoothMask(mask: AlphaMask, radius: number): AlphaMask {
  return { data: boxBlur(mask.data, mask.width, mask.height, radius), width: mask.width, height: mask.height };
}

/**
 * Softens only the band between a contracted and expanded binary mask.
 * Interior stay 255, exterior stay 0.
 */
export function featherMask(mask: AlphaMask, radius: number): AlphaMask {
  const r = Math.max(0, Math.round(radius));
  const binary = thresholdMask(mask, 128);
  if (r === 0) return binary;
  const inner = expandMask(binary, -r);
  const outer = expandMask(binary, r);
  const blurred = smoothMask(binary, r);
  const data = new Uint8Array(binary.data.length);
  for (let i = 0; i < data.length; i++) {
    if ((inner.data[i] ?? 0) >= 128) data[i] = 255;
    else if ((outer.data[i] ?? 0) < 128) data[i] = 0;
    else data[i] = blurred.data[i] ?? 0;
  }
  return { data, width: mask.width, height: mask.height };
}

/**
 * Pulls contact shadows back into the keep mask: dark pixels next to a kept
 * surface stay, without inventing shadow that is not in the picture.
 */
export function preserveContactShadows(mask: AlphaMask, luma: Uint8Array, amount: number): AlphaMask {
  if (amount <= 0) return copyMask(mask);
  const radius = Math.max(1, Math.round((amount / 100) * 6));
  const grown = expandMask(mask, radius);
  const data = new Uint8Array(mask.data);
  for (let i = 0; i < data.length; i++) {
    const keep = mask.data[i] ?? 0;
    if (keep >= 250) continue;
    const edge = grown.data[i] ?? 0;
    if (edge <= keep) continue;
    const dark = 1 - (luma[i] ?? 255) / 255;
    if (dark < 0.35) continue;
    data[i] = 255;
  }
  return { data, width: mask.width, height: mask.height };
}

export function lumaOfRgb(pixels: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const luma = new Uint8Array(width * height);
  const channels = pixels.length >= width * height * 4 ? 4 : 3;
  for (let i = 0; i < luma.length; i++) {
    const o = i * channels;
    const y = (pixels[o] ?? 0) * LUMA_R + (pixels[o + 1] ?? 0) * LUMA_G + (pixels[o + 2] ?? 0) * LUMA_B;
    luma[i] = y <= 0 ? 0 : y >= 255 ? 255 : Math.round(y);
  }
  return luma;
}

export function rasterizeStrokes(width: number, height: number, strokes: readonly SmartBackgroundStroke[], sourceFrame: number): { add: AlphaMask; subtract: AlphaMask } {
  const add = emptyMask(width, height);
  const subtract = emptyMask(width, height);
  for (const stroke of strokes) {
    if (stroke.sourceFrame !== sourceFrame || stroke.points.length === 0) continue;
    const target = stroke.include ? add : subtract;
    paintStroke(target.data, width, height, stroke);
  }
  return { add, subtract };
}

function paintStroke(data: Uint8Array, width: number, height: number, stroke: SmartBackgroundStroke): void {
  const radius = Math.max(1, stroke.radius * Math.min(width, height));
  const fill = stroke.include ? 255 : 0;
  const stamp = (u: number, v: number) => {
    stampDiskValue(data, width, height, u * (width - 1), v * (height - 1), radius, fill);
  };
  for (const point of stroke.points) stamp(point.u, point.v);
  for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1]!;
    const b = stroke.points[i]!;
    const steps = Math.max(1, Math.ceil(Math.hypot((b.u - a.u) * width, (b.v - a.v) * height)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      stamp(a.u + (b.u - a.u) * t, a.v + (b.v - a.v) * t);
    }
  }
}

function stampDiskValue(
  data: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  value: number,
): void {
  const r = Math.max(1, radius);
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(height - 1, Math.ceil(cy + r));
  const r2 = r * r;
  const fill = clampByte(value);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) data[y * width + x] = fill;
    }
  }
}

export type MaskRefineStage = 'confidence' | 'binary' | 'alpha';

export function stageForSmartView(view: SmartBackgroundView): MaskRefineStage {
  if (view === 'confidence') return 'confidence';
  if (view === 'binary') return 'binary';
  return 'alpha';
}

function controlPixels(amount: number, maxAt1080: number, height: number): number {
  return (Math.abs(amount) / 100) * maxAt1080 * (Math.max(1, height) / 1080);
}

export function removeSpeckles(mask: AlphaMask, minArea: number): AlphaMask {
  const min = Math.max(1, Math.round(minArea));
  if (min <= 1) return copyMask(mask);
  const { width, height, data } = mask;
  const out = new Uint8Array(data);
  const seen = new Uint8Array(data.length);
  const queue = new Int32Array(data.length);
  for (let start = 0; start < data.length; start++) {
    if (seen[start] || (data[start] ?? 0) < 128) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % width;
      const y = (i - x) / width;
      const visit = (j: number) => {
        if (j < 0 || j >= data.length || seen[j] || (data[j] ?? 0) < 128) return;
        seen[j] = 1;
        queue[tail++] = j;
      };
      if (x > 0) visit(i - 1);
      if (x < width - 1) visit(i + 1);
      if (y > 0) visit(i - width);
      if (y < height - 1) visit(i + width);
    }
    if (tail < min) {
      for (let k = 0; k < tail; k++) out[queue[k]!] = 0;
    }
  }
  return { data: out, width, height };
}

export function fillInteriorHoles(mask: AlphaMask, maxArea: number): AlphaMask {
  const cap = Math.max(0, Math.round(maxArea));
  if (cap <= 0) return copyMask(mask);
  const { width, height, data } = mask;
  const border = new Uint8Array(data.length);
  const queue = new Int32Array(data.length);
  let head = 0;
  let tail = 0;
  const push = (i: number) => {
    if (i < 0 || i >= data.length || border[i] || (data[i] ?? 0) >= 128) return;
    border[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (head < tail) {
    const i = queue[head++]!;
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }
  const seen = new Uint8Array(data.length);
  const out = new Uint8Array(data);
  for (let start = 0; start < data.length; start++) {
    if (seen[start] || border[start] || (data[start] ?? 0) >= 128) continue;
    let qh = 0;
    let qt = 0;
    queue[qt++] = start;
    seen[start] = 1;
    while (qh < qt) {
      const i = queue[qh++]!;
      const x = i % width;
      const y = (i - x) / width;
      const visit = (j: number) => {
        if (j < 0 || j >= data.length || seen[j] || border[j] || (data[j] ?? 0) >= 128) return;
        seen[j] = 1;
        queue[qt++] = j;
      };
      if (x > 0) visit(i - 1);
      if (x < width - 1) visit(i + 1);
      if (y > 0) visit(i - width);
      if (y < height - 1) visit(i + width);
    }
    if (qt <= cap) {
      for (let k = 0; k < qt; k++) out[queue[k]!] = 255;
    }
  }
  return { data: out, width, height };
}

export function maskSamplePoints(mask: AlphaMask, count: number): readonly { u: number; v: number }[] {
  const { width, height, data } = mask;
  const coords: number[] = [];
  for (let i = 0; i < data.length; i++) if ((data[i] ?? 0) >= 128) coords.push(i);
  if (coords.length === 0 || count <= 0) return [];
  const chosen: number[] = [coords[(coords.length / 2) | 0]!];
  while (chosen.length < count && chosen.length < Math.min(32, coords.length)) {
    let best = coords[0]!;
    let bestD = -1;
    for (const i of coords) {
      const x = i % width;
      const y = (i - x) / width;
      let nearest = Infinity;
      for (const c of chosen) {
        const cx = c % width;
        const cy = (c - cx) / width;
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d < nearest) nearest = d;
      }
      if (nearest > bestD) {
        bestD = nearest;
        best = i;
      }
    }
    if (chosen.includes(best)) break;
    chosen.push(best);
  }
  return chosen.map((i) => {
    const x = i % width;
    const y = (i - x) / width;
    return { u: x / Math.max(1, width - 1), v: y / Math.max(1, height - 1) };
  });
}

export interface RefineMaskInput {
  readonly mask: AlphaMask;
  readonly luma: Uint8Array | null;
  readonly expansion: number;
  readonly smoothing: number;
  readonly feather: number;
  readonly threshold: number;
  readonly invert: boolean;
  readonly preserveShadows: boolean;
  readonly stage?: MaskRefineStage;
}

function binaryFromConfidence(mask: AlphaMask, threshold: number): AlphaMask {
  const amount = Number.isFinite(threshold) ? threshold : 55;
  return thresholdMask(mask, (Math.min(100, Math.max(0, amount)) / 100) * 255);
}

/** Threshold → morphology → optional boundary feather. Interiors stay 255. */
export function refineMask(input: RefineMaskInput): AlphaMask {
  const stage = input.stage ?? 'alpha';
  if (stage === 'confidence') return copyMask(input.mask);
  let mask = binaryFromConfidence(input.mask, input.threshold);
  const expansionPx = controlPixels(input.expansion, 6, mask.height);
  if (input.expansion > 0) mask = expandMask(mask, expansionPx);
  else if (input.expansion < 0) mask = expandMask(mask, -expansionPx);
  const area = mask.width * mask.height;
  const speckle = (input.smoothing / 100) * (input.smoothing / 100) * 0.0012 * area;
  if (speckle >= 2) {
    mask = removeSpeckles(mask, speckle);
    mask = fillInteriorHoles(mask, speckle * 2);
  }
  if (input.preserveShadows && input.luma && input.luma.length === mask.data.length) {
    mask = preserveContactShadows(mask, input.luma, 70);
  }
  if (input.invert) mask = invertMask(mask);
  if (stage === 'binary') return mask;
  const featherPx = controlPixels(input.feather, 5, mask.height);
  if (featherPx >= 0.6) mask = featherMask(mask, featherPx);
  return mask;
}

export function applyManualStrokes(mask: AlphaMask, effect: VideoEffect & { kind: 'smart-background' }, sourceFrame: number): AlphaMask {
  const next = copyMask(mask);
  for (const stroke of effect.strokes) {
    if (stroke.sourceFrame !== sourceFrame || stroke.points.length === 0) continue;
    paintStroke(next.data, next.width, next.height, stroke);
  }
  return next;
}

export function refineSmartBackground(
  mask: AlphaMask,
  luma: Uint8Array | null,
  effect: VideoEffect & { kind: 'smart-background' },
): AlphaMask {
  return refineMask({
    mask,
    luma,
    expansion: effect.expansion,
    smoothing: effect.smoothing,
    feather: effect.feather,
    threshold: effect.threshold,
    invert: effect.invert,
    preserveShadows: effect.preserveShadows,
    stage: stageForSmartView(effect.view),
  });
}

/** Mix two masks for frames between analysed keyframes. */
export function mixMasks(a: AlphaMask, b: AlphaMask, t: number): AlphaMask {
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const left = a.width === w && a.height === h ? a : resizeMask(a, w, h);
  const right = b.width === w && b.height === h ? b : resizeMask(b, w, h);
  const u = Math.min(1, Math.max(0, t));
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) {
    data[i] = clampByte((left.data[i] ?? 0) * (1 - u) + (right.data[i] ?? 0) * u);
  }
  return { data, width: w, height: h };
}

/**
 * Dense block-matching flow from `prev` to `next` (8-bit luma) and warp `mask`
 * with it. Used to hold a segmentation across frames that were not re-inferred.
 */
export function warpMaskWithFlow(
  mask: AlphaMask,
  prevLuma: Uint8Array,
  nextLuma: Uint8Array,
  width: number,
  height: number,
): AlphaMask {
  const fitted = mask.width === width && mask.height === height ? mask : resizeMask(mask, width, height);
  const block = 8;
  const search = 5;
  const gx = Math.max(1, Math.floor(width / block));
  const gy = Math.max(1, Math.floor(height / block));
  const flowX = new Float32Array(gx * gy);
  const flowY = new Float32Array(gx * gy);
  for (let by = 0; by < gy; by++) {
    for (let bx = 0; bx < gx; bx++) {
      const ox = bx * block;
      const oy = by * block;
      let best = Infinity;
      let fx = 0;
      let fy = 0;
      for (let dy = -search; dy <= search; dy++) {
        for (let dx = -search; dx <= search; dx++) {
          let sad = 0;
          for (let y = 0; y < block; y++) {
            const sy = Math.min(height - 1, oy + y);
            const ty = Math.min(height - 1, Math.max(0, oy + y + dy));
            for (let x = 0; x < block; x++) {
              const sx = Math.min(width - 1, ox + x);
              const tx = Math.min(width - 1, Math.max(0, ox + x + dx));
              sad += Math.abs((nextLuma[sy * width + sx] ?? 0) - (prevLuma[ty * width + tx] ?? 0));
            }
          }
          if (sad < best) {
            best = sad;
            fx = dx;
            fy = dy;
          }
        }
      }
      flowX[by * gx + bx] = fx;
      flowY[by * gx + bx] = fy;
    }
  }
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = Math.min(gy - 1, y / block);
    const y0 = Math.floor(fy);
    const y1 = Math.min(gy - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(gx - 1, x / block);
      const x0 = Math.floor(fx);
      const x1 = Math.min(gx - 1, x0 + 1);
      const tx = fx - x0;
      const sample = (field: Float32Array, ix: number, iy: number) => field[iy * gx + ix] ?? 0;
      const wx = sample(flowX, x0, y0) * (1 - tx) * (1 - ty) + sample(flowX, x1, y0) * tx * (1 - ty) + sample(flowX, x0, y1) * (1 - tx) * ty + sample(flowX, x1, y1) * tx * ty;
      const wy = sample(flowY, x0, y0) * (1 - tx) * (1 - ty) + sample(flowY, x1, y0) * tx * (1 - ty) + sample(flowY, x0, y1) * (1 - tx) * ty + sample(flowY, x1, y1) * tx * ty;
      const sx = Math.min(width - 1, Math.max(0, x + wx));
      const sy = Math.min(height - 1, Math.max(0, y + wy));
      const xA = Math.floor(sx);
      const yA = Math.floor(sy);
      const xB = Math.min(width - 1, xA + 1);
      const yB = Math.min(height - 1, yA + 1);
      const px = sx - xA;
      const py = sy - yA;
      const a = fitted.data[yA * width + xA] ?? 0;
      const b = fitted.data[yA * width + xB] ?? 0;
      const c = fitted.data[yB * width + xA] ?? 0;
      const d = fitted.data[yB * width + xB] ?? 0;
      data[y * width + x] = clampByte(a * (1 - px) * (1 - py) + b * px * (1 - py) + c * (1 - px) * py + d * px * py);
    }
  }
  return { data, width, height };
}

export function splitPromptPhrases(text: string): string[] {
  return text
    .split(/[,;\n]+|\band\b/gi)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
}

/** Bounding boxes of connected keep blobs, in unit coordinates. */
export function maskBoxes(mask: AlphaMask, minCoverage = 0.004): readonly { u: number; v: number; w: number; h: number }[] {
  const { width, height, data } = mask;
  const seen = new Uint8Array(data.length);
  const boxes: { u: number; v: number; w: number; h: number }[] = [];
  const min = Math.max(8, data.length * minCoverage);
  const queue = new Int32Array(data.length);
  for (let start = 0; start < data.length; start++) {
    if (seen[start] || (data[start] ?? 0) < 128) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let count = 0;
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % width;
      const y = (i - x) / width;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
      count++;
      const visit = (j: number) => {
        if (j < 0 || j >= data.length || seen[j] || (data[j] ?? 0) < 128) return;
        seen[j] = 1;
        queue[tail++] = j;
      };
      if (x > 0) visit(i - 1);
      if (x < width - 1) visit(i + 1);
      if (y > 0) visit(i - width);
      if (y < height - 1) visit(i + width);
    }
    if (count < min) continue;
    boxes.push({
      u: minX / width,
      v: minY / height,
      w: (maxX - minX) / width,
      h: (maxY - minY) / height,
    });
  }
  return boxes;
}
