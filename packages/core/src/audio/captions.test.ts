import { describe, expect, it } from 'vitest';
import { FrameRates } from '../time/rational';
import { createClip } from '../model/factory';
import {
  assignSpeechText,
  captionCuesForClip,
  captionPhrasesFromTranscript,
  phrasesHeardInSpeech,
  spokenLanguage,
  speechPhrases,
} from './captions';

function tone(sampleRate: number, seconds: number, amplitude: number): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * seconds));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * amplitude;
  }
  return samples;
}

function silence(sampleRate: number, seconds: number): Float32Array {
  return new Float32Array(Math.round(sampleRate * seconds));
}

function concat(...parts: Float32Array[]): Float32Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe('speechPhrases', () => {
  it('finds two bursts and ignores the silence between them', () => {
    const rate = 8000;
    const samples = concat(silence(rate, 0.3), tone(rate, 0.45, 0.5), silence(rate, 0.45), tone(rate, 0.45, 0.5));
    const phrases = speechPhrases(samples, rate);
    expect(phrases).toHaveLength(2);
    expect(phrases[0]!.start).toBeGreaterThan(0.2);
    expect(phrases[0]!.start).toBeLessThan(0.4);
    expect(phrases[1]!.start).toBeGreaterThan(1);
  });

  it('returns nothing for silence', () => {
    expect(speechPhrases(silence(8000, 1), 8000)).toEqual([]);
  });
});

describe('assignSpeechText', () => {
  it('gives every word to the only phrase', () => {
    const [line] = assignSpeechText([{ start: 0, end: 1 }], 'hola mundo');
    expect(line?.text).toBe('hola mundo');
  });

  it('splits words across phrases', () => {
    const lines = assignSpeechText(
      [
        { start: 0, end: 1 },
        { start: 1.4, end: 2.4 },
      ],
      'uno dos tres cuatro',
    );
    expect(lines.map((line) => line.text)).toEqual(['uno dos', 'tres cuatro']);
  });
});

describe('captionPhrasesFromTranscript', () => {
  it('keeps a short sentence on one line', () => {
    const lines = captionPhrasesFromTranscript([
      { start: 0, end: 0.4, text: 'Hola' },
      { start: 0.4, end: 0.9, text: 'mundo' },
    ]);
    expect(lines).toEqual([{ start: 0, end: 0.9, text: 'Hola mundo' }]);
  });

  it('starts a new line after a pause', () => {
    const lines = captionPhrasesFromTranscript([
      { start: 0, end: 0.3, text: 'Hola' },
      { start: 1.1, end: 1.5, text: 'mundo' },
    ]);
    expect(lines.map((line) => line.text)).toEqual(['Hola', 'mundo']);
  });

  it('splits a long passage without dropping words', () => {
    const words = Array.from({ length: 30 }, (_, index) => `word${index}`);
    const lines = captionPhrasesFromTranscript([{ start: 0, end: 20, text: words.join(' ') }]);
    expect(lines.flatMap((line) => line.text.split(' '))).toEqual(words);
    expect(lines[0]!.start).toBe(0);
    expect(lines[lines.length - 1]!.end).toBe(20);
    expect(lines.every((line) => line.text.length <= 90)).toBe(true);
  });

  it('drops stage directions and keeps speech that overlaps the voice', () => {
    const lines = captionPhrasesFromTranscript([
      { start: 0, end: 1, text: '[Music]' },
      { start: 1, end: 2, text: 'Hola' },
      { start: 8, end: 9, text: 'gracias por ver' },
    ]);
    expect(phrasesHeardInSpeech(lines, [{ start: 0.9, end: 2.1 }]).map((line) => line.text)).toEqual(['Hola']);
  });
});

describe('spokenLanguage', () => {
  it('chooses Spanish when that token scores highest', () => {
    const scores = [0, 0, 1.2, 4.8];
    expect(spokenLanguage(scores, { '<|en|>': 2, '<|es|>': 3 })).toBe('es');
  });

  it('chooses English when that token scores highest', () => {
    const scores = [0, 3, 0.2];
    expect(spokenLanguage(scores, { '<|en|>': 1, '<|es|>': 2 })).toBe('en');
  });
});

describe('captionCuesForClip', () => {
  it('places phrases on the timeline inside the audio clip', () => {
    const clip = createClip({
      assetId: 'asset_audio' as never,
      trackId: 'track_a1' as never,
      name: 'Voice',
      start: 15,
      sourceIn: 0,
      sourceOut: 90,
    });
    const cues = captionCuesForClip(clip, [{ start: 1, end: 2, text: 'Hola' }], FrameRates.fps30);
    expect(cues).toEqual([{ start: 45, durationFrames: 30, content: 'Hola' }]);
  });
});
