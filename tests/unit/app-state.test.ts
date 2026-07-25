import { describe, expect, it } from 'vitest';
import {
  parseAppStateFileV1,
  parseAppStatePatch,
  parseMarkKeyboardHelpSeenRequest,
  parseRemoveRecentVaultRequest,
  defaultAppState
} from '../../src/shared/ipc/app-state';

describe('parseAppStateFileV1', () => {
  it('parses a valid state with null vault path', () => {
    const input = {
      schemaVersion: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      lastOpenedVaultPath: null
    };
    const result = parseAppStateFileV1(input);
    expect(result.schemaVersion).toBe(1);
    expect(result.lastOpenedVaultPath).toBeNull();
    expect(result.recentVaults).toEqual([]);
    expect(result.hasSeenKeyboardHelp).toBe(false);
  });

  it('parses a valid state with a vault path and recentVaults', () => {
    const input = {
      schemaVersion: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      lastOpenedVaultPath: '/home/user/vault',
      recentVaults: ['/home/user/vault', '/home/user/other']
    };
    const result = parseAppStateFileV1(input);
    expect(result.lastOpenedVaultPath).toBe('/home/user/vault');
    expect(result.recentVaults).toEqual(['/home/user/vault', '/home/user/other']);
    expect(result.hasSeenKeyboardHelp).toBe(true);
  });

  it('defaults recentVaults to [] when missing (backward compat)', () => {
    const input = {
      schemaVersion: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      lastOpenedVaultPath: null
    };
    const result = parseAppStateFileV1(input);
    expect(result.recentVaults).toEqual([]);
  });

  it('filters non-string entries from recentVaults', () => {
    const input = {
      schemaVersion: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      lastOpenedVaultPath: null,
      recentVaults: ['/valid/path', 42, null, '/another/path']
    };
    const result = parseAppStateFileV1(input);
    expect(result.recentVaults).toEqual(['/valid/path', '/another/path']);
  });

  it('preserves an explicit keyboard help acknowledgement value', () => {
    const result = parseAppStateFileV1({
      schemaVersion: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      lastOpenedVaultPath: '/home/user/vault',
      recentVaults: ['/home/user/vault'],
      hasSeenKeyboardHelp: false
    });

    expect(result.hasSeenKeyboardHelp).toBe(false);
  });

  it('throws for wrong schema version', () => {
    expect(() =>
      parseAppStateFileV1({
        schemaVersion: 2,
        updatedAt: '2026-01-01T00:00:00Z',
        lastOpenedVaultPath: null
      })
    ).toThrow(TypeError);
  });

  it('throws for missing updatedAt', () => {
    expect(() => parseAppStateFileV1({ schemaVersion: 1, lastOpenedVaultPath: null })).toThrow(
      TypeError
    );
  });

  it('throws for invalid lastOpenedVaultPath type', () => {
    expect(() =>
      parseAppStateFileV1({
        schemaVersion: 1,
        updatedAt: '2026-01-01T00:00:00Z',
        lastOpenedVaultPath: 42
      })
    ).toThrow(TypeError);
  });

  it('throws for non-object input', () => {
    expect(() => parseAppStateFileV1('not an object')).toThrow(TypeError);
    expect(() => parseAppStateFileV1(null)).toThrow(TypeError);
  });
});

describe('parseAppStatePatch', () => {
  it('parses setLastOpenedVault with absolute path', () => {
    const patch = parseAppStatePatch({ type: 'setLastOpenedVault', rootPath: '/home/user/vault' });
    expect(patch.type).toBe('setLastOpenedVault');
    if (patch.type === 'setLastOpenedVault') {
      expect(patch.rootPath).toBe('/home/user/vault');
    }
  });

  it('rejects relative paths in setLastOpenedVault', () => {
    expect(() =>
      parseAppStatePatch({ type: 'setLastOpenedVault', rootPath: 'relative/path' })
    ).toThrow(TypeError);
  });

  it('parses clearInvalidLastOpenedVault', () => {
    const patch = parseAppStatePatch({ type: 'clearInvalidLastOpenedVault' });
    expect(patch.type).toBe('clearInvalidLastOpenedVault');
  });

  it('parses removeRecentVault with absolute path', () => {
    const patch = parseAppStatePatch({ type: 'removeRecentVault', rootPath: '/home/user/vault' });
    expect(patch).toEqual({ type: 'removeRecentVault', rootPath: '/home/user/vault' });
  });

  it('parses keyboard help acknowledgement', () => {
    expect(parseAppStatePatch({ type: 'markKeyboardHelpSeen' })).toEqual({
      type: 'markKeyboardHelpSeen'
    });
  });

  it('throws for unknown patch type', () => {
    expect(() => parseAppStatePatch({ type: 'unknown' })).toThrow(TypeError);
  });
});

describe('defaultAppState', () => {
  it('returns schema version 1 with null vault path and empty recentVaults', () => {
    const state = defaultAppState();
    expect(state.schemaVersion).toBe(1);
    expect(state.lastOpenedVaultPath).toBeNull();
    expect(state.recentVaults).toEqual([]);
    expect(state.hasSeenKeyboardHelp).toBe(false);
  });
});

describe('renderer app state boundary', () => {
  it('allows removing a recent vault', () => {
    expect(
      parseRemoveRecentVaultRequest({ type: 'removeRecentVault', rootPath: '/vault' })
    ).toEqual({ type: 'removeRecentVault', rootPath: '/vault' });
  });

  it('allows acknowledging keyboard help on its dedicated channel', () => {
    expect(parseMarkKeyboardHelpSeenRequest({ type: 'markKeyboardHelpSeen' })).toEqual({
      type: 'markKeyboardHelpSeen'
    });
    expect(() =>
      parseMarkKeyboardHelpSeenRequest({ type: 'removeRecentVault', rootPath: '/vault' })
    ).toThrow('Only keyboard help acknowledgement');
  });

  it('rejects trusted main-process state mutations', () => {
    expect(() =>
      parseRemoveRecentVaultRequest({ type: 'setLastOpenedVault', rootPath: '/untrusted' })
    ).toThrow('Only recent vault removal');
    expect(() => parseRemoveRecentVaultRequest({ type: 'clearInvalidLastOpenedVault' })).toThrow(
      'Only recent vault removal'
    );
  });
});
