import { type KeyControls } from '../model/effects';

export type Rgb = readonly [number, number, number];
/** Normalized point in the clip picture: x right, y down, both 0..1. */
export type Point = readonly [number, number];
/** Top-left, top-right, bottom-right, bottom-left. */
export type Quad = readonly [Point, Point, Point, Point];
/** Row-major 3×3 matrix. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

const KR = 0.2126;
const KB = 0.0722;
const KG = 1 - KR - KB;
const CB_SCALE = 2 * (1 - KB);
const CR_SCALE = 2 * (1 - KR);

/** Lowest share of the key chroma still treated as the key, so shadows on the screen key cleanly. */
export const KEY_MIN_CHROMA_SHARE = 0.6;
export const KEY_MAX_CHROMA_SHARE = 1.5;

export function parseHexColor(hex: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return [0, 0, 0];
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export function rgbToHex(rgb: Rgb): string {
  const part = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

/** Rec. 709 luma and chroma. Chroma is roughly −0.5..0.5. */
export function rgbToYcc(r: number, g: number, b: number): [number, number, number] {
  const y = KR * r + KG * g + KB * b;
  return [y, (b - y) / CB_SCALE, (r - y) / CR_SCALE];
}

export function yccToRgb(y: number, cb: number, cr: number): [number, number, number] {
  const r = y + CR_SCALE * cr;
  const b = y + CB_SCALE * cb;
  const g = (y - KR * r - KB * b) / KG;
  return [r, g, b];
}

/** Numbers the shader and the CPU keyer both use. */
export interface KeyUniforms {
  readonly cb: number;
  readonly cr: number;
  readonly low: number;
  readonly high: number;
  readonly spill: number;
  /** Matte shrink in source pixels. */
  readonly chokePx: number;
}

export function keyUniforms(controls: KeyControls): KeyUniforms {
  const [r, g, b] = parseHexColor(controls.color);
  const [, cb, cr] = rgbToYcc(r, g, b);
  const low = 0.015 + (controls.tolerance / 100) * 0.3;
  const high = low + 0.004 + (controls.softness / 100) * 0.22;
  return {
    cb,
    cr,
    low,
    high,
    spill: Math.min(1, Math.max(0, controls.spill / 100)),
    chokePx: (Math.min(100, Math.max(0, controls.choke)) / 100) * 4,
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Chroma distance from the key, letting the key color scale along its own hue
 * so darker and lighter shades of the screen still match.
 */
export function keyDistance(cb: number, cr: number, key: Pick<KeyUniforms, 'cb' | 'cr'>): number {
  const k2 = key.cb * key.cb + key.cr * key.cr;
  if (k2 < 1e-8) return Math.hypot(cb, cr);
  const raw = (cb * key.cb + cr * key.cr) / k2;
  const share = Math.min(KEY_MAX_CHROMA_SHARE, Math.max(KEY_MIN_CHROMA_SHARE, raw));
  const faded = Math.max(0, KEY_MIN_CHROMA_SHARE - raw) * Math.sqrt(k2);
  return Math.hypot(cb - key.cb * share, cr - key.cr * share) + faded;
}

/** 0 where the pixel is the key color, 1 where it is kept. */
export function keyAlpha(r: number, g: number, b: number, key: KeyUniforms): number {
  const [, cb, cr] = rgbToYcc(r, g, b);
  return smoothstep(key.low, key.high, keyDistance(cb, cr, key));
}

/** Removes the key hue reflected on the subject while keeping luma. */
export function suppressSpill(r: number, g: number, b: number, key: KeyUniforms): [number, number, number] {
  if (key.spill <= 0) return [r, g, b];
  const [y, cb, cr] = rgbToYcc(r, g, b);
  const len = Math.hypot(key.cb, key.cr);
  if (len < 1e-6) return [r, g, b];
  const ux = key.cb / len;
  const uy = key.cr / len;
  const along = cb * ux + cr * uy;
  if (along <= 0) return [r, g, b];
  const remove = along * key.spill;
  return yccToRgb(y, cb - ux * remove, cr - uy * remove);
}

export type KeyPreference = 'green' | 'blue' | 'any';

/**
 * Most likely key color in an RGBA frame: the median of the saturated green
 * (or blue) pixels. `null` when too little of the picture is a screen color.
 */
export function detectKeyColor(
  data: ArrayLike<number>,
  width: number,
  height: number,
  preference: KeyPreference = 'any',
): string | null {
  const greens: number[][] = [[], [], []];
  const blues: number[][] = [[], [], []];
  const total = width * height;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const r = (data[o] ?? 0) / 255;
    const g = (data[o + 1] ?? 0) / 255;
    const b = (data[o + 2] ?? 0) / 255;
    if ((data[o + 3] ?? 255) < 128) continue;
    const [, cb, cr] = rgbToYcc(r, g, b);
    if (Math.hypot(cb, cr) < 0.1) continue;
    const bucket = g > r + 0.1 && g > b + 0.06 ? greens : b > r + 0.1 && b > g + 0.04 ? blues : null;
    if (!bucket) continue;
    bucket[0]!.push(r);
    bucket[1]!.push(g);
    bucket[2]!.push(b);
  }
  const minimum = Math.max(8, total * 0.01);
  const pick =
    preference === 'green'
      ? greens
      : preference === 'blue'
        ? blues
        : greens[0]!.length >= blues[0]!.length
          ? greens
          : blues;
  if (pick[0]!.length < minimum) return null;
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };
  return rgbToHex([median(pick[0]!), median(pick[1]!), median(pick[2]!)]);
}

/** Average color in a small square around a pixel. */
export function sampleColorAt(
  data: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number,
  radius = 2,
): string {
  const cx = Math.round(Math.min(width - 1, Math.max(0, x)));
  const cy = Math.round(Math.min(height - 1, Math.max(0, y)));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let yy = Math.max(0, cy - radius); yy <= Math.min(height - 1, cy + radius); yy++) {
    for (let xx = Math.max(0, cx - radius); xx <= Math.min(width - 1, cx + radius); xx++) {
      const o = (yy * width + xx) * 4;
      r += data[o] ?? 0;
      g += data[o + 1] ?? 0;
      b += data[o + 2] ?? 0;
      n++;
    }
  }
  if (n === 0) return '#000000';
  return rgbToHex([r / n / 255, g / n / 255, b / n / 255]);
}

export interface KeyRegion {
  readonly quad: Quad;
  /** Bounds as x, y, width, height (normalized). */
  readonly box: readonly [number, number, number, number];
  /** Share of the frame covered by the region. */
  readonly coverage: number;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Andrew's monotone chain. Returns the hull clockwise in image space (y down). */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length <= 2) return sorted;
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}

function triangleArea(a: Point, b: Point, c: Point): number {
  return Math.abs(cross(a, b, c)) / 2;
}

/** Drops the hull vertex that adds the least area until four remain. */
function simplifyToFour(hull: readonly Point[]): number[] {
  const indices = hull.map((_, i) => i);
  while (indices.length > 4) {
    let best = 0;
    let bestArea = Infinity;
    for (let i = 0; i < indices.length; i++) {
      const prev = hull[indices[(i - 1 + indices.length) % indices.length]!]!;
      const cur = hull[indices[i]!]!;
      const next = hull[indices[(i + 1) % indices.length]!]!;
      const area = triangleArea(prev, cur, next);
      if (area < bestArea) {
        bestArea = area;
        best = i;
      }
    }
    indices.splice(best, 1);
  }
  return indices;
}

interface Line {
  readonly px: number;
  readonly py: number;
  readonly dx: number;
  readonly dy: number;
}

/** Total least squares fit through the points. */
function fitLine(points: readonly Point[]): Line | null {
  if (points.length < 2) return null;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p[0];
    my += p[1];
  }
  mx /= points.length;
  my /= points.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const x = p[0] - mx;
    const y = p[1] - my;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { px: mx, py: my, dx: Math.cos(angle), dy: Math.sin(angle) };
}

