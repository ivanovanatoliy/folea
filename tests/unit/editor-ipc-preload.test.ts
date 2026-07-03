import { describe, expect, it } from 'vitest';

import { validateEditorOpenRelPath } from '../../src/shared/ipc/editor';

describe('editor IPC preload validation', () => {
  it('accepts a simple relative path', () => {
    expect(validateEditorOpenRelPath('note.typ')).toBe('note.typ');
  });

  it('accepts a nested relative path', () => {
    expect(validateEditorOpenRelPath('folder/note.typ')).toBe('folder/note.typ');
  });

  it('rejects path traversal with ".."', () => {
    expect(() => validateEditorOpenRelPath('../secret')).toThrow(TypeError);
    expect(() => validateEditorOpenRelPath('foo/../../../etc/passwd')).toThrow(TypeError);
  });

  it('rejects absolute paths starting with /', () => {
    expect(() => validateEditorOpenRelPath('/absolute/path')).toThrow(TypeError);
  });

  it('rejects absolute paths starting with \\', () => {
    expect(() => validateEditorOpenRelPath('\\absolute\\path')).toThrow(TypeError);
  });

  it('rejects drive-letter prefixes (Windows)', () => {
    expect(() => validateEditorOpenRelPath('C:\\Users\\note.typ')).toThrow(TypeError);
    expect(() => validateEditorOpenRelPath('c:/Users/note.typ')).toThrow(TypeError);
    expect(() => validateEditorOpenRelPath('Z:note.typ')).toThrow(TypeError);
  });

  it('rejects empty string', () => {
    expect(() => validateEditorOpenRelPath('')).toThrow(TypeError);
  });

  it('rejects non-string values', () => {
    expect(() => validateEditorOpenRelPath(null)).toThrow(TypeError);
    expect(() => validateEditorOpenRelPath(42)).toThrow(TypeError);
    expect(() => validateEditorOpenRelPath(undefined)).toThrow(TypeError);
    expect(() => validateEditorOpenRelPath([])).toThrow(TypeError);
  });
});
