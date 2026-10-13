import { ok } from '@timeline/shared';
import { FRAME_MAX_DIMENSION, FRAME_MIN_DIMENSION } from '../model/sequence-frame';
import { type Project, type SequenceId } from '../model/types';
import { type EditResult, fail, updateSequence } from './common';

export interface SetSequenceResolutionInput {
  readonly sequenceId: SequenceId;
  readonly width: number;
  readonly height: number;
}

/** Changes the sequence frame. Clips stay where they are and fit inside the new frame. */
export function setSequenceResolution(project: Project, input: SetSequenceResolutionInput): EditResult {
  return updateSequence(project, input.sequenceId, (sequence) => {
    if (!isEvenFrameDimension(input.width) || !isEvenFrameDimension(input.height)) {
      return fail(
        'INVALID_ARGUMENT',
        `Sequence width and height must be even numbers from ${FRAME_MIN_DIMENSION} to ${FRAME_MAX_DIMENSION}.`,
      );
    }
    if (sequence.resolution.width === input.width && sequence.resolution.height === input.height) return ok(sequence);
    return ok({ ...sequence, resolution: { width: input.width, height: input.height } });
  });
}

function isEvenFrameDimension(value: number): boolean {
  return Number.isInteger(value) && value >= FRAME_MIN_DIMENSION && value <= FRAME_MAX_DIMENSION && value % 2 === 0;
}
