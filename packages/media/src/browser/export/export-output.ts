import {
  frameRateToNumber,
  framesToSeconds,
  getSequenceDuration,
  isValidFrameRate,
  secondsToFrames,
  type FrameRate,
  type Sequence,
} from '@timeline/core';
import { TimelineError } from '@timeline/shared';
import { type ExportOutputSettings } from '../../types';

const MIN_DIMENSION = 16;
const MAX_DIMENSION = 7680;

export function validateExportOutput(output: ExportOutputSettings): void {
  const { width, height, frameRate } = output;
  if (!Number.isInteger(width) || width < MIN_DIMENSION || width > MAX_DIMENSION || width % 2 !== 0) {
    throw new TimelineError('INVALID_ARGUMENT', `Export width must be an even integer between ${MIN_DIMENSION} and ${MAX_DIMENSION}.`);
  }
  if (!Number.isInteger(height) || height < MIN_DIMENSION || height > MAX_DIMENSION || height % 2 !== 0) {
    throw new TimelineError('INVALID_ARGUMENT', `Export height must be an even integer between ${MIN_DIMENSION} and ${MAX_DIMENSION}.`);
  }
  if (!isValidFrameRate(frameRate) || frameRateToNumber(frameRate) <= 0) {
    throw new TimelineError('INVALID_ARGUMENT', 'Export frame rate is invalid.');
  }
}

/** Whole output frames for the sequence duration at the chosen frame rate. */
export function getExportFrameCount(sequence: Sequence, frameRate: FrameRate): number {
  const durationSeconds = framesToSeconds(getSequenceDuration(sequence), sequence.frameRate);
  if (durationSeconds <= 0) return 0;
  return Math.max(1, secondsToFrames(durationSeconds, frameRate, 'ceil'));
}

/** Maps an output frame index to the corresponding sequence frame for compositing. */
export function sequenceFrameForOutputFrame(
  outputFrame: number,
  outputFrameRate: FrameRate,
  sequence: Sequence,
): number {
  const t = outputFrame / frameRateToNumber(outputFrameRate);
  const seqFrame = secondsToFrames(t, sequence.frameRate, 'floor');
  const max = Math.max(0, getSequenceDuration(sequence) - 1);
  return Math.min(Math.max(0, seqFrame), max);
}
