import { TimelineError } from '@timeline/shared';
import { type ExportResult } from './types';

/**
 * Placeholder used by adapters until a real export pipeline exists
 * (WebCodecs muxing on the web, FFmpeg in the Electron main process).
 */
export function exportNotImplemented(platform: string): Promise<ExportResult> {
  return Promise.reject(
    new TimelineError('NOT_IMPLEMENTED', `Exporting is not available yet in the ${platform} version of Timeline.`),
  );
}
