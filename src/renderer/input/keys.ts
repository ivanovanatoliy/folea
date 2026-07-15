const MODIFIER_KEYS = new Set([
  'Control',
  'Shift',
  'Alt',
  'Meta',
  'OS',
  'AltGraph',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Fn',
  'FnLock',
  'Hyper',
  'Super',
  'Symbol',
  'SymbolLock'
]);

export interface KeyEvent {
  readonly key: string;
  readonly code?: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey?: boolean;
  readonly isComposing?: boolean;
  readonly getModifierState?: (key: string) => boolean;
}

const SHIFTED_DIGITS = ')!@#$%^&*(';

const PHYSICAL_PUNCTUATION = new Map<string, readonly [string, string]>([
  ['Backquote', ['`', '~']],
  ['Minus', ['-', '_']],
  ['Equal', ['=', '+']],
  ['BracketLeft', ['[', '{']],
  ['BracketRight', [']', '}']],
  ['Backslash', ['\\', '|']],
  ['Semicolon', [';', ':']],
  ['Quote', ["'", '"']],
  ['Comma', [',', '<']],
  ['Period', ['.', '>']],
  ['Slash', ['/', '?']]
]);

const physicalKey = (event: KeyEvent): string => {
  const code = event.code ?? '';

  if (/^Key[A-Z]$/.test(code)) {
    const letter = code.slice('Key'.length).toLowerCase();
    if (/^[A-Z]$/.test(event.key)) return letter.toUpperCase();
    if (/^[a-z]$/.test(event.key)) return letter;
    const shifted = (event.shiftKey === true) !== (event.getModifierState?.('CapsLock') === true);
    return shifted ? letter.toUpperCase() : letter;
  }

  if (/^Digit[0-9]$/.test(code)) {
    const digit = Number(code.slice('Digit'.length));
    const shifted = event.shiftKey === true || event.key === SHIFTED_DIGITS[digit];
    return shifted ? SHIFTED_DIGITS[digit]! : String(digit);
  }

  const punctuation = PHYSICAL_PUNCTUATION.get(code);
  if (punctuation) {
    const shifted = event.shiftKey === true || event.key === punctuation[1];
    return punctuation[shifted ? 1 : 0];
  }

  return event.key;
};

/**
 * Normalizes a key event to a canonical chord string.
 *
 * Convention (fixed in ADR-0012):
 *   physical letter       → 'j', 'k', 'G'  (derived from event.code on any layout)
 *   named non-printing key → 'Enter'
 *   control chord         → '<C-d>', '<C-u>'
 *   multi-key             → concatenated by the sequence buffer ('gg')
 *
 * Ctrl bindings only (not Cmd/Meta), sioyek/vim style.
 * Returns null for modifier-only events.
 */
export const normalizeChord = (event: KeyEvent): string | null => {
  if (event.isComposing || MODIFIER_KEYS.has(event.key)) {
    return null;
  }

  const key = physicalKey(event);

  if (event.ctrlKey && !event.altKey && !event.metaKey) {
    return `<C-${key.toLowerCase()}>`;
  }

  if (event.altKey || event.metaKey) {
    return null;
  }

  return key;
};
