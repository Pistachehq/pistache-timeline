import { describe, expect, it } from 'vitest';
import { eventToChord, formatChord } from './keymap';

function event(partial: Partial<Parameters<typeof eventToChord>[0]> & { key: string; code: string }) {
  return {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...partial,
  };
}

describe('eventToChord', () => {
  it('uses Ctrl as Mod on non-mac platforms', () => {
    expect(eventToChord(event({ key: 's', code: 'KeyS', ctrlKey: true }), false)).toBe('Mod+S');
    expect(eventToChord(event({ key: 's', code: 'KeyS', metaKey: true }), false)).toBe('S');
  });

  it('uses Meta as Mod on macOS and keeps physical letter keys', () => {
    expect(eventToChord(event({ key: 'z', code: 'KeyZ', metaKey: true, shiftKey: true }), true)).toBe(
      'Mod+Shift+Z',
    );
  });

  it('maps Space and arrow keys', () => {
    expect(eventToChord(event({ key: ' ', code: 'Space' }), false)).toBe('Space');
    expect(eventToChord(event({ key: 'ArrowLeft', code: 'ArrowLeft', altKey: true }), false)).toBe(
      'Alt+ArrowLeft',
    );
  });
});

describe('formatChord', () => {
  it('formats chords for Windows/Linux menus', () => {
    expect(formatChord('Mod+Shift+Z', false)).toBe('Ctrl+Shift+Z');
    expect(formatChord('Space', false)).toBe('Space');
  });

  it('formats chords with macOS symbols', () => {
    expect(formatChord('Mod+Shift+Z', true)).toBe('⌘⇧Z');
    expect(formatChord('Alt+ArrowLeft', true)).toBe('⌥←');
  });
});
