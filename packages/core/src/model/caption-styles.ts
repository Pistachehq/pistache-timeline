import { type ClipText, type TextShadow } from './text';

export interface CaptionDesign {
  readonly id: string;
  readonly label: string;
  readonly text: {
    readonly fontFamily: string;
    readonly color: string;
    readonly bold: boolean;
    readonly outlineWidth: number;
    readonly outlineColor: string;
    readonly shadow: TextShadow | null;
    readonly backgroundColor: string | null;
  };
}

/** Looks applied to every caption line. Size and position stay separate. */
export const CAPTION_DESIGNS: readonly CaptionDesign[] = [
  {
    id: 'classic',
    label: 'Classic',
    text: {
      fontFamily: 'Atkinson Hyperlegible',
      color: '#ffffff',
      bold: true,
      outlineWidth: 5,
      outlineColor: '#000000',
      shadow: null,
      backgroundColor: null,
    },
  },
  {
    id: 'box',
    label: 'Box',
    text: {
      fontFamily: 'Atkinson Hyperlegible',
      color: '#ffffff',
      bold: true,
      outlineWidth: 0,
      outlineColor: '#000000',
      shadow: null,
      backgroundColor: '#000000cc',
    },
  },
  {
    id: 'yellow',
    label: 'Yellow',
    text: {
      fontFamily: 'Atkinson Hyperlegible',
      color: '#ffe14a',
      bold: true,
      outlineWidth: 5,
      outlineColor: '#000000',
      shadow: null,
      backgroundColor: null,
    },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    text: {
      fontFamily: 'Inter',
      color: '#ffffff',
      bold: false,
      outlineWidth: 0,
      outlineColor: '#000000',
      shadow: { color: '#000000aa', offsetX: 0, offsetY: 2, blur: 8 },
      backgroundColor: null,
    },
  },
  {
    id: 'soft',
    label: 'Soft',
    text: {
      fontFamily: 'Nunito',
      color: '#f4f1ea',
      bold: true,
      outlineWidth: 0,
      outlineColor: '#000000',
      shadow: { color: '#00000099', offsetX: 0, offsetY: 4, blur: 16 },
      backgroundColor: null,
    },
  },
  {
    id: 'bar',
    label: 'Bar',
    text: {
      fontFamily: 'Roboto',
      color: '#ffffff',
      bold: true,
      outlineWidth: 0,
      outlineColor: '#000000',
      shadow: null,
      backgroundColor: '#141820f2',
    },
  },
];

export const CAPTION_POSITIONS = [
  { id: 'top', label: 'Top', fraction: -0.34 },
  { id: 'middle', label: 'Middle', fraction: 0 },
  { id: 'lower', label: 'Lower', fraction: 0.22 },
  { id: 'bottom', label: 'Bottom', fraction: 0.36 },
] as const;

export type CaptionPositionId = (typeof CAPTION_POSITIONS)[number]['id'];

export const CAPTION_SIZES = [
  { id: 's', label: 'S', fontSize: 36 },
  { id: 'm', label: 'M', fontSize: 52 },
  { id: 'l', label: 'L', fontSize: 72 },
] as const;

export const DEFAULT_CAPTION_FONT_SIZE = 52;

export function captionDesignById(id: string): CaptionDesign {
  return CAPTION_DESIGNS.find((design) => design.id === id) ?? CAPTION_DESIGNS[0]!;
}

export function matchingCaptionDesign(text: ClipText): string {
  const found = CAPTION_DESIGNS.find(
    (design) =>
      design.text.color === text.color &&
      design.text.backgroundColor === text.backgroundColor &&
      design.text.outlineWidth === text.outlineWidth &&
      design.text.fontFamily === text.fontFamily &&
      (design.text.shadow === null) === (text.shadow === null),
  );
  return found?.id ?? 'classic';
}

export function captionPositionY(positionId: CaptionPositionId, frameHeight: number): number {
  const position = CAPTION_POSITIONS.find((item) => item.id === positionId) ?? CAPTION_POSITIONS[3]!;
  return Math.round(position.fraction * frameHeight);
}

export function matchingCaptionPosition(positionY: number, frameHeight: number): CaptionPositionId {
  const fraction = frameHeight > 0 ? positionY / frameHeight : 0;
  let best: CaptionPositionId = 'bottom';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const position of CAPTION_POSITIONS) {
    const distance = Math.abs(position.fraction - fraction);
    if (distance < bestDistance) {
      best = position.id;
      bestDistance = distance;
    }
  }
  return best;
}