function intersect(a: Line, b: Line): Point | null {
  const det = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(det) < 1e-6) return null;
  const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / det;
  return [a.px + a.dx * t, a.py + a.dy * t];
}

/** Puts four corners in top-left, top-right, bottom-right, bottom-left order. */
export function orderQuad(points: readonly Point[]): Quad {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const byAngle = [...points].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let start = 0;
  for (let i = 1; i < byAngle.length; i++) {
    const p = byAngle[i]!;
    const s = byAngle[start]!;
    if (p[0] + p[1] < s[0] + s[1]) start = i;
  }
  const at = (i: number) => byAngle[(start + i) % byAngle.length]!;
  return [at(0), at(1), at(2), at(3)];
}

/**
 * Four corners of a quadrilateral blob. Each side is a line fitted through the
 * hull between two corners, so rounded screen corners extend to a sharp corner.
 */
export function quadFromPoints(points: readonly Point[]): Quad | null {
  const hull = convexHull(points);
  if (hull.length < 4) return null;
  const corners = simplifyToFour(hull);
  const lines: (Line | null)[] = [];
  for (let i = 0; i < 4; i++) {
    const from = corners[i]!;
    const to = corners[(i + 1) % 4]!;
    const side: Point[] = [];
    for (let k = from; ; k = (k + 1) % hull.length) {
      side.push(hull[k]!);
      if (k === to) break;
    }
    lines.push(fitLine(side));
  }
  const result: Point[] = [];
  let maxX = -Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let minY = Infinity;
  for (const p of hull) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }
  const reach = Math.max(maxX - minX, maxY - minY) * 0.25;
  for (let i = 0; i < 4; i++) {
    const before = lines[(i + 3) % 4];
    const after = lines[i];
    const vertex = hull[corners[i]!]!;
    const hit = before && after ? intersect(before, after) : null;
    result.push(hit && Math.hypot(hit[0] - vertex[0], hit[1] - vertex[1]) <= reach ? hit : vertex);
  }
  return orderQuad(result);
}

