import { describe, expect, it } from 'vitest';

import { applyVaultStatePatch } from '../../src/main/vault-state';
import { defaultVaultState, parseVaultStateFileV1 } from '../../src/shared/ipc/vault-state';

describe('vault management state', () => {
  it('migrates current, recent, and position paths for moved subtrees', () => {
    let state = defaultVaultState();
    state = applyVaultStatePatch(state, {
      type: 'noteOpened',
      relPath: 'old/note.typ',
      title: 'Note',
      openedAt: '2026-01-01T00:00:00Z'
    });
    state = applyVaultStatePatch(state, {
      type: 'positionChanged',
      position: {
        relPath: 'old/note.typ',
        scrollTop: 1,
        scrollLeft: 0,
        viewportHeight: 1,
        contentHeight: 2,
        scrollRatio: 0.5,
        zoomMode: 'fixed',
        zoomLevel: 1,
        caretSpanIndex: null,
        updatedAt: '2026-01-01T00:00:00Z'
      }
    });

    const moved = applyVaultStatePatch(state, {
      type: 'pathsMoved',
      mappings: [{ from: 'old', to: 'archive/old' }]
    });
    expect(moved.lastOpenedNote).toBe('archive/old/note.typ');
    expect(moved.recentNotes[0]?.relPath).toBe('archive/old/note.typ');
    expect(moved.notePositions['archive/old/note.typ']?.relPath).toBe('archive/old/note.typ');
  });

  it('loads old schema-v1 state without a template selection and validates fallback', () => {
    const parsed = parseVaultStateFileV1({
      schemaVersion: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      lastOpenedNote: null,
      recentNotes: [],
      notePositions: {},
      commandHistory: []
    });
    expect(parsed.lastCreationTemplate).toBeNull();
    expect(
      parseVaultStateFileV1({ ...parsed, lastCreationTemplate: '_templates/missing.typ' })
        .lastCreationTemplate
    ).toBe('_templates/missing.typ');
  });
});
