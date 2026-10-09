import { TimelineError } from '@timeline/shared';

/** Prepares a detached media element for metadata or frame access. */
export function createProbeElement<K extends 'video' | 'audio'>(tag: K, url: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.preload = 'auto';
  element.muted = true;
  // Required so frames from custom protocols can be drawn to a canvas.
  if (!url.startsWith('blob:')) element.crossOrigin = 'anonymous';
  element.src = url;
  return element;
}

/** Detaches the source so the browser can free decoder resources immediately. */
export function releaseMediaElement(element: HTMLMediaElement): void {
  element.pause();
  element.removeAttribute('src');
  element.load();
}

/**
 * Resolves when `event` fires on the element. Rejects on media errors,
 * timeout or abort.
 */
export function waitForMediaEvent(
  element: HTMLMediaElement,
  event: keyof HTMLMediaElementEventMap,
  { timeoutMs = 15_000, signal }: { timeoutMs?: number; signal?: AbortSignal | undefined } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      element.removeEventListener(event, onEvent);
      element.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      const message = element.error?.message ?? 'The media could not be decoded by this browser.';
      reject(new TimelineError('UNSUPPORTED_MEDIA', message));
    };
    const onAbort = () => {
      cleanup();
      reject(new TimelineError('ABORTED', 'The operation was cancelled.'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new TimelineError('MEDIA_UNAVAILABLE', 'Timed out while loading media.'));
    }, timeoutMs);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    element.addEventListener(event, onEvent, { once: true });
    element.addEventListener('error', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