function expandQuad(quad: Quad, amount: number): Quad {
  const cx = (quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4;
  const cy = (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4;
  const grow = (p: Point): Point => {
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [p[0] + (dx / len) * amount, p[1] + (dy / len) * amount];
  };
  return [grow(quad[0]), grow(quad[1]), grow(quad[2]), grow(quad[3])];
}

/**
 * Finds the keyed screen in a small RGBA frame. With a seed (0..1) it takes the
 * region under or nearest to that point; otherwise the largest region.
 */
export function findKeyRegion(
  data: ArrayLike<number>,
  width: number,
  height: number,
  key: KeyUniforms,
  seed: Point | null = null,
  /** Screen found in the previous frame: every key area inside it joins the region (a finger can split it). */
  previous: Quad | null = null,
): KeyRegion | null {
  const total = width * height;
  if (total === 0) return null;
  const mask = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const alpha = keyAlpha((data[o] ?? 0) / 255, (data[o + 1] ?? 0) / 255, (data[o + 2] ?? 0) / 255, key);
    mask[i] = alpha < 0.5 ? 1 : 0;
  }
  const labels = new Int32Array(total).fill(-1);
  const sizes: number[] = [];
  const centers: Point[] = [];
  const queue = new Int32Array(total);
  for (let start = 0; start < total; start++) {
    if (!mask[start] || labels[start]! >= 0) continue;
    const label = sizes.length;
    let head = 0;
    let tail = 0;
    let sumX = 0;
    let sumY = 0;
    queue[tail++] = start;
    labels[start] = label;
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % width;
      const y = (i - x) / width;
      sumX += x + 0.5;
      sumY += y + 0.5;
      const visit = (j: number) => {
        if (mask[j] && labels[j]! < 0) {
          labels[j] = label;
          queue[tail++] = j;
        }
      };
      if (x > 0) visit(i - 1);
      if (x < width - 1) visit(i + 1);
      if (y > 0) visit(i - width);
      if (y < height - 1) visit(i + width);
    }
    sizes.push(tail);
    centers.push([sumX / tail / width, sumY / tail / height]);
  }
  if (sizes.length === 0) return null;

  const minimum = Math.max(6, total * 0.002);
  let chosen = -1;
  const members = new Set<number>();
  if (previous) {
    const area = grownQuad(previous, PREVIOUS_SCREEN_MARGIN);
    let biggest = 0;
    sizes.forEach((size, label) => {
      if (size < minimum || !insideConvexQuad(area, centers[label]!)) return;
      members.add(label);
      if (size > biggest) {
        biggest = size;
        chosen = label;
      }
    });
  }
  if (chosen >= 0) {
    // Tracked from the previous frame.
  } else if (seed) {
    const sx = Math.round(Math.min(width - 1, Math.max(0, seed[0] * width - 0.5)));
    const sy = Math.round(Math.min(height - 1, Math.max(0, seed[1] * height - 0.5)));
    const under = labels[sy * width + sx]!;
    if (under >= 0 && sizes[under]! >= minimum) chosen = under;
    else {
      let best = Infinity;
      for (let i = 0; i < total; i++) {
        const label = labels[i]!;
        if (label < 0 || sizes[label]! < minimum) continue;
        const x = i % width;
        const y = (i - x) / width;
        const d = (x - sx) ** 2 + (y - sy) ** 2;
        if (d < best) {
          best = d;
          chosen = label;
        }
      }
    }
  } else {
    let biggest = 0;
    sizes.forEach((size, label) => {
      if (size > biggest) {
        biggest = size;
        chosen = label;
      }
    });
  }
  if (chosen < 0 || sizes[chosen]! < minimum) return null;
  members.add(chosen);
  const member = new Uint8Array(sizes.length);
  let covered = 0;
  for (const label of members) {
    member[label] = 1;
    covered += sizes[label]!;
  }
  const inRegion = (i: number) => {
    const label = labels[i]!;
    return label >= 0 && member[label] === 1;
  };

  const edge: Point[] = [];
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < total; i++) {
    if (!inRegion(i)) continue;
    const x = i % width;
    const y = (i - x) / width;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + 1);
    maxY = Math.max(maxY, y + 1);
    const inside =
      x > 0 && x < width - 1 && y > 0 && y < height - 1 &&
      inRegion(i - 1) && inRegion(i + 1) && inRegion(i - width) && inRegion(i + width);
    if (inside) continue;
    edge.push([x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]);
  }
  const box: readonly [number, number, number, number] = [
    minX / width,
    minY / height,
    (maxX - minX) / width,
    (maxY - minY) / height,
  ];
  const pixelQuad = quadFromPoints(edge);
  const normalized: Quad = pixelQuad
    ? (pixelQuad.map((p) => [p[0] / width, p[1] / height] as Point) as unknown as Quad)
    : [
        [box[0], box[1]],
        [box[0] + box[2], box[1]],
        [box[0] + box[2], box[1] + box[3]],
        [box[0], box[1] + box[3]],
      ];
  return { quad: expandQuad(normalized, 1 / Math.max(width, height)), box, coverage: covered / total };
}

