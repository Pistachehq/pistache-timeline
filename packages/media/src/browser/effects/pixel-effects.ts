import {
  coverBoxMapping,
  findKeyRegion,
  homographyFromUnitSquare,
  invertMat3,
  isPixelVideoEffect,
  keyUniforms,
  ScreenTracker,
  type Mat3,
  type Point,
  type Quad,
  type VideoEffect,
} from '@timeline/core';

export type PixelSource = TexImageSource & CanvasImageSource;

export interface PixelReplacement {
  readonly source: PixelSource;
  readonly width: number;
  readonly height: number;
}

export interface PixelFrameInput {
  readonly source: PixelSource;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly effects: readonly VideoEffect[];
  /** Replacement picture by asset id, for Screen Replace. */
  readonly replacements: ReadonlyMap<string, PixelReplacement>;
  /** Sequence frame, so tracking can smooth between neighbouring frames. */
  readonly frame: number;
  /** Tracking state for this clip; keep one per clip across frames. */
  readonly tracking: PixelTracking;
}

/** Per-clip memory for Screen Replace: one tracker per effect slot. */
export class PixelTracking {
  readonly #trackers = new Map<number, { tracker: ScreenTracker; target: string }>();

  /** `target` identifies what is tracked (picked point, fit); a new target starts over. */
  tracker(slot: number, target = ''): ScreenTracker {
    let entry = this.#trackers.get(slot);
    if (!entry) {
      entry = { tracker: new ScreenTracker(), target };
      this.#trackers.set(slot, entry);
    } else if (entry.target !== target) {
      entry.target = target;
      entry.tracker.reset();
    }
    return entry.tracker;
  }

