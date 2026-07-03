export const EDITOR_OPEN_CHANNEL = 'folea:editor:open' as const;

export interface FoleaEditorBridge {
  open(relPath: string): Promise<void>;
}

export const validateEditorOpenRelPath = (relPath: unknown): string => {
  if (typeof relPath !== 'string' || relPath.length === 0) {
    throw new TypeError('editor.open: relPath must be a non-empty string');
  }
  if (relPath.includes('..')) {
    throw new TypeError('editor.open: relPath must not contain ".." segments');
  }
  if (relPath.startsWith('/') || relPath.startsWith('\\')) {
    throw new TypeError('editor.open: relPath must not be absolute');
  }
  if (/^[a-zA-Z]:/.test(relPath)) {
    throw new TypeError('editor.open: relPath must not start with a drive letter');
  }
  return relPath;
};
