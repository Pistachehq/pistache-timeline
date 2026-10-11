import { describe, expect, it } from 'vitest';
import { guessSpeechLanguage } from './speech-language';

describe('guessSpeechLanguage', () => {
  it('reads Spanish from accents and short phrases', () => {
    expect(guessSpeechLanguage('Hola')).toBe('es');
    expect(guessSpeechLanguage('¿Cómo estás?')).toBe('es');
    expect(guessSpeechLanguage('Gracias por todo')).toBe('es');
  });

  it('keeps English sentences in English', () => {
    expect(guessSpeechLanguage('Text')).toBe('en');
    expect(guessSpeechLanguage('Hello there, how are you?')).toBe('en');
  });
});
