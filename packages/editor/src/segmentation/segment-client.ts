import { type AlphaMask, type SmartBackgroundBox, type SmartBackgroundPoint } from '@timeline/core';
import { type SegmentEvent, type SegmentJob } from './messages';

interface WorkerLike {
  postMessage(message: SegmentJob, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<SegmentEvent>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<SegmentEvent>) => void): void;
  addEventListener(type: 'error', listener: (event: Event) => void): void;
  removeEventListener(type: 'error', listener: (event: Event) => void): void;
  terminate(): void;
}

let worker: WorkerLike | null = null;
let nextId = 0;

function segmentWorker(): WorkerLike {
  if (!worker) worker = new Worker(new URL('./segment-worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

function dropWorker(current: WorkerLike): void {
  current.terminate();
  if (worker === current) worker = null;
}

function runJob<T extends SegmentEvent>(
  job: SegmentJob,
  transfer: Transferable[],
  signal: AbortSignal,
  onStatus: (message: string) => void,
): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  const current = segmentWorker();
  return new Promise((resolve, reject) => {
    let lastBeat = Date.now();
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
      if (Date.now() - lastBeat > 180_000) fail('Segmentation stopped responding. Try again.', true);
    }, 4000);
    const onMessage = (event: MessageEvent<SegmentEvent>) => {
      const data = event.data;
      if (!data || data.id !== job.id) return;
      lastBeat = Date.now();
      if (data.type === 'progress') onStatus(data.message);
      else if (data.type === 'error') finish(() => reject(new Error(data.message)));
      else finish(() => resolve(data as T));
    };
    const onError = () => fail('Could not start the segmentation worker.', true);
    const onAbort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')));
    current.addEventListener('message', onMessage);
    current.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort);
    current.postMessage(job, transfer);
  });
}

export async function segmentFrame(input: {
  readonly bitmap: ImageBitmap;
  readonly keepPrompt: string;
  readonly removePrompt: string;
  readonly points: readonly SmartBackgroundPoint[];
  readonly boxes: readonly SmartBackgroundBox[];
  readonly sourceFrame: number;
  readonly quality: 'preview' | 'final';
  readonly signal: AbortSignal;
  readonly onStatus: (message: string) => void;
}): Promise<AlphaMask> {
  const id = ++nextId;
  const points = input.points
    .filter((point) => point.sourceFrame === input.sourceFrame)
    .map((point) => ({
      x: point.u * input.bitmap.width,
      y: point.v * input.bitmap.height,
      include: point.include,
    }));
  const boxes = input.boxes
    .filter((box) => box.sourceFrame === input.sourceFrame)
    .map((box) => ({
      x: box.u * input.bitmap.width,
      y: box.v * input.bitmap.height,
      w: box.w * input.bitmap.width,
      h: box.h * input.bitmap.height,
      include: box.include,
    }));
  const result = await runJob<Extract<SegmentEvent, { type: 'mask' }>>(
    {
      type: 'segment',
      id,
      bitmap: input.bitmap,
      keepPhrases: input.keepPrompt ? [input.keepPrompt] : [],
      removePhrases: input.removePrompt ? [input.removePrompt] : [],
      points,
      boxes,
      quality: input.quality,
    },
    [input.bitmap],
    input.signal,
    input.onStatus,
  );
  return { data: result.data, width: result.width, height: result.height };
}

export async function propagateMask(input: {
  readonly prev: ImageBitmap;
  readonly next: ImageBitmap;
  readonly mask: AlphaMask;
  readonly signal: AbortSignal;
  readonly onStatus: (message: string) => void;
}): Promise<AlphaMask> {
  const id = ++nextId;
  const copy = new Uint8Array(input.mask.data);
  const result = await runJob<Extract<SegmentEvent, { type: 'mask' }>>(
    {
      type: 'propagate',
      id,
      prev: input.prev,
      next: input.next,
      mask: copy,
      maskWidth: input.mask.width,
      maskHeight: input.mask.height,
    },
    [input.prev, input.next, copy.buffer],
    input.signal,
    input.onStatus,
  );
  return { data: result.data, width: result.width, height: result.height };
}

export async function detectSubjects(
  bitmap: ImageBitmap,
  signal: AbortSignal,
  onStatus: (message: string) => void,
): Promise<readonly { u: number; v: number; w: number; h: number; label: string }[]> {
  const id = ++nextId;
  const result = await runJob<Extract<SegmentEvent, { type: 'detect' }>>(
    { type: 'detect', id, bitmap },
    [bitmap],
    signal,
    onStatus,
  );
  return result.boxes;
}
