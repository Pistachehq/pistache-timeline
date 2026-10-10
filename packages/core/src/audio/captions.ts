import { getClipEnd } from '../model/queries';
import { clipSpeedPercent } from '../model/speed';
import { type Clip } from '../model/types';
import { type FrameRate } from '../time/rational';

export interface SpeechPhrase {
  readonly start: number;
  readonly end: number;
}

export interface TimedSpeech extends SpeechPhrase {
  readonly text: string;
}

export interface CaptionCue {
  readonly start: number;
  readonly durationFrames: number;
  readonly content: string;
}

const HOP_SECONDS = 0.02;
const HANGOVER_WINDOWS = 6;
const MIN_PHRASE_SECONDS = 0.2;
const MERGE_GAP_SECONDS = 0.28;
const MAX_PHRASE_SECONDS = 4.2;
const MAX_PHRASES = 48;
const LINE_CHARS = 42;
const LINE_CHARS_HARD = 64;
const LINE_PAUSE_SECONDS = 0.45;

function windowEnergies(samples: Float32Array, sampleRate: number): { readonly energies: number[]; readonly hop: number } {
  const win = Math.max(1, Math.round(sampleRate * HOP_SECONDS));
  const hop = win / sampleRate;
  const energies: number[] = [];
  for (let i = 0; i < samples.length; i += win) {
    let sum = 0;
    const end = Math.min(samples.length, i + win);
    for (let j = i; j < end; j++) {
      const sample = samples[j] ?? 0;
      sum += sample * sample;
    }
    energies.push(sum / (end - i));
  }
  return { energies, hop };
}

function splitLong(phrase: SpeechPhrase, energies: readonly number[], hop: number): SpeechPhrase[] {
  if (phrase.end - phrase.start <= MAX_PHRASE_SECONDS) return [phrase];
  const from = Math.floor((phrase.start + (phrase.end - phrase.start) * 0.3) / hop);
  const to = Math.ceil((phrase.start + (phrase.end - phrase.start) * 0.7) / hop);
  let quietAt = Math.floor(((phrase.start + phrase.end) / 2) / hop);
  let quiet = Number.POSITIVE_INFINITY;
  for (let i = from; i < to && i < energies.length; i++) {
    const energy = energies[i] ?? Number.POSITIVE_INFINITY;
    if (energy < quiet) {
      quiet = energy;
      quietAt = i;
    }
  }
  const cut = Math.min(phrase.end - MIN_PHRASE_SECONDS, Math.max(phrase.start + MIN_PHRASE_SECONDS, quietAt * hop));
  return [
    ...splitLong({ start: phrase.start, end: cut }, energies, hop),
    ...splitLong({ start: cut, end: phrase.end }, energies, hop),
  ];
}

/**
 * Phrases of audible speech. Silence and tiny clicks are dropped, short gaps
 * inside a sentence stay one phrase, and long stretches are split at the
 * quietest moment.
 */
export function speechPhrases(samples: Float32Array, sampleRate: number): SpeechPhrase[] {
  if (samples.length === 0 || sampleRate <= 0) return [];
  const { energies, hop } = windowEnergies(samples, sampleRate);
  if (energies.length === 0) return [];
  const sorted = [...energies].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const loud = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] ?? 0;
  if (loud < 1e-8) return [];
  const threshold = Math.min(loud * 0.35, Math.max(median * 4, loud * 0.12, 1e-7));

  const active = energies.map((energy) => energy >= threshold);
  const hung = active.slice();
  let hold = 0;
  for (let i = 0; i < active.length; i++) {
    if (active[i]) hold = HANGOVER_WINDOWS;
    else if (hold > 0) {
      hung[i] = true;
      hold -= 1;
    }
  }

  const raw: SpeechPhrase[] = [];
  let start: number | null = null;
  for (let i = 0; i <= hung.length; i++) {
    const on = i < hung.length && hung[i] === true;
    if (on && start === null) start = i * hop;
    if (!on && start !== null) {
      raw.push({ start, end: i * hop });
      start = null;
    }
  }

  const merged: SpeechPhrase[] = [];
  for (const phrase of raw) {
    if (phrase.end - phrase.start < MIN_PHRASE_SECONDS) continue;
    const previous = merged[merged.length - 1];
    if (previous && phrase.start - previous.end <= MERGE_GAP_SECONDS) {
      merged[merged.length - 1] = { start: previous.start, end: phrase.end };
    } else merged.push(phrase);
  }

  const split: SpeechPhrase[] = [];
  for (const phrase of merged) split.push(...splitLong(phrase, energies, hop));
  return split.slice(0, MAX_PHRASES);
}

/** Spreads a transcript across speech phrases, giving longer phrases more words. */
export function assignSpeechText(phrases: readonly SpeechPhrase[], transcript: string): TimedSpeech[] {
  if (phrases.length === 0) return [];
  const words = transcript.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return phrases.map((phrase) => ({ ...phrase, text: '' }));
  const total = phrases.reduce((sum, phrase) => sum + Math.max(0.001, phrase.end - phrase.start), 0);
  let cursor = 0;
  return phrases.map((phrase, index) => {
    const remaining = words.length - cursor;
    const share =
      index === phrases.length - 1
        ? remaining
        : Math.max(1, Math.round((words.length * Math.max(0.001, phrase.end - phrase.start)) / total));
    const take = Math.min(remaining, share);
    const text = words.slice(cursor, cursor + Math.max(0, take)).join(' ');
    cursor += Math.max(0, take);
    return { start: phrase.start, end: phrase.end, text };
  });
}

