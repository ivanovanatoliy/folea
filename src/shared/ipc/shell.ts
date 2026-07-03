export interface ShellOpenExternalRequest {
  readonly url: string;
}

export interface FoleaShellBridge {
  openExternal(url: string): Promise<void>;
}

export const validateShellOpenExternalRequest = (
  value: unknown
): ShellOpenExternalRequest => {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as Record<string, unknown>).url !== 'string'
  ) {
    throw new TypeError('Invalid shell.openExternal request');
  }

  const url = (value as { url: string }).url;
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    throw new TypeError('shell.openExternal only accepts http:// or https:// URLs');
  }

  return { url };
};
