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

export {
  PixelEffectsRenderer,
  PixelTracking,
  replacementAssetIds,
  replacementTimeSeconds,
  type PixelFrameInput,
  type PixelReplacement,
  type PixelSource,
} from './browser/effects/pixel-effects';
export {
  audioChainKey,
  buildAudioEffectChain,
  gateTargetGain,
  noiseGateOf,
  type AudioEffectChain,
} from './browser/effects/audio-chain';

export { createDesktopMediaEngine, type DesktopMediaBridge } from './desktop/desktop-media-engine';
