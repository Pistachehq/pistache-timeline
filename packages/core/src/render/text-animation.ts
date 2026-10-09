import { type TextAnimationId } from '../model/text';

export interface TextRun {
  readonly text: string;
  readonly opacity: number;
  readonly offsetY: number;
  readonly blur: number;
  readonly scale: number;
}

export interface TextAnimationFrame {
  readonly runs: readonly TextRun[];
  readonly caret: boolean;
  /** Extra letter-spacing in pixels, added to the clip's own tracking. */
  readonly letterSpacing: number;
}

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&';

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smooth(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function backOut(t: number): number {
  const x = clamp01(t);
  const c = 1.70158;
  const u = x - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

function hash(text: string, index: number): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h = Math.imul(h ^ index, 16777619);
  return h >>> 0;
}

function wrongLetter(char: string, index: number, content: string): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const lower = char.toLowerCase();
  const at = alphabet.indexOf(lower);
  const step = (hash(content, index) % 4) + 1;
  const next = alphabet[(at + step) % alphabet.length] ?? 'x';
  return char === lower ? next : next.toUpperCase();
}

function shouldTypo(char: string, index: number): boolean {
  if (!/[a-z]/i.test(char)) return false;
  return (char.charCodeAt(0) + index) % 5 === 0;
}

/** Deterministic type-on script. Typos insert a wrong glyph, pause, then backspace. */
export function buildTypewriterScript(content: string, typos: boolean): readonly string[] {
  const frames: string[] = [''];
  let built = '';
  const chars = [...content];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? '';
    if (typos && shouldTypo(ch, i)) {
      const wrong = wrongLetter(ch, i, content);
      if (wrong !== ch) {
        built += wrong;
        frames.push(built, built);
        built = built.slice(0, -1);
        frames.push(built);
      }
    }
    built += ch;
    frames.push(built);
    if (ch === ' ' || ch === '\n') frames.push(built);
  }
  return frames;
}

function typewriterFrame(content: string, typos: boolean, progress: number): TextAnimationFrame {
  const script = buildTypewriterScript(content, typos);
  const p = clamp01(progress);
  const last = Math.max(0, script.length - 1);
  // progress 0 is the first step and progress 1 is the finished string, so the
  // typing fills the whole duration instead of ending on a fixed clock.
  const index = Math.min(last, Math.floor(p * last));
  const text = p >= 1 ? content : (script[index] ?? '');
  return {
    runs: [{ text, opacity: 1, offsetY: 0, blur: 0, scale: 1 }],
    caret: p < 1 && text !== content,
    letterSpacing: 0,
  };
}

function tokensOf(content: string, byChar: boolean): string[] {
  if (!content) return [];
  if (byChar) return [...content];
  return content.split(/(\s+)/).filter((part) => part.length > 0);
}

function stagger(count: number, index: number, progress: number): number {
  if (count <= 1) return smooth(progress);
  // First unit starts at 0. The last unit finishes exactly at progress 1,
  // so the whole reveal lasts the duration the user set.
  const start = (index / (count - 1)) * 0.62;
  return smooth((progress - start) / 0.38);
}

function reveal(
  content: string,
  progress: number,
  byChar: boolean,
  paint: (t: number) => Pick<TextRun, 'opacity' | 'offsetY' | 'blur' | 'scale'>,
): TextAnimationFrame {
  const parts = tokensOf(content, byChar);
  return {
    runs: parts.map((text, index) => ({ text, ...paint(stagger(parts.length, index, progress)) })),
    caret: false,
    letterSpacing: 0,
  };
}

function decodeFrame(content: string, progress: number): TextAnimationFrame {
  const chars = [...content];
  const bucket = Math.floor(clamp01(progress) * 14);
  const runs = chars.map((ch, index) => {
    const t = stagger(Math.max(1, chars.length), index, progress);
    if (t >= 1 || /\s/.test(ch)) return { text: ch, opacity: 1, offsetY: 0, blur: 0, scale: 1 };
    const glyph = GLYPHS[hash(content, index + bucket * 17) % GLYPHS.length] ?? ch;
    return { text: glyph, opacity: 0.85, offsetY: 0, blur: 0, scale: 1 };
  });
  return { runs, caret: false, letterSpacing: 0 };
}

/** Visible text at `progress` (0 = clip start, 1 = clip end). */
export function textAnimationFrame(
  content: string,
  animation: TextAnimationId,
  progress: number,
): TextAnimationFrame {
  const p = clamp01(progress);
  switch (animation) {
    case 'none':
      return { runs: [{ text: content, opacity: 1, offsetY: 0, blur: 0, scale: 1 }], caret: false, letterSpacing: 0 };
    case 'typewriter':
      return typewriterFrame(content, false, p);
    case 'typewriter-typos':
      return typewriterFrame(content, true, p);
    case 'word-fade':
      return reveal(content, p, false, (t) => ({ opacity: t, offsetY: 0, blur: 0, scale: 1 }));
    case 'char-fade':
      return reveal(content, p, true, (t) => ({ opacity: t, offsetY: 0, blur: 0, scale: 1 }));
    case 'rise':
      return reveal(content, p, false, (t) => ({ opacity: t, offsetY: (1 - t) * 28, blur: 0, scale: 1 }));
    case 'pop':
      return reveal(content, p, true, (t) => ({ opacity: t, offsetY: 0, blur: 0, scale: 0.2 + 0.8 * t }));
    case 'blur-in':
      return reveal(content, p, false, (t) => ({ opacity: t, offsetY: 0, blur: (1 - t) * 14, scale: 1 }));
    case 'bounce':
      return reveal(content, p, false, (t) => ({ opacity: Math.min(1, t * 1.4), offsetY: (1 - backOut(t)) * 22, blur: 0, scale: 0.6 + 0.4 * backOut(t) }));
    case 'decode':
      return decodeFrame(content, p);
    case 'tracking':
      return {
        runs: [{ text: content, opacity: smooth(p), offsetY: 0, blur: 0, scale: 1 }],
        caret: false,
        letterSpacing: (1 - smooth(p)) * 22,
      };
    default:
      return { runs: [{ text: content, opacity: 1, offsetY: 0, blur: 0, scale: 1 }], caret: false, letterSpacing: 0 };
  }
}

export function textAnimationProgress(localFrame: number, durationFrames: number): number {
  if (durationFrames <= 1) return 1;
  return clamp01(localFrame / (durationFrames - 1));
}
