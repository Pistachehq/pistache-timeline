export * from './types';
export * from './media-kind';
export * from './export';

export { createWebMediaEngine, type WebMediaEngineOptions } from './browser/web-media-engine';
export { MediaElementPlayer } from './browser/media-element-player';
export { probeWithMediaElement } from './browser/probe';
export { captureVideoThumbnail } from './browser/thumbnail';
export {
  buildWaveformFromHandle,
  computeWaveformPeaks,
  DEFAULT_WAVEFORM_BUCKETS,
  type WaveformPeaks,
} from './browser/waveform';

export { createDesktopMediaEngine, type DesktopMediaBridge } from './desktop/desktop-media-engine';
