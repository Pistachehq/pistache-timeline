export type SpeechLanguage = 'en' | 'es';

const SPANISH_MARK = /[ñáéíóúü¿¡]/i;
const SPANISH_WORD =
  /^(hola|gracias|porque|tambien|también|aqui|aquí|esta|está|esto|este|para|muy|mas|más|pero|cuando|donde|dónde|quien|quién|que|qué|por|con|los|las|del|una|unos|unas|senor|señor|buenos|buenas|dias|días|noche|favor|usted|si|sí)$/i;

/** Picks an English or Spanish voice from the words themselves. */
export function guessSpeechLanguage(text: string): SpeechLanguage {
  if (SPANISH_MARK.test(text)) return 'es';
  const words = text.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g) ?? [];
  if (words.length === 0) return 'en';
  let hits = 0;
  for (const word of words) {
    if (SPANISH_WORD.test(word)) hits += 1;
  }
  if (hits >= 2) return 'es';
  if (hits === 1 && words.length <= 4) return 'es';
  return 'en';
}
