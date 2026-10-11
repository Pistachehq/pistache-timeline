import { env, pipeline } from '@huggingface/transformers';
import { type SpeechLanguage } from '@timeline/core';
import ortMjs from '../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs?url';
import ortWasm from '../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import { type SpeechEvent, type SpeechJob } from './speech-messages';

const MODELS: Record<SpeechLanguage, string> = {
  en: 'Xenova/mms-tts-eng',
  es: 'Xenova/mms-tts-spa',
};

const MAX_CHARS = 240;
const GAP_SECONDS = 0.08;

interface SpeechOutput {
  readonly audio: Float32Array;
  readonly sampling_rate: number;
}

interface SpeechSynth {
  (text: string): Promise<SpeechOutput>;
}

interface WorkerScope {
  postMessage(message: SpeechEvent, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<SpeechJob>) => void): void;
}

const scope = self as unknown as WorkerScope;
const models = new Map<SpeechLanguage, Promise<SpeechSynth>>();
let reportProgress: (info: { status: string; file?: string; loaded?: number; total?: number; progress?: number }) => void = () => {};
const downloads = new Map<string, { loaded: number; total: number }>();

function configureRuntime(): void {
  env.allowLocalModels = false;
  const wasm = env.backends.onnx.wasm;
  if (!wasm) return;
  wasm.numThreads = 1;
  wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm };
}

function loadModel(language: SpeechLanguage): Promise<SpeechSynth> {
  const cached = models.get(language);
  if (cached) return cached;
  configureRuntime();
  const pending = pipeline('text-to-speech', MODELS[language], {
    device: 'wasm',
    progress_callback: (info) => reportProgress(info),
  }).then((synthesizer) => synthesizer as unknown as SpeechSynth);
  const guarded = pending.catch((error: unknown) => {
    models.delete(language);
    throw error;
  });
  models.set(language, guarded);
  return guarded;
}

function progressMessage(
  language: SpeechLanguage,
  info: { status: string; file?: string; loaded?: number; total?: number; progress?: number },
): string | null {
  const voice = language === 'es' ? 'Spanish voice' : 'English voice';
  if (info.status === 'progress' && info.file && info.total && info.total > 0) {
    downloads.set(info.file, { loaded: info.loaded ?? 0, total: info.total });
    let loaded = 0;
    let total = 0;
    for (const file of downloads.values()) {
      loaded += file.loaded;
      total += file.total;
    }
    const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    if (percent >= 100) return 'Speaking…';
    return `Downloading ${voice}… ${percent}%`;
  }
  if (info.status === 'initiate' || info.status === 'download' || info.status === 'progress') {
    return `Downloading ${voice}…`;
  }
  if (info.status === 'ready' || info.status === 'done') return 'Speaking…';
  return null;
}

function piecesOf(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= MAX_CHARS) return [clean];
  const sentences = clean.split(/(?<=[.!?…])\s+/);
  const pieces: string[] = [];
  let buffer = '';
  for (const sentence of sentences) {
    const next = buffer ? `${buffer} ${sentence}` : sentence;
    if (next.length > MAX_CHARS && buffer) {
      pieces.push(buffer);
      buffer = sentence;
    } else {
      buffer = next;
    }
  }
  if (buffer) pieces.push(buffer);
  return pieces.length > 0 ? pieces : [clean.slice(0, MAX_CHARS)];
}

function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const length = Math.max(1, Math.round((samples.length * toRate) / fromRate));
  const next = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const at = (i * fromRate) / toRate;
    const index = Math.floor(at);
    const frac = at - index;
    const a = samples[index] ?? 0;
    const b = samples[Math.min(samples.length - 1, index + 1)] ?? a;
    next[i] = a + (b - a) * frac;
  }
  return next;
}

async function synthesize(text: string, language: SpeechLanguage): Promise<{ samples: Float32Array; sampleRate: number }> {
  const synth = await loadModel(language);
  const pieces = piecesOf(text);
  let sampleRate = 16_000;
  const parts: Float32Array[] = [];
  for (const piece of pieces) {
    const output = await synth(piece);
    const rate = output.sampling_rate > 0 ? output.sampling_rate : sampleRate;
    if (parts.length === 0) sampleRate = rate;
    const audio = resample(output.audio, rate, sampleRate);
    if (parts.length > 0) parts.push(new Float32Array(Math.round(GAP_SECONDS * sampleRate)));
    parts.push(audio);
  }
  let length = 0;
  for (const part of parts) length += part.length;
  const samples = new Float32Array(Math.max(1, length));
  let offset = 0;
  for (const part of parts) {
    samples.set(part, offset);
    offset += part.length;
  }
  return { samples, sampleRate };
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/fetch|network|offline|failed to load|httperror|status code/i.test(message)) {
    return 'Could not download the voice. Check your connection and try again.';
  }
  return 'Could not speak this text.';
}

let chain: Promise<void> = Promise.resolve();

scope.addEventListener('message', (event) => {
  const job = event.data;
  if (!job || typeof job.id !== 'number') return;
  chain = chain
    .then(async () => {
      reportProgress = (info) => {
        const message = progressMessage(job.language, info);
        if (message) scope.postMessage({ id: job.id, type: 'progress', message });
      };
      scope.postMessage({ id: job.id, type: 'progress', message: 'Speaking…' });
      const spoken = await synthesize(job.text, job.language);
      scope.postMessage(
        { id: job.id, type: 'result', samples: spoken.samples, sampleRate: spoken.sampleRate },
        [spoken.samples.buffer],
      );
    })
    .catch((error: unknown) => {
      scope.postMessage({ id: job.id, type: 'error', message: friendlyError(error) });
    });
});
