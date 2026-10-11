export interface TranscriptPiece {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export type CaptionLanguage = 'auto' | 'en' | 'es';

export interface TranscribeJob {
  readonly id: number;
  readonly samples: Float32Array;
  readonly language: CaptionLanguage;
}

export type TranscribeEvent =
  | { readonly type: 'progress'; readonly id: number; readonly message: string }
  | { readonly type: 'result'; readonly id: number; readonly text: string; readonly chunks: readonly TranscriptPiece[] }
  | { readonly type: 'error'; readonly id: number; readonly message: string };
