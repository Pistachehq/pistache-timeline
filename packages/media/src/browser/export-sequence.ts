import { type MediaSourceRef } from '@timeline/core';
import { TimelineError, throwIfAborted } from '@timeline/shared';
import { type ExportOptions, type ExportRequest, type ExportResult, type MediaHandle } from '../types';
import { exportSequenceToWebm } from './export/export-sequence-webm';
import { isWebCodecsExportSupported } from './export/support';

export interface BrowserSequenceExporter {
  resolve(source: MediaSourceRef): Promise<MediaHandle | null>;
}

export function browserExportSupported(): boolean {
  return typeof document !== 'undefined' && isWebCodecsExportSupported();
}

export async function exportBrowserSequence(
  request: ExportRequest,
  exporter: BrowserSequenceExporter,
  options: ExportOptions = {},
): Promise<ExportResult> {
  throwIfAborted(options.signal);
  if (!browserExportSupported()) {
    throw new TimelineError(
      'NOT_IMPLEMENTED',
      'Exporting requires WebCodecs (VP9) support in this browser. Try the latest Chrome or Edge.',
    );
  }
  return exportSequenceToWebm(request, exporter, options);
}
