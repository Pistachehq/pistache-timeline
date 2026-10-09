import { type FrameRate } from './rational';

/** How the editor shows frame positions in the UI. */
export type TimeDisplayFormat = 'timecode' | 'frames';

/** Nominal integer frames-per-second used for non-drop-frame timecode. */
export function timecodeBase(rate: FrameRate): number {
  return Math.max(1, Math.round(rate.numerator / rate.denominator));
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/**
 * Formats a frame number as non-drop-frame SMPTE timecode `HH:MM:SS:FF`.
 * For fractional rates (e.g. 29.97) the nominal integer rate is used, which
 * is the standard NDF behaviour. Drop-frame timecode is not supported yet.
 */
export function formatTimecode(frame: number, rate: FrameRate): string {
  const base = timecodeBase(rate);
  const total = Math.max(0, Math.floor(frame));
  const frames = total % base;
  const totalSeconds = Math.floor(total / base);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames, String(base - 1).length)}`;
}

/** Frame index as a plain integer (editor “frames” display mode). */
export function formatFrameNumber(frame: number): string {
  return String(Math.max(0, Math.floor(frame)));
}

/** Formats a frame position for the UI using timecode or raw frame numbers. */
export function formatDisplayTime(frame: number, rate: FrameRate, format: TimeDisplayFormat): string {
  if (format === 'frames') return formatFrameNumber(frame);
  return formatTimecode(frame, rate);
}

/**
 * Parses `HH:MM:SS:FF`, `MM:SS:FF`, `SS:FF` or a plain frame count.
 * Returns `null` when the text is not a valid timecode for the rate.
 */
export function parseTimecode(text: string, rate: FrameRate): number | null {
  const trimmed = text.trim();
  if (!/^\d+([:;.]\d+){0,3}$/.test(trimmed)) return null;
  const parts = trimmed.split(/[:;.]/).map(Number);
  const base = timecodeBase(rate);
  const frames = parts.pop() ?? 0;
  if (parts.length > 0 && frames >= base) return null;
  const [seconds = 0, minutes = 0, hours = 0] = parts.reverse();
  if (parts.length > 1 && seconds >= 60) return null;
  if (parts.length > 2 && minutes >= 60) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * base + frames;
}
