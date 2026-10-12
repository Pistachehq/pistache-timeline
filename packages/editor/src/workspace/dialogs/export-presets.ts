import { FrameRates, frameRatesEqual, type FrameRate, type Sequence } from '@timeline/core';
import { type ExportOutputSettings } from '@timeline/media';

export type ExportResolutionPreset =
  | 'sequence'
  | '3840x2160'
  | '2560x1440'
  | '1920x1080'
  | '1280x720'
  | '854x480'
  | '1080x1920'
  | '1080x1350'
  | '1080x1080'
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

export const EXPORT_MIN_DIMENSION = 16;
export const EXPORT_MAX_DIMENSION = 7680;

const RESOLUTIONS: Record<Exclude<ExportResolutionPreset, 'sequence' | 'custom'>, { width: number; height: number }> = {
  '3840x2160': { width: 3840, height: 2160 },
  '2560x1440': { width: 2560, height: 1440 },
  '1920x1080': { width: 1920, height: 1080 },
  '1280x720': { width: 1280, height: 720 },
  '854x480': { width: 854, height: 480 },
  '1080x1920': { width: 1080, height: 1920 },
  '1080x1350': { width: 1080, height: 1350 },
  '1080x1080': { width: 1080, height: 1080 },
};

/** Even pixel size the encoder accepts. */
export function snapExportDimension(value: number): number {
  if (!Number.isFinite(value)) return EXPORT_MIN_DIMENSION;
  const even = Math.round(value / 2) * 2;
  return Math.min(EXPORT_MAX_DIMENSION, Math.max(EXPORT_MIN_DIMENSION, even));
}

/** The other side of a locked resize, before it is clamped for the encoder. `aspect` is width / height. */
export function previewLinkedDimension(value: number, aspect: number, changed: 'width' | 'height'): number {
  if (!(aspect > 0) || !Number.isFinite(value)) return Number.isFinite(value) ? value : EXPORT_MIN_DIMENSION;
  const other = changed === 'width' ? value / aspect : value * aspect;
  if (!Number.isFinite(other)) return EXPORT_MIN_DIMENSION;
  return Math.max(0, Math.round(other));
}

/**
 * The other side of a locked resize. `aspect` is width / height.
 * The result is snapped to an even pixel count the encoder accepts.
 */
export function linkedExportDimension(value: number, aspect: number, changed: 'width' | 'height'): number {
  return snapExportDimension(previewLinkedDimension(value, aspect, changed));
}

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

export function resolutionForPreset(
  sequence: Sequence,
  preset: ExportResolutionPreset,
): { width: number; height: number } {
  if (preset === 'sequence' || preset === 'custom') {
    return { width: sequence.resolution.width, height: sequence.resolution.height };
  }
  return RESOLUTIONS[preset];
}

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
    width = snapExportDimension(customWidth);
    height = snapExportDimension(customHeight);
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
  { value: '2560x1440', label: '2560 × 1440 (1440p)' },
  { value: '1920x1080', label: '1920 × 1080 (1080p)' },
  { value: '1280x720', label: '1280 × 720 (720p)' },
  { value: '854x480', label: '854 × 480 (480p)' },
  { value: '1080x1920', label: '1080 × 1920 (Vertical)' },
  { value: '1080x1350', label: '1080 × 1350 (Portrait)' },
  { value: '1080x1080', label: '1080 × 1080 (Square)' },
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