/** How far around the previous screen a key area may be and still count as part of it. */
const PREVIOUS_SCREEN_MARGIN = 0.15;

function grownQuad(quad: Quad, margin: number): Quad {
  const cx = (quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4;
  const cy = (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4;
  return quad.map((p) => [cx + (p[0] - cx) * (1 + margin), cy + (p[1] - cy) * (1 + margin)]) as unknown as Quad;
}

function insideConvexQuad(quad: Quad, p: Point): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(cross) < 1e-12) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function solve8(a: number[][], b: number[]): number[] | null {
  const n = 8;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row]![col]! / m[col]![col]!;
      for (let k = col; k <= n; k++) m[row]![k]! -= factor * m[col]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/** Homography taking the unit square (0,0)(1,0)(1,1)(0,1) to the quad corners. */
export function homographyFromUnitSquare(quad: Quad): Mat3 | null {
  const src: Point[] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]!;
    const [u, v] = quad[i]!;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve8(a, b);
  if (!h) return null;
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function invertMat3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const s = 1 / det;
  return [
    A * s,
    -(b * i - c * h) * s,
    (b * f - c * e) * s,
    B * s,
    (a * i - c * g) * s,
    -(a * f - c * d) * s,
    C * s,
    -(a * h - b * g) * s,
    (a * e - b * d) * s,
  ];
}

