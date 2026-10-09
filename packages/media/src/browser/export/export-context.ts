import { type MediaSourceRef } from '@timeline/core';
import { type MediaHandle } from '../../types';

export interface BrowserExportContext {
  resolve(source: MediaSourceRef): Promise<MediaHandle | null>;
}
