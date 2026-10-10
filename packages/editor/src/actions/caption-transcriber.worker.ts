import { env, pipeline, Tensor, type AutomaticSpeechRecognitionOutput, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { spokenLanguage } from '@timeline/core';
import ortMjs from '../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs?url';
import ortWasm from '../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import { type TranscribeEvent, type TranscribeJob, type TranscriptPiece } from './transcribe-messages';

const MODEL = 'Xenova/whisper-small';
const SAMPLE_RATE = 16_000;
const WINDOW_SAMPLES = SAMPLE_RATE * 30;

interface WorkerScope {
  postMessage(message: TranscribeEvent): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<TranscribeJob>) => void): void;
}

const scope = self as unknown as WorkerScope;

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
let reportProgress: (info: { status: string; file?: string; loaded?: number; total?: number; progress?: number }) => void = () => {};
const downloads = new Map<string, { loaded: number; total: number }>();

function configureRuntime(): void {
  env.allowLocalModels = false;
  const wasm = env.backends.onnx.wasm;
  if (!wasm) return;
  wasm.numThreads = 1;
  wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm };
}

function loadModel(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    configureRuntime();
    const pending = pipeline('automatic-speech-recognition', MODEL, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (info) => reportProgress(info),
    });
    transcriberPromise = pending.catch((error: unknown) => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
}

function progressMessage(info: { status: string; file?: string; loaded?: number; total?: number; progress?: number }): string | null {
  if (info.status === 'progress' && info.file && info.total && info.total > 0) {
    downloads.set(info.file, { loaded: info.loaded ?? 0, total: info.total });
    let loaded = 0;
    let total = 0;
    for (const file of downloads.values()) {
      loaded += file.loaded;
      total += file.total;
    }
    const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    if (percent >= 100) return 'Starting speech model…';
    return `Downloading speech model… ${percent}%`;
  }
  if (info.status === 'initiate' || info.status === 'download' || info.status === 'progress') return 'Downloading speech model…';
  if (info.status === 'done' && info.progress === 100) return 'Starting speech model…';
  if (info.status === 'ready') return 'Transcribing speech…';
  return null;
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/fetch|network|offline|failed to load|httperror|status code/i.test(message)) {
    return 'Could not download the speech model. Check your connection and try again.';
  }
  return 'Could not transcribe this audio.';
}

function piecesFrom(output: AutomaticSpeechRecognitionOutput, duration: number): TranscriptPiece[] {
  const pieces: TranscriptPiece[] = [];
  for (const chunk of output.chunks ?? []) {
    const text = chunk.text.trim();
    const start = chunk.timestamp[0];
    const end = chunk.timestamp[1];
    if (!text || !Number.isFinite(start)) continue;
    const safeEnd = typeof end === 'number' && Number.isFinite(end) ? Math.max(end, start + 0.05) : start + 0.3;
    pieces.push({ text, start, end: safeEnd });
  }
  const text = output.text.trim();
  if (pieces.length === 0 && text) pieces.push({ text, start: 0, end: Math.max(0.2, duration) });
  return pieces;
}

const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  en: 'English',
  es: 'Spanish',
};

function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

interface LanguageProbe {
  readonly model: {
    readonly generation_config: {
      readonly decoder_start_token_id?: number;
      readonly lang_to_id?: Record<string, number> | null;
    } | null;
    (inputs: { input_features: unknown; decoder_input_ids: Tensor }): Promise<{ logits?: { data: ArrayLike<number>; dims: number[] } }>;
  };
  readonly processor: (audio: Float32Array) => Promise<{ input_features: unknown }>;
}

async function detectSpokenLanguage(transcriber: AutomaticSpeechRecognitionPipeline, samples: Float32Array): Promise<string> {
  const engine = transcriber as unknown as LanguageProbe;
  const config = engine.model.generation_config;
  const languages = config?.lang_to_id;
  const start = config?.decoder_start_token_id;
  if (!languages || start == null) return 'en';
  const features = await engine.processor(samples.slice(0, Math.min(samples.length, WINDOW_SAMPLES)));
  const output = await engine.model({
    input_features: features.input_features,
    decoder_input_ids: new Tensor('int64', BigInt64Array.from([BigInt(start)]), [1, 1]),
  });
  const logits = output.logits;
  if (!logits) return 'en';
  const vocab = logits.dims[logits.dims.length - 1] ?? logits.data.length;
  const offset = Math.max(0, logits.data.length - vocab);
  return spokenLanguage(Array.from(logits.data).slice(offset), languages);
}

async function recognizeSlice(
  transcriber: AutomaticSpeechRecognitionPipeline,
  samples: Float32Array,
  language: string,
): Promise<AutomaticSpeechRecognitionOutput> {
  const output = await transcriber(samples, { return_timestamps: true, task: 'transcribe', language });
  return Array.isArray(output) ? (output[0] ?? { text: '' }) : output;
}

async function transcribeJob(job: TranscribeJob): Promise<void> {
  let phase = 'Preparing speech model…';
  reportProgress = (info) => {
    const message = progressMessage(info);
    if (message) phase = message;
  };
  const beat = setInterval(() => {
    scope.postMessage({ type: 'progress', id: job.id, message: phase });
  }, 2000);
  try {
    scope.postMessage({ type: 'progress', id: job.id, message: phase });
    const transcriber = await loadModel();
    let language: string = job.language === 'auto' ? 'en' : job.language;
    if (job.language === 'auto') {
      phase = 'Detecting language…';
      scope.postMessage({ type: 'progress', id: job.id, message: phase });
      try {
        language = await detectSpokenLanguage(transcriber, job.samples);
      } catch {
        scope.postMessage({
          type: 'error',
          id: job.id,
          message: 'Could not detect the language. Choose English or Spanish and try again.',
        });
        return;
      }
    }
    const pieces: TranscriptPiece[] = [];
    const total = job.samples.length;
    let offset = 0;
    let windowIndex = 0;
    const windows = Math.max(1, Math.ceil(total / WINDOW_SAMPLES));
    while (offset < total) {
      const end = Math.min(total, offset + WINDOW_SAMPLES);
      const slice = job.samples.slice(offset, end);
      phase = `Transcribing ${languageName(language)}… ${Math.round((windowIndex / windows) * 100)}%`;
      scope.postMessage({ type: 'progress', id: job.id, message: phase });
      const output = await recognizeSlice(transcriber, slice, language);
      const shift = offset / SAMPLE_RATE;
      for (const piece of piecesFrom(output, slice.length / SAMPLE_RATE)) {
        pieces.push({ text: piece.text, start: piece.start + shift, end: piece.end + shift });
      }
      windowIndex += 1;
      offset = end;
    }
    const text = pieces
      .map((piece) => piece.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    scope.postMessage({ type: 'result', id: job.id, text, chunks: pieces });
  } catch (error) {
    scope.postMessage({ type: 'error', id: job.id, message: friendlyError(error) });
  } finally {
    clearInterval(beat);
  }
}

const queue: TranscribeJob[] = [];
let draining = false;

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift();
      if (job) await transcribeJob(job);
    }
  } finally {
    draining = false;
  }
}

scope.addEventListener('message', (event) => {
  queue.push(event.data);
  void drain();
});
