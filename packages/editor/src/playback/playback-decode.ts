import { type PlaybackDecodeScale } from '../state/ui-store';

export function playbackDecodeFactor(scale: PlaybackDecodeScale): number {
  return Number(scale);
}

/** Internal decode resolution for a `<video>` (reduces decoder / compositor cost). */
export function videoDecodeDimensions(
  mediaWidth: number,
  mediaHeight: number,
  displayWidth: number,
  displayHeight: number,
  decodeFactor: number,
): { width: number; height: number } {
  if (mediaWidth <= 0 || mediaHeight <= 0) {
    return { width: 2, height: 2 };
  }
  const byMedia = {
    w: mediaWidth * decodeFactor,
    h: mediaHeight * decodeFactor,
  };
  const byDisplay = {
    w: Math.max(displayWidth, 1) * decodeFactor,
    h: Math.max(displayHeight, 1) * decodeFactor,
  };
  return {
    width: Math.max(2, Math.round(Math.min(byMedia.w, byDisplay.w))),
    height: Math.max(2, Math.round(Math.min(byMedia.h, byDisplay.h))),
  };
}
