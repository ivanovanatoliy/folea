import { describe, expect, it } from 'vitest';
import { applyVaultStatePatch } from '../../src/main/vault-state';
import {
  defaultVaultState,
  NOTE_POSITIONS_MAX,
  parseNotePositionState,
  RECENT_NOTES_MAX
} from '../../src/shared/ipc/vault-state';
import type { NotePositionState } from '../../src/shared/ipc/vault-state';

const makePosition = (relPath: string, updatedAt = '2026-01-01T00:00:00Z'): NotePositionState => ({
  relPath,
  scrollTop: 100,
  scrollLeft: 0,
  viewportHeight: 800,
  contentHeight: 2000,
  scrollRatio: 0.05,
  zoomMode: 'fitContentWidth',
  zoomLevel: 1.25,
  caretSpanIndex: null,
  updatedAt
});

describe('applyVaultStatePatch — noteOpened', () => {
  it('adds to recentNotes and sets lastOpenedNote', () => {
    const state = defaultVaultState();
    const result = applyVaultStatePatch(state, {
      type: 'noteOpened',
      relPath: 'notes/alpha.typ',
      title: 'Alpha',
      openedAt: '2026-01-01T00:00:00Z'
    });
    expect(result.lastOpenedNote).toBe('notes/alpha.typ');
    expect(result.recentNotes).toHaveLength(1);
    expect(result.recentNotes[0]?.relPath).toBe('notes/alpha.typ');
  });

  it('deduplicates — moves existing entry to front', () => {
    let state = defaultVaultState();
    state = applyVaultStatePatch(state, {
      type: 'noteOpened', relPath: 'a.typ', title: 'A', openedAt: '2026-01-01T00:00:00Z'
    });
    state = applyVaultStatePatch(state, {
      type: 'noteOpened', relPath: 'b.typ', title: 'B', openedAt: '2026-01-01T00:01:00Z'
    });
    state = applyVaultStatePatch(state, {
      type: 'noteOpened', relPath: 'a.typ', title: 'A', openedAt: '2026-01-01T00:02:00Z'
    });

    expect(state.recentNotes).toHaveLength(2);
    expect(state.recentNotes[0]?.relPath).toBe('a.typ');
    expect(state.recentNotes[1]?.relPath).toBe('b.typ');
  });

  it(`caps at RECENT_NOTES_MAX (${RECENT_NOTES_MAX})`, () => {
    let state = defaultVaultState();
    for (let i = 0; i < RECENT_NOTES_MAX + 5; i++) {
      state = applyVaultStatePatch(state, {
        type: 'noteOpened',
        relPath: `note-${i}.typ`,
        title: `Note ${i}`,
        openedAt: '2026-01-01T00:00:00Z'
      });
    }
    expect(state.recentNotes).toHaveLength(RECENT_NOTES_MAX);
  });
});

describe('applyVaultStatePatch — positionChanged', () => {
  it('stores position for a note', () => {
    const state = defaultVaultState();
    const pos = makePosition('notes/alpha.typ');
    const result = applyVaultStatePatch(state, { type: 'positionChanged', position: pos });
    expect(result.notePositions['notes/alpha.typ']).toEqual(pos);
  });

  it('overwrites existing position', () => {
    const state = defaultVaultState();
    const pos1 = makePosition('notes/alpha.typ', '2026-01-01T00:00:00Z');
    const pos2 = makePosition('notes/alpha.typ', '2026-01-01T00:01:00Z');
    let result = applyVaultStatePatch(state, { type: 'positionChanged', position: pos1 });
    result = applyVaultStatePatch(result, { type: 'positionChanged', position: pos2 });
    expect(result.notePositions['notes/alpha.typ']?.updatedAt).toBe('2026-01-01T00:01:00Z');
    expect(Object.keys(result.notePositions)).toHaveLength(1);
  });

  it(`evicts oldest entries when over NOTE_POSITIONS_MAX (${NOTE_POSITIONS_MAX})`, () => {
    let state = defaultVaultState();
    for (let i = 0; i < NOTE_POSITIONS_MAX; i++) {
      state = applyVaultStatePatch(state, {
        type: 'positionChanged',
        position: makePosition(`old-${i}.typ`, '2025-01-01T00:00:00Z')
      });
    }

    state = applyVaultStatePatch(state, {
      type: 'positionChanged',
      position: makePosition('new.typ', '2026-06-01T00:00:00Z')
    });

    expect(Object.keys(state.notePositions)).toHaveLength(NOTE_POSITIONS_MAX);
    expect(state.notePositions['new.typ']).toBeDefined();
  });
});

