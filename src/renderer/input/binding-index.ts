import type { Keymap } from './keymap';

// Maps command ID → human-readable key chord label (first binding wins)
export type BindingIndex = Map<string, string>;

const CHORD_LABELS: Record<string, string> = {
  'Escape': 'Esc',
  'Enter': '↵',
  'ArrowUp': '↑',
  'ArrowDown': '↓',
  'ArrowLeft': '←',
  'ArrowRight': '→',
  '<C-p>': 'C-p',
  '<C-n>': 'C-n',
  '<C-b>': 'C-b',
  '<C-d>': 'C-d',
  '<C-u>': 'C-u',
  '<C-e>': 'C-e',
};

const formatChord = (chord: string): string => {
  const ctrl = /^<C-([a-z0-9])>$/.exec(chord);
  if (ctrl) {
    return `C-${ctrl[1]}`;
  }

  return CHORD_LABELS[chord] ?? chord;
};

export const buildBindingIndex = (keymaps: readonly Keymap[]): BindingIndex => {
  const index: BindingIndex = new Map();

  for (const keymap of keymaps) {
    for (const [chord, commandId] of keymap) {
      // Skip wildcard chords (e.g. "m*") and multi-char sequences for display
      if (chord.includes('*')) continue;
      if (!index.has(commandId)) {
        index.set(commandId, formatChord(chord));
      }
    }
  }

  return index;
};
