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
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly isComposing?: boolean;
}

/**
 * Normalizes a key event to a canonical chord string.
 *
 * Convention (fixed in ADR-0012):
 *   plain letter          → 'j', 'k', 'G'  (shift handled via event.key casing)
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

  if (event.ctrlKey && !event.altKey && !event.metaKey) {
    return `<C-${event.key.toLowerCase()}>`;
  }

  if (event.altKey || event.metaKey) {
    return null;
  }

  return event.key;
};
