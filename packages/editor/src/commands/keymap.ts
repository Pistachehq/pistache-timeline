/*
 * Keyboard chords are written as `Mod+Shift+Z`, where `Mod` is ⌘ on macOS
 * and Ctrl elsewhere. Letters and digits are matched by physical key so
 * shortcuts keep working with Alt/Option and non-Latin layouts.
 */

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? navigator.platform;
  return /mac|iphone|ipad/i.test(platform);
}

export interface KeyEventLike {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

const KEY_ALIASES: Readonly<Record<string, string>> = {
  ' ': 'Space',
  Spacebar: 'Space',
  Esc: 'Escape',
  Del: 'Delete',
  '+': '=',
};

function keyName(event: KeyEventLike): string {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit\d$/.test(event.code)) return event.code.slice(5);
  if (event.code === 'Equal' || event.code === 'NumpadAdd') return '=';
  if (event.code === 'Minus' || event.code === 'NumpadSubtract') return '-';
  if (event.code === 'Backslash') return '\\';
  if (event.code === 'Comma') return ',';
  if (event.code === 'Period') return '.';
  const key = KEY_ALIASES[event.key] ?? event.key;
  return key.length === 1 ? key.toUpperCase() : key;
}

/** Normalises a keyboard event into a chord string such as `Mod+Shift+Z`. */
export function eventToChord(event: KeyEventLike, mac = isMacPlatform()): string {
  const parts: string[] = [];
  if (mac ? event.metaKey : event.ctrlKey) parts.push('Mod');
  if (mac && event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(keyName(event));
  return parts.join('+');
}

const MAC_SYMBOLS: Readonly<Record<string, string>> = {
  Mod: '⌘',
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
};

const KEY_LABELS: Readonly<Record<string, string>> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Delete: 'Del',
  Backspace: '⌫',
};

/** Formats a chord for menus and tooltips using platform conventions. */
export function formatChord(chord: string, mac = isMacPlatform()): string {
  const parts = chord.split('+');
  const key = parts.pop() ?? '';
  const label = KEY_LABELS[key] ?? key;
  if (mac) return `${parts.map((p) => MAC_SYMBOLS[p] ?? p).join('')}${label}`;
  return [...parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)), label].join('+');
}
