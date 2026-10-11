import { type SpeechLanguage } from '@timeline/core';

export type SpeechJob = {
  readonly id: number;
  readonly text: string;
  readonly language: SpeechLanguage;
};

export type SpeechEvent =
  | { readonly id: number; readonly type: 'progress'; readonly message: string }
  | { readonly id: number; readonly type: 'result'; readonly samples: Float32Array; readonly sampleRate: number }
  | { readonly id: number; readonly type: 'error'; readonly message: string };
