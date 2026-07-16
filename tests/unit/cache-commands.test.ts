import { describe, expect, it, vi } from 'vitest';

import '../../src/renderer/input/bindings';
import { getCommand, type CommandContext } from '../../src/renderer/input';

describe('cache commands', () => {
  it('dispatches each palette action to its matching cache scope', () => {
    const clearCurrentVault = vi.fn().mockResolvedValue(undefined);
    const clearApplication = vi.fn().mockResolvedValue(undefined);
    const context = { cache: { clearCurrentVault, clearApplication } } as unknown as CommandContext;

    getCommand('cache.clearCurrentVault')?.run(context);
    getCommand('cache.clearApplication')?.run(context);

    expect(clearCurrentVault).toHaveBeenCalledOnce();
    expect(clearApplication).toHaveBeenCalledOnce();
  });
});
