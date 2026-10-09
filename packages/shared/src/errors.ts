export const ErrorCode = {
  InvalidArgument: 'INVALID_ARGUMENT',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  Locked: 'LOCKED',
  InvalidProject: 'INVALID_PROJECT',
  UnsupportedVersion: 'UNSUPPORTED_VERSION',
  UnsupportedMedia: 'UNSUPPORTED_MEDIA',
  MediaUnavailable: 'MEDIA_UNAVAILABLE',
  NotImplemented: 'NOT_IMPLEMENTED',
  Aborted: 'ABORTED',
  Io: 'IO',
  Unknown: 'UNKNOWN',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Base error type for all domain errors raised by Timeline packages. */
export class TimelineError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TimelineError';
    this.code = code;
  }
}

export function isTimelineError(value: unknown): value is TimelineError {
  return value instanceof TimelineError;
}

export function isAbortError(value: unknown): boolean {
  return (
    (value instanceof TimelineError && value.code === ErrorCode.Aborted) ||
    (value instanceof Error && value.name === 'AbortError')
  );
}

/** Minimal structural view of `AbortSignal`, usable without DOM typings. */
export interface CancellationSignal {
  readonly aborted: boolean;
}

export function throwIfAborted(signal: CancellationSignal | undefined): void {
  if (signal?.aborted) {
    throw new TimelineError(ErrorCode.Aborted, 'The operation was cancelled.');
  }
}

/** Extracts a human readable message from any thrown value. */
export function toErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  return 'An unknown error occurred.';
}
