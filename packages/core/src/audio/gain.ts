import { type Clip, type ClipAudio } from '../model/types';
import { AUDIO_DB_FLOOR } from '../model/defaults';

/** Converts UI volume percent to decibels (100% = 0 dB, no upper cap). */
export function volumePercentToDb(percent: number): number {
  if (percent <= 0) return AUDIO_DB_FLOOR;
  return 20 * Math.log10(percent / 100);
}

/** Converts dB to volume percent (100% = 0 dB). */
export function volumeDbToPercent(db: number): number {
  if (!Number.isFinite(db) || db <= AUDIO_DB_FLOOR - 0.001) return 0;
  return Math.max(0, 100 * 10 ** (db / 20));
}

export function formatVolumeDb(db: number): string {
  if (db <= AUDIO_DB_FLOOR + 0.05) return '−∞ dB';
  const sign = db >= 0 ? '+' : '−';
  return `${sign}${Math.abs(db).toFixed(1)} dB`;
}

/** Constant-power stereo pan: `pan` −100 (full left) … 100 (full right). */
export function applyStereoPan(left: number, right: number, pan: number, linearGain: number): [number, number] {
  const t = (pan + 100) / 200;
  const lGain = Math.cos((t * Math.PI) / 2) * linearGain;
  const rGain = Math.sin((t * Math.PI) / 2) * linearGain;
  return [left * lGain, right * rGain];
}

/** Linear gain (0–1) from clip volume and mute. */
export function clipLinearGain(audio: ClipAudio): number {
  if (audio.muted || audio.volume <= 0) return 0;
  return audio.volume / 100;
}

/** Linear gain from audio track volume and mute. */
export function trackLinearGain(volume: number, muted: boolean): number {
  if (muted || volume <= 0) return 0;
  return volume / 100;
}

/** Combined linear gain for an audio-track clip (clip × track). */
export function combinedClipTrackLinearGain(audio: ClipAudio, trackVolume: number, trackMuted: boolean): number {
  return clipLinearGain(audio) * trackLinearGain(trackVolume, trackMuted);
}

/** Combined linear gain for playback/export (clip only, e.g. embedded program audio). */
export function effectiveClipLinearGain(clip: Clip): number {
  return clipLinearGain(clip.audio);
}

/** Waveform display uses a tighter floor than clip gain so peaks fill the lane. */
export const WAVEFORM_DISPLAY_DB_FLOOR = -24;

/**
 * Maps a normalized peak amplitude (0…1) plus fader gain to bar height (0…1).
 * Log shape for quiet detail; gain scales linearly (matches fader, not double-log).
 */
export function waveformSampleToHeight(normalizedAmplitude: number, gainLinear: number): number {
  if (gainLinear <= 0 || normalizedAmplitude <= 0) return 0;
  const abs = Math.min(1, normalizedAmplitude);
  if (abs < 1e-6) return 0;
  const sampleDb = 20 * Math.log10(abs);
  if (sampleDb <= WAVEFORM_DISPLAY_DB_FLOOR) return 0;
  const shape = (sampleDb - WAVEFORM_DISPLAY_DB_FLOOR) / -WAVEFORM_DISPLAY_DB_FLOOR;
  return Math.min(1, shape * gainLinear);
}
