import { describe, expect, it } from 'vitest';
import { DEFAULT_CLIP_AUDIO } from '../model/defaults';
import {
  combinedClipTrackLinearGain,
  formatVolumeDb,
  volumeDbToPercent,
  volumePercentToDb,
  waveformSampleToHeight,
} from './gain';

describe('volumePercentToDb', () => {
  it('maps 100% to 0 dB and 0% to floor', () => {
    expect(volumePercentToDb(100)).toBeCloseTo(0, 5);
    expect(volumePercentToDb(0)).toBe(-60);
  });

  it('round-trips through volumeDbToPercent', () => {
    expect(volumeDbToPercent(volumePercentToDb(50))).toBeCloseTo(50, 4);
    expect(volumeDbToPercent(-6)).toBeCloseTo(50.12, 1);
  });

  it('allows boost above 0 dB', () => {
    expect(volumePercentToDb(200)).toBeCloseTo(6.02, 1);
    expect(volumeDbToPercent(12)).toBeCloseTo(398.1, 0);
  });
});

describe('waveformSampleToHeight', () => {
  it('scales down quiet samples and mutes at zero gain', () => {
    expect(waveformSampleToHeight(0.5, 0)).toBe(0);
    const loud = waveformSampleToHeight(1, 1);
    const quiet = waveformSampleToHeight(0.02, 1);
    expect(loud).toBeGreaterThan(quiet);
    expect(waveformSampleToHeight(0.5, 0.5)).toBeLessThan(waveformSampleToHeight(0.5, 1));
  });
});

describe('combinedClipTrackLinearGain', () => {
  it('multiplies clip and track faders', () => {
    expect(combinedClipTrackLinearGain({ ...DEFAULT_CLIP_AUDIO, volume: 50 }, 100, false)).toBe(0.5);
    expect(combinedClipTrackLinearGain(DEFAULT_CLIP_AUDIO, 50, false)).toBe(0.5);
  });
});

describe('formatVolumeDb', () => {
  it('formats silence and negative values', () => {
    expect(formatVolumeDb(-60)).toBe('−∞ dB');
    expect(formatVolumeDb(-6)).toBe('−6.0 dB');
    expect(formatVolumeDb(6)).toBe('+6.0 dB');
  });
});