export function applyMat3(m: Mat3, p: Point): Point {
  const w = m[6] * p[0] + m[7] * p[1] + m[8];
  return [(m[0] * p[0] + m[1] * p[1] + m[2]) / w, (m[3] * p[0] + m[4] * p[1] + m[5]) / w];
}

/**
 * Picture → replacement mapping that covers the box with the replacement's
 * aspect ratio, cropping the overflow like `object-fit: cover`.
 */
export function coverBoxMapping(
  box: readonly [number, number, number, number],
  frameAspect: number,
  replacementAspect: number,
): Mat3 {
  const [bx, by, bw, bh] = box;
  const boxAspect = (bw * frameAspect) / Math.max(1e-6, bh);
  let sx = 1;
  let sy = 1;
  if (replacementAspect > boxAspect) sx = boxAspect / replacementAspect;
  else sy = replacementAspect / boxAspect;
  const ax = sx / Math.max(1e-6, bw);
  const ay = sy / Math.max(1e-6, bh);
  return [ax, 0, 0.5 - ax * (bx + bw / 2), 0, ay, 0.5 - ay * (by + bh / 2), 0, 0, 1];
}

/** Keeps a tracked quad steady between neighbouring frames and holds it through brief misses. */
export const TRACKER_HOLD_FRAMES = 12;

export class ScreenTracker {
  #quad: Quad | null = null;
  #frame = Number.NaN;
  #missed = 0;

  /** The tracked screen, used to find the same screen in the next frame. */
  current(): Quad | null {
    return this.#quad;
  }

  center(): Point | null {
    const quad = this.#quad;
    if (!quad) return null;
    return [(quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4, (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4];
  }

  /**
   * `frame` is the sequence frame. Redraws of the same frame do not count as
   * misses, so a screen briefly hidden (a finger, motion blur) is held for
   * up to {@link TRACKER_HOLD_FRAMES} frames.
   */
  update(frame: number, next: Quad | null): Quad | null {
    const sameFrame = frame === this.#frame;
    const adjacent = sameFrame || Math.abs(frame - this.#frame) <= 3;
    this.#frame = frame;
    if (!next) {
      if (!sameFrame) this.#missed += 1;
      if (!adjacent || this.#missed > TRACKER_HOLD_FRAMES) this.#quad = null;
      return this.#quad;
    }
    this.#missed = 0;
    const prev = this.#quad;
    if (!prev || !adjacent) {
      this.#quad = next;
      return next;
    }
    const jump = Math.max(...next.map((p, i) => Math.hypot(p[0] - prev[i]![0], p[1] - prev[i]![1])));
    if (jump > 0.12) {
      this.#quad = next;
      return next;
    }
    const follow = jump > 0.02 ? 0.85 : 0.5;
    this.#quad = next.map((p, i) => [
      prev[i]![0] + (p[0] - prev[i]![0]) * follow,
      prev[i]![1] + (p[1] - prev[i]![1]) * follow,
    ]) as unknown as Quad;
    return this.#quad;
  }

  reset(): void {
    this.#quad = null;
    this.#frame = Number.NaN;
    this.#missed = 0;
  }
}
