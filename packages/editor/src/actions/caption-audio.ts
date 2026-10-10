import {
  assignSpeechText,
  captionCuesForClip,
  captionPhrasesFromTranscript,
  phrasesHeardInSpeech,
  speechPhrases,
  type CaptionCue,
  type Clip,
  type FrameRate,
  framesToSeconds,
  type SpeechPhrase,
} from '@timeline/core';
import { type CaptionLanguage } from './transcribe-messages';
import { transcribeSpeech } from './transcribe-speech';

export interface CaptionAnalysis {
  readonly cues: readonly CaptionCue[];
  /** True when the transcript produced caption text. */
  readonly heard: boolean;
}

const SPEECH_RATE = 16_000;

function monoRange(buffer: AudioBuffer, startFrame: number, endFrame: number): Float32Array {
  const length = Math.max(0, endFrame - startFrame);
  const mixed = new Float32Array(length);
  const channels = buffer.numberOfChannels;
  for (let channel = 0; channel < channels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) mixed[i] = (mixed[i] ?? 0) + (data[startFrame + i] ?? 0) / channels;
  }
  return mixed;
}

function sliceBuffer(buffer: AudioBuffer, startFrame: number, endFrame: number): AudioBuffer {
  const length = Math.max(1, endFrame - startFrame);
  const sliced = new AudioBuffer({
    length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    sliced.getChannelData(channel).set(buffer.getChannelData(channel).subarray(startFrame, startFrame + length));
  }
  return sliced;
}

async function resampleSpeech(buffer: AudioBuffer, startFrame: number, endFrame: number): Promise<Float32Array> {
  const length = Math.max(1, endFrame - startFrame);
  const duration = length / buffer.sampleRate;
  const outLength = Math.max(1, Math.ceil(duration * SPEECH_RATE));
  const offline = new OfflineAudioContext(1, outLength, SPEECH_RATE);
  const source = offline.createBufferSource();
  source.buffer = sliceBuffer(buffer, startFrame, endFrame);
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return new Float32Array(rendered.getChannelData(0));
}

function phrasesOrWholeClip(samples: Float32Array, sampleRate: number, duration: number): SpeechPhrase[] {
  const phrases = speechPhrases(samples, sampleRate);
  if (phrases.length > 0) return phrases;
  let energy = 0;
  const step = Math.max(1, Math.floor(samples.length / 4000));
  let count = 0;
  for (let i = 0; i < samples.length; i += step) {
    const sample = samples[i] ?? 0;
    energy += sample * sample;
    count += 1;
  }
  if (count === 0 || energy / count < 1e-6 || duration < 0.2) return [];
  return [{ start: 0, end: duration }];
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(message));
      },
    );
  });
}

async function readBytes(url: string, signal: AbortSignal, onStatus: (message: string) => void): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Could not read this audio.');
  const body = response.body;
  if (!body) return response.arrayBuffer();
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    if (!step.value) continue;
    chunks.push(step.value);
    loaded += step.value.byteLength;
    if (total > 0) onStatus(`Reading audio… ${Math.min(99, Math.round((loaded / total) * 100))}%`);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

/** Reads the clip's audio, finds speech, and turns it into timeline caption cues. */
export async function analyzeClipAudio(
  clip: Clip,
  url: string,
  rate: FrameRate,
  signal: AbortSignal,
  onStatus: (message: string) => void,
  language: CaptionLanguage,
): Promise<CaptionAnalysis | null> {
  onStatus('Reading audio…');
  const bytes = await readBytes(url, signal, onStatus);
  if (signal.aborted) return null;
  onStatus('Decoding audio…');
  const context = new OfflineAudioContext(1, 1, SPEECH_RATE);
  const decoded = await withTimeout(context.decodeAudioData(bytes.slice(0)), 60_000, 'Could not decode this audio.');
  if (signal.aborted) return null;

  const inSec = Math.max(0, framesToSeconds(clip.sourceIn, rate));
  const outSec = Math.min(decoded.duration, Math.max(inSec, framesToSeconds(clip.sourceOut, rate)));
  const startFrame = Math.min(decoded.length, Math.floor(inSec * decoded.sampleRate));
  const endFrame = Math.min(decoded.length, Math.ceil(outSec * decoded.sampleRate));
  const duration = Math.max(0, (endFrame - startFrame) / decoded.sampleRate);
  const samples = monoRange(decoded, startFrame, endFrame);
  const phrases = phrasesOrWholeClip(samples, decoded.sampleRate, duration);
  if (phrases.length === 0) return { cues: [], heard: false };

  onStatus('Preparing audio…');
  let transcript: { text: string; chunks: readonly { text: string; start: number; end: number }[] };
  try {
    transcript = await transcribeSpeech(await resampleSpeech(decoded, startFrame, endFrame), language, signal, onStatus);
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return null;
    throw error;
  }
  if (signal.aborted) return null;

  const timed =
    transcript.chunks.length > 0
      ? phrasesHeardInSpeech(captionPhrasesFromTranscript(transcript.chunks), phrases)
      : assignSpeechText(phrases, transcript.text);
  const spoken = timed.filter((phrase) => phrase.text.trim().length > 0);
  if (spoken.length === 0) throw new Error('Could not transcribe this audio.');
  const cues = captionCuesForClip(clip, spoken, rate);
  if (cues.length === 0) throw new Error('Could not transcribe this audio.');
  return { cues, heard: true };
}
