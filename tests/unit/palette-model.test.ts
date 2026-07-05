import { describe, expect, it } from 'vitest';

import { filterPaletteCommands } from '../../src/renderer/app/palette-model';
import type { Command } from '../../src/renderer/input';

const commands: readonly Command[] = [
  { id: 'document.scrollLineDown', title: 'Scroll down', run: () => undefined },
  { id: 'document.outline', title: 'Open outline', run: () => undefined },
  { id: 'search.open', title: 'Open search', run: () => undefined }
];

describe('palette command filtering', () => {
  it('returns every command for an empty query', () => {
    expect(filterPaletteCommands(commands, '')).toHaveLength(3);
  });

  it('prefers title prefix matches over looser id matches', () => {
    const matches = filterPaletteCommands(commands, 'open');
    expect(matches[0]?.command.id).toBe('document.outline');
    expect(matches[1]?.command.id).toBe('search.open');
  });

  it('supports fuzzy subsequence matches', () => {
    const matches = filterPaletteCommands(commands, 'sld');
    expect(matches.map((entry) => entry.command.id)).toContain('document.scrollLineDown');
  });

  it('shows command history first in saved order, then other commands alphabetically', () => {
    const matches = filterPaletteCommands(commands, '', ['search.open', 'document.scrollLineDown']);
    expect(matches.map((entry) => entry.command.id)).toEqual([
      'search.open',
      'document.scrollLineDown',
      'document.outline'
    ]);
  });

  it('applies command history ordering after filtering by query', () => {
    const matches = filterPaletteCommands(commands, 'open', ['search.open']);
    expect(matches.map((entry) => entry.command.id)).toEqual(['search.open', 'document.outline']);
  });
});
