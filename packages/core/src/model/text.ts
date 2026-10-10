/** How a text clip reveals its characters. `none` shows the full string. */
export const TEXT_ANIMATION_IDS = [
  'none',
  'typewriter',
  'typewriter-typos',
  'word-fade',
  'char-fade',
  'rise',
  'pop',
  'blur-in',
  'decode',
  'bounce',
  'tracking',
] as const;

export type TextAnimationId = (typeof TEXT_ANIMATION_IDS)[number];

export interface TextShadow {
  readonly color: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blur: number;
}

export interface ClipText {
  readonly content: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  /** Data URL of a font file uploaded from disk. `null` uses `fontFamily` from the catalog. */
  readonly fontDataUrl: string | null;
  readonly color: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strike: boolean;
  /** Extra tracking in pixels, before the animation adds its own. */
  readonly letterSpacing: number;
  readonly align: 'left' | 'center' | 'right' | 'justify';
  /** How long the text transition takes. The rest of the clip holds the finished text. */
  readonly animationFrames: number;
  readonly shadow: TextShadow | null;
  readonly outlineWidth: number;
  readonly outlineColor: string;
  /** Plate behind the glyphs. `null` draws the text on the picture. */
  readonly backgroundColor: string | null;
  readonly animation: TextAnimationId;
}

export const DEFAULT_CLIP_TEXT: ClipText = {
  content: 'Text',
  fontFamily: 'Atkinson Hyperlegible',
  fontSize: 72,
  fontDataUrl: null,
  color: '#ffffff',
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  letterSpacing: 0,
  align: 'center',
  animationFrames: 60,
  shadow: { color: '#000000cc', offsetX: 0, offsetY: 3, blur: 10 },
  outlineWidth: 0,
  outlineColor: '#000000',
  backgroundColor: null,
  animation: 'none',
};

/** Text clips can be extended far past their original duration. */
export const TEXT_CLIP_MAX_SOURCE_FRAMES = 1_000_000;

export function isTextClip(clip: { readonly text: ClipText | null }): boolean {
  return clip.text !== null;
}

export function textClipName(content: string): string {
  const line = content.split('\n')[0]?.trim() ?? '';
  if (!line) return 'Text';
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
}
