import { type SpeechLanguage } from '@timeline/core';
import { type SpeechEvent, type SpeechJob } from './speech-messages';

interface SpeechWorker {
  postMessage(message: SpeechJob): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<SpeechEvent>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<SpeechEvent>) => void): void;
  addEventListener(type: 'error', listener: (event: Event) => void): void;
  removeEventListener(type: 'error', listener: (event: Event) => void): void;
  terminate(): void;
}

let worker: SpeechWorker | null = null;
let nextId = 0;

function speechWorker(): SpeechWorker {
  if (!worker) {
    worker = new Worker(new URL('./speech-worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

function dropWorker(current: SpeechWorker): void {
  current.terminate();
  if (worker === current) worker = null;
}

/** Speaks text with the on-device voice. The model stays loaded for the next line. */
export function speakText(
  text: string,
  language: SpeechLanguage,
  signal: AbortSignal,
  onStatus: (message: string) => void,
): Promise<{ readonly samples: Float32Array; readonly sampleRate: number }> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  const current = speechWorker();
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    let lastBeat = Date.now();
    let lastDownload = '';
    let lastDownloadAt = Date.now();
    const finish = (run: () => void) => {
      window.clearInterval(watch);
      current.removeEventListener('message', onMessage);
      current.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
      run();
    };
    const fail = (message: string, drop: boolean) => {
      if (drop) dropWorker(current);
      finish(() => reject(new Error(message)));
    };
    const watch = window.setInterval(() => {
      const now = Date.now();
      if (now - lastBeat > 90_000) fail('The voice stopped responding. Try again.', true);
      else if (lastDownload.startsWith('Downloading') && now - lastDownloadAt > 90_000) {
        fail('The voice download stalled. Check your connection and try again.', true);
      }
    }, 2000);
    const onMessage = (event: MessageEvent<SpeechEvent>) => {
      const data = event.data;
      if (!data || data.id !== id) return;
      lastBeat = Date.now();
      if (data.type === 'progress') {
        if (data.message.startsWith('Downloading') && data.message !== lastDownload) {
          lastDownload = data.message;
          lastDownloadAt = Date.now();
        }
        onStatus(data.message);
      } else if (data.type === 'result') finish(() => resolve({ samples: data.samples, sampleRate: data.sampleRate }));
      else finish(() => reject(new Error(data.message)));
    };
    const onError = () => fail('Could not speak this text.', true);
    const onAbort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')));
    current.addEventListener('message', onMessage);
    current.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort);
    current.postMessage({ id, text, language });
  });
}