export interface TranscriptChunk {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface WordSpan {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

function isStageDirection(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length === 0 || /^\[[^\]]+\]$/.test(trimmed) || /^[♪♫.\s]+$/.test(trimmed);
}

function wordsInChunk(chunk: TranscriptChunk): WordSpan[] {
  const text = chunk.text.replace(/\s+/g, ' ').trim();
  if (isStageDirection(text) || !(chunk.end > chunk.start)) return [];
  const parts = text.split(' ');
  const span = chunk.end - chunk.start;
  const weights = parts.map((part) => Math.max(1, part.length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = chunk.start;
  return parts.map((part, index) => {
    const share = (span * (weights[index] ?? 1)) / total;
    const start = cursor;
    const end = index === parts.length - 1 ? chunk.end : cursor + share;
    cursor = end;
    return { text: part, start, end };
  });
}

function lineText(words: readonly WordSpan[]): string {
  return words
    .map((word) => word.text)
    .join(' ')
    .trim();
}

function fitPhraseCount(lines: TimedSpeech[], max: number): TimedSpeech[] {
  const next = lines.slice();
  while (next.length > max) {
    let best = 0;
    let bestGap = Number.POSITIVE_INFINITY;
    for (let index = 0; index < next.length - 1; index++) {
      const gap = next[index + 1]!.start - next[index]!.end;
      if (gap < bestGap) {
        bestGap = gap;
        best = index;
      }
    }
    const left = next[best]!;
    const right = next[best + 1]!;
    next.splice(best, 2, { start: left.start, end: right.end, text: `${left.text} ${right.text}`.trim() });
  }
  return next;
}

/**
 * Groups a timestamped transcript into caption lines. Words stay in order,
 * a pause or a full line starts a new caption, and nothing is dropped when
 * there are more lines than the timeline can hold.
 */
export function captionPhrasesFromTranscript(chunks: readonly TranscriptChunk[]): TimedSpeech[] {
  const words = chunks.flatMap(wordsInChunk);
  const groups: WordSpan[][] = [];
  let current: WordSpan[] = [];
  const flush = () => {
    if (current.length === 0) return;
    groups.push(current);
    current = [];
  };

  for (const word of words) {
    if (current.length > 0) {
      const previous = current[current.length - 1]!;
      const first = current[0]!;
      const gap = word.start - previous.end;
      const text = `${lineText(current)} ${word.text}`;
      const duration = word.end - first.start;
      const sentence = /[.!?…]$/.test(previous.text);
      const breakLine =
        gap >= LINE_PAUSE_SECONDS ||
        (text.length > LINE_CHARS && (sentence || text.length > LINE_CHARS_HARD || duration > MAX_PHRASE_SECONDS)) ||
        (duration > MAX_PHRASE_SECONDS && lineText(current).length >= 12);
      if (breakLine) flush();
    }
    current.push(word);
    if (/[.!?…]$/.test(word.text) && lineText(current).length >= 18) flush();
  }
  flush();

  const lines = groups
    .map((group) => ({
      start: group[0]!.start,
      end: group[group.length - 1]!.end,
      text: lineText(group),
    }))
    .filter((line) => line.text.length > 0 && line.end > line.start);
  return fitPhraseCount(lines, MAX_PHRASES);
}

/** Picks the spoken language from Whisper's language-token scores. */
export function spokenLanguage(scores: ArrayLike<number>, languages: Readonly<Record<string, number>>): string {
  let bestCode = 'en';
  let best = Number.NEGATIVE_INFINITY;
  for (const [token, id] of Object.entries(languages)) {
    const score = Number(scores[id] ?? Number.NEGATIVE_INFINITY);
    if (!(score > best)) continue;
    best = score;
    bestCode = token.startsWith('<|') && token.endsWith('|>') ? token.slice(2, -2) : token;
  }
  return bestCode;
}

/** Drops lines that sit in silence. If none overlap speech, the transcript is kept. */
export function phrasesHeardInSpeech(phrases: readonly TimedSpeech[], speech: readonly SpeechPhrase[]): TimedSpeech[] {
  if (phrases.length === 0 || speech.length === 0) return [...phrases];
  const kept = phrases.filter((phrase) => {
    const duration = Math.max(0.001, phrase.end - phrase.start);
    let overlap = 0;
    for (const region of speech) {
      const start = Math.max(phrase.start, region.start);
      const end = Math.min(phrase.end, region.end);
      if (end > start) overlap += end - start;
    }
    return overlap / duration >= 0.3;
  });
  return kept.length > 0 ? kept : [...phrases];
}

/** Maps source-relative speech times onto timeline cues inside `clip`. */
export function captionCuesForClip(clip: Clip, phrases: readonly TimedSpeech[], rate: FrameRate): CaptionCue[] {
  const fps = rate.numerator / Math.max(1, rate.denominator);
  const speed = clipSpeedPercent(clip.speed) / 100;
  const clipEnd = getClipEnd(clip);
  const raw = phrases
    .map((phrase) => {
      const localStart = (phrase.start * fps) / speed;
      const localEnd = (phrase.end * fps) / speed;
      const start = clip.start + Math.max(0, Math.round(localStart));
      const end = Math.min(clipEnd, clip.start + Math.max(Math.round(localStart) + 1, Math.round(localEnd)));
      return { start, end, content: phrase.text.trim() };
    })
    .filter((cue) => cue.start < clipEnd && cue.end > cue.start)
    .sort((a, b) => a.start - b.start);

  const packed: CaptionCue[] = [];
  for (let i = 0; i < raw.length; i++) {
    const cue = raw[i]!;
    const nextStart = raw[i + 1]?.start ?? clipEnd;
    const end = Math.min(cue.end, nextStart);
    if (end <= cue.start) continue;
    packed.push({ start: cue.start, durationFrames: end - cue.start, content: cue.content });
  }
  return packed;
}
