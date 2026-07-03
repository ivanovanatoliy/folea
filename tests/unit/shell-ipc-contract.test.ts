import { describe, expect, it } from 'vitest';

import {
  validateShellOpenExternalRequest,
  type ShellOpenExternalRequest
} from '../../src/shared/ipc/shell';

describe('shell.openExternal IPC contract', () => {
  it('accepts http and https URLs', () => {
    const request = validateShellOpenExternalRequest({ url: 'https://example.com' });
    const httpRequest = validateShellOpenExternalRequest({ url: 'http://example.com' });

    expect(request).toEqual<ShellOpenExternalRequest>({ url: 'https://example.com' });
    expect(httpRequest).toEqual<ShellOpenExternalRequest>({ url: 'http://example.com' });
  });

  it('rejects invalid URLs', () => {
    expect(() => validateShellOpenExternalRequest({ url: 'file:///tmp/x' })).toThrow(TypeError);
    expect(() => validateShellOpenExternalRequest({ url: '' })).toThrow(TypeError);
    expect(() => validateShellOpenExternalRequest(null)).toThrow(TypeError);
  });
});
