/// <reference types="vite/client" />

import { type TimelineDesktopApi } from '@timeline/shared';

declare global {
  interface Window {
    readonly timelineDesktop?: TimelineDesktopApi;
  }
}

export {};
