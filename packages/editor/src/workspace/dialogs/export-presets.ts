import { FrameRates, frameRatesEqual, type FrameRate, type Sequence } from '@timeline/core';
import { type ExportOutputSettings } from '@timeline/media';

export type ExportResolutionPreset =
  | 'sequence'
  | '3840x2160'
  | '1920x1080'
  | '1280x720'
  | '854x480'
  | 'custom';

export type ExportFrameRatePreset =
  | 'sequence'
  | '23.976'
  | '24'
  | '25'
  | '29.97'
  | '30'
  | '50'
  | '59.94'
  | '60';

const RESOLUTIONS: Record<Exclude<ExportResolutionPreset, 'sequence' | 'custom'>, { width: number; height: number }> = {
  '3840x2160': { width: 3840, height: 2160 },
  '1920x1080': { width: 1920, height: 1080 },
  '1280x720': { width: 1280, height: 720 },
  '854x480': { width: 854, height: 480 },
};

const FRAME_RATE_PRESETS: Record<Exclude<ExportFrameRatePreset, 'sequence'>, FrameRate> = {
  '23.976': FrameRates.fps23_976,
  '24': FrameRates.fps24,
  '25': FrameRates.fps25,
  '29.97': FrameRates.fps29_97,
  '30': FrameRates.fps30,
  '50': FrameRates.fps50,
  '59.94': FrameRates.fps59_94,
  '60': FrameRates.fps60,
};

export function detectFrameRatePreset(sequence: Sequence): ExportFrameRatePreset {
  for (const [key, rate] of Object.entries(FRAME_RATE_PRESETS) as [Exclude<ExportFrameRatePreset, 'sequence'>, FrameRate][]) {
    if (frameRatesEqual(sequence.frameRate, rate)) return key;
  }
  return 'sequence';
}

export function buildExportOutput(
  sequence: Sequence,
  resolutionPreset: ExportResolutionPreset,
  customWidth: number,
  customHeight: number,
  frameRatePreset: ExportFrameRatePreset,
): ExportOutputSettings {
  let width = sequence.resolution.width;
  let height = sequence.resolution.height;
  if (resolutionPreset === 'custom') {
    width = customWidth;
    height = customHeight;
  } else if (resolutionPreset !== 'sequence') {
    ({ width, height } = RESOLUTIONS[resolutionPreset]);
  }

  const frameRate =
    frameRatePreset === 'sequence' ? sequence.frameRate : FRAME_RATE_PRESETS[frameRatePreset];

  return { width, height, frameRate };
}

export const RESOLUTION_PRESET_OPTIONS: readonly { value: ExportResolutionPreset; label: string }[] = [
  { value: 'sequence', label: 'Match sequence' },
  { value: '3840x2160', label: '3840 × 2160 (4K UHD)' },
  { value: '1920x1080', label: '1920 × 1080 (1080p)' },
  { value: '1280x720', label: '1280 × 720 (720p)' },
  { value: '854x480', label: '854 × 480 (480p)' },
  { value: 'custom', label: 'Custom…' },
];

export const FRAME_RATE_PRESET_OPTIONS: readonly { value: ExportFrameRatePreset; label: string }[] = [
  { value: 'sequence', label: 'Match sequence' },
  { value: '23.976', label: '23.976 fps' },
  { value: '24', label: '24 fps' },
  { value: '25', label: '25 fps' },
  { value: '29.97', label: '29.97 fps' },
  { value: '30', label: '30 fps' },
  { value: '50', label: '50 fps' },
  { value: '59.94', label: '59.94 fps' },
  { value: '60', label: '60 fps' },
];
