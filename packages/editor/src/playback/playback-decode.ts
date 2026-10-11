import { type PlaybackDecodeScale } from '../state/ui-store';

export function playbackDecodeFactor(scale: PlaybackDecodeScale): number {
  return Number(scale);
}

function letterboxMediaSize(
  frameWidth: number,
  frameHeight: number,
  mediaWidth: number,
  mediaHeight: number,
): { readonly width: number; readonly height: number } {
  if (frameWidth <= 0 || frameHeight <= 0 || mediaWidth <= 0 || mediaHeight <= 0) {
    return { width: frameWidth, height: frameHeight };
  }
  const fit = Math.min(frameWidth / mediaWidth, frameHeight / mediaHeight);
  return { width: mediaWidth * fit, height: mediaHeight * fit };
}

/**
 * Preview size in sequence pixels × `decodeFactor` (Program preview quality).
 * Half, quarter, and eighth draw the Program monitor smaller and scale it up.
 */
export function programVideoDecodeSize(
  sequenceWidth: number,
  sequenceHeight: number,
  mediaWidth: number,
  mediaHeight: number,
  decodeFactor: number,
): { width: number; height: number } {
  const frameW = Math.max(1, sequenceWidth);
  const frameH = Math.max(1, sequenceHeight);
  const box =
    mediaWidth > 0 && mediaHeight > 0
      ? letterboxMediaSize(frameW, frameH, mediaWidth, mediaHeight)
      : { width: frameW, height: frameH };
  return {
    width: Math.max(2, Math.round(box.width * decodeFactor)),
    height: Math.max(2, Math.round(box.height * decodeFactor)),
  };
}