describe('applyVaultStatePatch — commandExecuted', () => {
  it('stores recently executed commands most-recent first', () => {
    let state = defaultVaultState();
    state = applyVaultStatePatch(state, {
      type: 'commandExecuted',
      commandId: 'document.outline'
    });
    state = applyVaultStatePatch(state, {
      type: 'commandExecuted',
      commandId: 'search.open'
    });

    expect(state.commandHistory).toEqual(['search.open', 'document.outline']);
  });

  it('deduplicates repeated commands by moving them to the front', () => {
    let state = defaultVaultState();
    state = applyVaultStatePatch(state, {
      type: 'commandExecuted',
      commandId: 'document.outline'
    });
    state = applyVaultStatePatch(state, {
      type: 'commandExecuted',
      commandId: 'search.open'
    });
    state = applyVaultStatePatch(state, {
      type: 'commandExecuted',
      commandId: 'document.outline'
    });

    expect(state.commandHistory).toEqual(['document.outline', 'search.open']);
  });
});

describe('parseNotePositionState', () => {
  it('defaults zoom fields for state files written before zoom persistence', () => {
    expect(
      parseNotePositionState({
        relPath: 'notes/alpha.typ',
        scrollTop: 100,
        scrollLeft: 0,
        viewportHeight: 800,
        contentHeight: 2000,
        scrollRatio: 0.05,
        caretSpanIndex: null,
        updatedAt: '2026-01-01T00:00:00Z'
      })
    ).toMatchObject({
      zoomMode: 'fitWidth',
      zoomLevel: 1
    });
  });
});

describe('applyVaultStatePatch — removeMissingNotes', () => {
  it('removes deleted notes from recentNotes and positions', () => {
    let state = defaultVaultState();
    state = applyVaultStatePatch(state, {
      type: 'noteOpened', relPath: 'a.typ', title: 'A', openedAt: '2026-01-01T00:00:00Z'
    });
    state = applyVaultStatePatch(state, {
      type: 'positionChanged', position: makePosition('a.typ')
    });

    const result = applyVaultStatePatch(state, {
      type: 'removeMissingNotes', relPaths: ['a.typ']
    });

    expect(result.recentNotes).toHaveLength(0);
    expect(result.notePositions['a.typ']).toBeUndefined();
  });

  it('clears lastOpenedNote if it was deleted', () => {
    let state = defaultVaultState();
    state = applyVaultStatePatch(state, {
      type: 'noteOpened', relPath: 'a.typ', title: 'A', openedAt: '2026-01-01T00:00:00Z'
    });

    const result = applyVaultStatePatch(state, {
      type: 'removeMissingNotes', relPaths: ['a.typ']
    });

    expect(result.lastOpenedNote).toBeNull();
  });

  it('keeps unrelated notes intact', () => {
    let state = defaultVaultState();
    state = applyVaultStatePatch(state, {
      type: 'noteOpened', relPath: 'a.typ', title: 'A', openedAt: '2026-01-01T00:00:00Z'
    });
    state = applyVaultStatePatch(state, {
      type: 'noteOpened', relPath: 'b.typ', title: 'B', openedAt: '2026-01-01T00:01:00Z'
    });

    const result = applyVaultStatePatch(state, {
      type: 'removeMissingNotes', relPaths: ['a.typ']
    });

    expect(result.recentNotes).toHaveLength(1);
    expect(result.recentNotes[0]?.relPath).toBe('b.typ');
  });
});