  reset(): void {
    for (const entry of this.#trackers.values()) entry.tracker.reset();
  }
}

function boxQuad([x, y, w, h]: readonly [number, number, number, number]): Quad {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

function quadBox(quad: Quad): [number, number, number, number] {
  const xs = quad.map((p) => p[0]);
  const ys = quad.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
}

const MAX_KEYS = 4;
const MAX_REPLACEMENTS = 2;
const ANALYSIS_WIDTH = 320;
/** Choke and sharpen radii are in pixels of a 1080-line picture, so preview and export match. */
const REFERENCE_LINES = 1080;

const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform sampler2D uRepl0;
uniform sampler2D uRepl1;
uniform vec2 uTexel;
uniform vec2 uSharpen;
uniform int uKeyCount;
uniform vec4 uKeyA[${MAX_KEYS}];
uniform vec4 uKeyB[${MAX_KEYS}];
uniform vec4 uLuma;
uniform mat3 uReplH[${MAX_REPLACEMENTS}];
uniform int uReplState[${MAX_REPLACEMENTS}];
uniform vec4 uVignette;
uniform int uMatte;

const float KR = 0.2126;
const float KB = 0.0722;
const float KG = 1.0 - KR - KB;

vec3 toYcc(vec3 c) {
  float y = KR * c.r + KG * c.g + KB * c.b;
  return vec3(y, (c.b - y) / (2.0 * (1.0 - KB)), (c.r - y) / (2.0 * (1.0 - KR)));
}

vec3 toRgb(vec3 v) {
  float r = v.x + 2.0 * (1.0 - KR) * v.z;
  float b = v.x + 2.0 * (1.0 - KB) * v.y;
  float g = (v.x - KR * r - KB * b) / KG;
  return vec3(r, g, b);
}

float keyDist(vec2 c, vec2 k) {
  float k2 = dot(k, k);
  if (k2 < 1e-8) return length(c);
  float raw = dot(c, k) / k2;
  float share = clamp(raw, 0.6, 1.5);
  float faded = max(0.0, 0.6 - raw) * sqrt(k2);
  return length(c - k * share) + faded;
}

float keyAt(vec2 uv, vec4 a) {
  vec3 ycc = toYcc(texture(uSrc, uv).rgb);
  return smoothstep(a.z, a.w, keyDist(ycc.yz, a.xy));
}

vec4 replacement(int slot, vec2 ruv) {
  return slot == 0 ? texture(uRepl0, ruv) : texture(uRepl1, ruv);
}

void main() {
  vec4 src = texture(uSrc, vUv);
  vec3 rgb = src.rgb;
  if (uSharpen.x > 0.0) {
    vec2 o = uTexel * uSharpen.y;
    vec3 blur = (
      texture(uSrc, vUv + vec2(o.x, 0.0)).rgb + texture(uSrc, vUv - vec2(o.x, 0.0)).rgb +
      texture(uSrc, vUv + vec2(0.0, o.y)).rgb + texture(uSrc, vUv - vec2(0.0, o.y)).rgb +
      (texture(uSrc, vUv + o).rgb + texture(uSrc, vUv - o).rgb +
       texture(uSrc, vUv + vec2(o.x, -o.y)).rgb + texture(uSrc, vUv + vec2(-o.x, o.y)).rgb) * 0.5
    ) / 6.0;
    rgb = clamp(rgb + (rgb - blur) * uSharpen.x, 0.0, 1.0);
  }

  vec3 ycc0 = toYcc(src.rgb);
  vec3 ycc = toYcc(rgb);
  for (int i = 0; i < ${MAX_KEYS}; i++) {
    if (i >= uKeyCount) break;
    float spill = uKeyB[i].x;
    vec2 k = uKeyA[i].xy;
    float len = length(k);
    if (spill > 0.0 && len > 1e-6) {
      vec2 u = k / len;
      float along = dot(ycc.yz, u);
      if (along > 0.0) ycc.yz -= u * along * spill;
    }
  }
  vec3 color = clamp(toRgb(ycc), 0.0, 1.0);
  float alpha = src.a;
  float matte = 1.0;

  for (int i = 0; i < ${MAX_KEYS}; i++) {
    if (i >= uKeyCount) break;
    vec4 a = uKeyA[i];
    vec4 b = uKeyB[i];
    float keep = smoothstep(a.z, a.w, keyDist(ycc0.yz, a.xy));
    if (b.y > 0.0) {
      vec2 o = uTexel * b.y;
      keep = min(keep, min(min(keyAt(vUv + o, a), keyAt(vUv - o, a)),
                           min(keyAt(vUv + vec2(o.x, -o.y), a), keyAt(vUv + vec2(-o.x, o.y), a))));
    }
    int mode = int(b.z + 0.5);
    if (mode == 0) {
      alpha *= keep;
      matte *= keep;
      continue;
    }
    int slot = int(b.w + 0.5);
    int state = slot == 0 ? uReplState[0] : uReplState[1];
    if (state == 0) {
      alpha *= keep;
      matte *= keep;
      continue;
    }
    if (state == 2) continue;
    vec3 h = (slot == 0 ? uReplH[0] : uReplH[1]) * vec3(vUv, 1.0);
    if (h.z <= 0.0) continue;
    vec2 ruv = h.xy / h.z;
    if (ruv.x < 0.0 || ruv.y < 0.0 || ruv.x > 1.0 || ruv.y > 1.0) continue;
    vec4 rep = replacement(slot, ruv);
    color = mix(rep.rgb, color, keep);
    alpha = mix(rep.a, alpha, keep);
    matte *= keep;
  }

  if (uLuma.x > 0.5) {
    float keep = smoothstep(uLuma.y, uLuma.z, ycc0.x);
    if (uLuma.w > 0.5) keep = 1.0 - keep;
    alpha *= keep;
    matte *= keep;
  }

  if (uVignette.x != 0.0) {
    vec2 d = (vUv - 0.5) * vec2(uVignette.w, 1.0);
    float dist = length(d) / length(vec2(uVignette.w, 1.0) * 0.5);
    float outer = 0.45 + uVignette.y * 0.75;
    float inner = max(0.0, outer - (0.05 + uVignette.z * 0.85));
    float t = smoothstep(inner, outer, dist);
    color = uVignette.x > 0.0 ? color * (1.0 - uVignette.x * t) : mix(color, vec3(1.0), -uVignette.x * t);
  }

  if (uMatte == 1) {
    outColor = vec4(vec3(matte * src.a), 1.0);
    return;
  }
  outColor = vec4(color * alpha, alpha);
}`;

interface Programs {
  readonly gl: WebGL2RenderingContext;
  readonly program: WebGLProgram;
  readonly src: WebGLTexture;
  readonly repl: readonly WebGLTexture[];
  readonly uniforms: Record<string, WebGLUniformLocation | null>;
}

const UNIFORMS = [
  'uSrc',
  'uRepl0',
  'uRepl1',
  'uTexel',
  'uSharpen',
  'uKeyCount',
  'uKeyA',
  'uKeyB',
  'uLuma',
  'uReplH',
  'uReplState',
  'uVignette',
  'uMatte',
] as const;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function texture(gl: WebGL2RenderingContext): WebGLTexture | null {
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  return tex;
}

function columnMajor(m: Mat3): number[] {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

type Keyed = VideoEffect & { kind: 'chroma-key' | 'screen-replace' };

interface AnalysisFrame {
  readonly data: Uint8ClampedArray;
  readonly w: number;
  readonly h: number;
}

/**
 * Chroma key, luma key, screen replace, sharpen and vignette in one WebGL2
 * pass. Returns its canvas with the processed picture, or `null` without WebGL2.
 */
export class PixelEffectsRenderer {
  readonly canvas: HTMLCanvasElement;
  #programs: Programs | null = null;
  #failed = false;
  #analysis: CanvasRenderingContext2D | null = null;
  /** What each replacement texture holds, so a source without a frame (seeking) reuses it. */
  readonly #slotPictures: ({ readonly assetId: string; readonly width: number; readonly height: number } | null)[] = [
    null,
    null,
  ];

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.#programs = null;
      this.#slotPictures.fill(null);
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.#failed = false;
    });
  }

  #init(): Programs | null {
    if (this.#programs) return this.#programs;
    if (this.#failed) return null;
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: true });
    if (!gl) {
      this.#failed = true;
      return null;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      this.#failed = true;
      return null;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'aPos');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      this.#failed = true;
      return null;
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const src = texture(gl);
    const repl0 = texture(gl);
    const repl1 = texture(gl);
    if (!src || !repl0 || !repl1) {
      this.#failed = true;
      return null;
    }
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of UNIFORMS) uniforms[name] = gl.getUniformLocation(program, name);
    this.#programs = { gl, program, src, repl: [repl0, repl1], uniforms };
    return this.#programs;
  }

  /** Downscaled pixels of the source, for locating the screen to replace. */
  #analyse(source: PixelSource, width: number, height: number): AnalysisFrame | null {
    if (!this.#analysis) {
      const canvas = document.createElement('canvas');
      this.#analysis = canvas.getContext('2d', { willReadFrequently: true });
    }
    const ctx = this.#analysis;
    if (!ctx || width <= 0 || height <= 0) return null;
    const w = Math.min(ANALYSIS_WIDTH, Math.max(8, Math.round(width)));
    const h = Math.max(8, Math.round((w * height) / width));
    if (ctx.canvas.width !== w || ctx.canvas.height !== h) {
      ctx.canvas.width = w;
      ctx.canvas.height = h;
    }
    try {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(source, 0, 0, w, h);
      return { data: ctx.getImageData(0, 0, w, h).data, w, h };
    } catch {
      return null;
    }
  }

  render(input: PixelFrameInput): HTMLCanvasElement | null {
    const programs = this.#init();
    if (!programs) return null;
    const { gl, uniforms: u } = programs;
    const { outputWidth, outputHeight, sourceWidth, sourceHeight } = input;
    if (outputWidth <= 0 || outputHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0) return null;
    const w = Math.max(1, Math.round(outputWidth));
    const h = Math.max(1, Math.round(outputHeight));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    gl.useProgram(programs.program);
    gl.viewport(0, 0, w, h);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, programs.src);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input.source);
    } catch {
      return null;
    }
    gl.uniform1i(u.uSrc!, 0);

    const aspect = sourceWidth / sourceHeight;
    gl.uniform2f(u.uTexel!, 1 / (REFERENCE_LINES * aspect), 1 / REFERENCE_LINES);

    let sharpen = 0;
    let sharpenRadius = 1;
    let vignette: [number, number, number, number] = [0, 0.5, 0.5, aspect];
    let luma: [number, number, number, number] = [0, 0, 0, 0];
    let matte = 0;
    const keyed: { effect: Keyed; index: number }[] = [];
    input.effects.forEach((effect, index) => {
      if (!isPixelVideoEffect(effect)) return;
      switch (effect.kind) {
        case 'sharpen':
          sharpen += Math.max(0, effect.amount) / 50;
          sharpenRadius = Math.min(5, Math.max(0.5, effect.radius));
          break;
        case 'vignette':
          vignette = [
            Math.max(-1, Math.min(1, effect.amount / 100)),
            Math.min(1, Math.max(0, effect.size / 100)),
            Math.min(1, Math.max(0, effect.feather / 100)),
            aspect,
          ];
          break;
        case 'luma-key': {
          const low = Math.min(1, Math.max(0, effect.threshold / 100));
          const high = Math.min(1.001, low + 0.002 + Math.max(0, effect.softness / 100) * 0.5);
          luma = [1, low, high, effect.invert ? 1 : 0];
          break;
        }
        case 'chroma-key':
          if (effect.view === 'matte') matte = 1;
          if (keyed.length < MAX_KEYS) keyed.push({ effect, index });
          break;
        case 'screen-replace':
          if (keyed.length < MAX_KEYS) keyed.push({ effect, index });
          break;
        default:
          break;
      }
    });
    gl.uniform2f(u.uSharpen!, sharpen, sharpenRadius);
    gl.uniform4f(u.uVignette!, ...vignette);
    gl.uniform4f(u.uLuma!, ...luma);
    gl.uniform1i(u.uMatte!, matte);

    const keyA = new Float32Array(MAX_KEYS * 4);
    const keyB = new Float32Array(MAX_KEYS * 4);
    const replH = new Float32Array(MAX_REPLACEMENTS * 9);
    const replState = new Int32Array(MAX_REPLACEMENTS);
    for (let s = 0; s < MAX_REPLACEMENTS; s++) replH.set(columnMajor(IDENTITY), s * 9);
    let slots = 0;
    let analysis: AnalysisFrame | null | undefined;

    keyed.forEach(({ effect, index }, i) => {
      const key = keyUniforms(effect);
      keyA.set([key.cb, key.cr, key.low, key.high], i * 4);
      if (effect.kind === 'chroma-key') {
        keyB.set([key.spill, key.chokePx, 0, 0], i * 4);
        return;
      }
      if (slots >= MAX_REPLACEMENTS) {
        keyB.set([key.spill, key.chokePx, 0, 0], i * 4);
        return;
      }
      const slot = slots++;
      keyB.set([key.spill, key.chokePx, 1, slot], i * 4);
      const fresh = effect.sourceAssetId ? input.replacements.get(effect.sourceAssetId) : undefined;
      const usable = fresh && fresh.width > 0 && fresh.height > 0 ? fresh : undefined;
      const held = this.#slotPictures[slot];
      // While a replacement video seeks it has no frame; keep showing its last one.
      const size = usable ?? (held && held.assetId === effect.sourceAssetId ? held : undefined);
      if (!effect.sourceAssetId || !size) {
        replState[slot] = effect.sourceAssetId ? 2 : 0;
        return;
      }
      const replAspect = size.width / size.height;
      let mapping: Mat3 | null = null;
      if (effect.fit === 'frame') {
        mapping = coverBoxMapping([0, 0, 1, 1], aspect, replAspect);
      } else {
        if (analysis === undefined) analysis = this.#analyse(input.source, sourceWidth, sourceHeight);
        const tracker = input.tracking.tracker(index, `${effect.fit}:${effect.seedX}:${effect.seedY}`);
        const picked: Point | null = effect.seedX !== null && effect.seedY !== null ? [effect.seedX, effect.seedY] : null;
        // Follow the screen found in the previous frame, so a moving phone keeps its screen
        // and a finger splitting the green area does not make the target jump.
        const seed = tracker.center() ?? picked;
        const region = analysis
          ? findKeyRegion(analysis.data, analysis.w, analysis.h, key, seed, tracker.current())
          : null;
        if (effect.fit === 'box') {
          const box = tracker.update(input.frame, region ? boxQuad(region.box) : null);
          if (box) mapping = coverBoxMapping(quadBox(box), aspect, replAspect);
        } else {
          const quad = tracker.update(input.frame, region?.quad ?? null);
          const forward = quad ? homographyFromUnitSquare(quad) : null;
          mapping = forward ? invertMat3(forward) : null;
        }
      }
      if (!mapping) {
        replState[slot] = 2;
        return;
      }
      replState[slot] = 1;
      replH.set(columnMajor(mapping), slot * 9);
      gl.activeTexture(slot === 0 ? gl.TEXTURE1 : gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, programs.repl[slot]!);
      if (!usable) return;
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, usable.source);
        this.#slotPictures[slot] = { assetId: effect.sourceAssetId, width: usable.width, height: usable.height };
      } catch {
        replState[slot] = held && held.assetId === effect.sourceAssetId ? 1 : 2;
      }
    });
    gl.uniform1i(u.uRepl0!, 1);
    gl.uniform1i(u.uRepl1!, 2);
    gl.uniform1i(u.uKeyCount!, keyed.length);
    gl.uniform4fv(u.uKeyA!, keyA);
    gl.uniform4fv(u.uKeyB!, keyB);
    gl.uniformMatrix3fv(u.uReplH!, false, replH);
    gl.uniform1iv(u.uReplState!, replState);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }

  dispose(): void {
    const programs = this.#programs;
    if (programs) {
      programs.gl.deleteTexture(programs.src);
      for (const tex of programs.repl) programs.gl.deleteTexture(tex);
      programs.gl.deleteProgram(programs.program);
      programs.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.#programs = null;
  }
}

/** Screen Replace sources referenced by these effects. */
export function replacementAssetIds(effects: readonly VideoEffect[]): string[] {
  const ids = new Set<string>();
  for (const effect of effects) {
    if (effect.kind === 'screen-replace' && effect.sourceAssetId) ids.add(effect.sourceAssetId);
  }
  return [...ids];
}

/** Replacement media time: plays from the clip head and loops. */
export function replacementTimeSeconds(localSeconds: number, durationSeconds: number): number {
  if (!(durationSeconds > 0)) return Math.max(0, localSeconds);
  const t = localSeconds % durationSeconds;
  return t < 0 ? t + durationSeconds : t;
}
