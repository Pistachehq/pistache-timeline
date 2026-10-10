import { type CaptionLanguage, type TranscribeEvent, type TranscriptPiece } from './transcribe-messages';

interface SpeechWorker {
  postMessage(message: { id: number; samples: Float32Array; language: CaptionLanguage }, transfer: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<TranscribeEvent>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<TranscribeEvent>) => void): void;
  addEventListener(type: 'error', listener: (event: Event) => void): void;
  removeEventListener(type: 'error', listener: (event: Event) => void): void;
  terminate(): void;
}

let worker: SpeechWorker | null = null;
let nextId = 0;

function speechWorker(): SpeechWorker {
  if (!worker) {
    worker = new Worker(new URL('./caption-transcriber.worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

function dropWorker(current: SpeechWorker): void {
  current.terminate();
  if (worker === current) worker = null;
}

/** Transcribes 16 kHz mono speech. The model stays loaded for the next clip. */
export function transcribeSpeech(
  samples: Float32Array,
  language: CaptionLanguage,
  signal: AbortSignal,
  onStatus: (message: string) => void,
): Promise<{ readonly text: string; readonly chunks: readonly TranscriptPiece[] }> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  const current = speechWorker();
  const id = ++nextId;
  const copy = new Float32Array(samples);
  onStatus('Preparing speech model…');
  return new Promise((resolve, reject) => {
    let lastBeat = Date.now();
    let lastDownload = '';
    let lastDownloadAt = Date.now();
    let transcribing = false;
    const finish = (run: () => void) => {
      window.clearInterval(watch);
      current.removeEventListener('message', onMessage);
      current.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
      run();
    };
    const fail = (message: string) => {
      dropWorker(current);
      finish(() => reject(new Error(message)));
    };
    const watch = window.setInterval(() => {
      const now = Date.now();
      if (now - lastBeat > 60_000) fail('Speech model stopped responding. Try again.');
      else if (!transcribing && lastDownload.startsWith('Downloading') && now - lastDownloadAt > 90_000) {
        fail('The speech model download stalled. Check your connection and try again.');
      }
    }, 2000);
    const onMessage = (event: MessageEvent<TranscribeEvent>) => {
      const data = event.data;
      if (!data || data.id !== id) return;
      lastBeat = Date.now();
      if (data.type === 'progress') {
        if (data.message.startsWith('Transcribing')) transcribing = true;
        if (data.message.startsWith('Downloading') && data.message !== lastDownload) {
          lastDownload = data.message;
          lastDownloadAt = Date.now();
        }
        onStatus(data.message);
      } else if (data.type === 'result') finish(() => resolve({ text: data.text, chunks: data.chunks }));
      else finish(() => reject(new Error(data.message)));
    };
    const onError = () => fail('Could not transcribe this audio.');
    const onAbort = () => {
      dropWorker(current);
      finish(() => reject(new DOMException('Aborted', 'AbortError')));
    };
    current.addEventListener('message', onMessage);
    current.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort);
    current.postMessage({ id, samples: copy, language }, [copy.buffer]);
  });
}
