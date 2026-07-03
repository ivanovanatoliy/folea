import { getCommand } from './commands';
import type { CommandContext, DispatchResult } from './commands';
import type { ContextStack } from './context-stack';
import type { Keymap } from './keymap';
import { createSequenceBuffer } from './sequence';

const EMPTY_KEYMAP: Keymap = new Map<string, string>();

const prefixCache = new WeakMap<Keymap, ReadonlySet<string>>();

const prefixesFor = (keymap: Keymap): ReadonlySet<string> => {
  const cached = prefixCache.get(keymap);
  if (cached !== undefined) {
    return cached;
  }

  const prefixes = new Set<string>();
  for (const chord of keymap.keys()) {
    // M3 sequences are concatenated single-character chords such as "gg".
    // M9 config parsing must tokenize mixed chord sequences before they reach this cache.
    for (let length = 1; length < chord.length; length += 1) {
      const prefix = chord.slice(0, length);
      if (prefix.length === 1) {
        prefixes.add(prefix);
      }
    }
  }

  prefixCache.set(keymap, prefixes);
  return prefixes;
};

const hasPrefix = (accum: string, contextKeymap: Keymap, globalKeymap: Keymap): boolean =>
  prefixesFor(contextKeymap).has(accum) || prefixesFor(globalKeymap).has(accum);

export interface Dispatcher {
  dispatch(chord: string): DispatchResult;
}

export const createDispatcher = (
  contextStack: ContextStack,
  globalKeymap: Keymap,
  getContext: () => CommandContext
): Dispatcher => {
  const buffer = createSequenceBuffer();

  return {
    dispatch(chord: string): DispatchResult {
      const active = contextStack.active();
      const contextKeymap: Keymap = active?.keymap ?? EMPTY_KEYMAP;

      const accum = buffer.get() + chord;

      const commandId = contextKeymap.get(accum) ?? globalKeymap.get(accum);
      if (commandId !== undefined) {
        const command = getCommand(commandId);
        if (command !== undefined) {
          buffer.clear();
          const result = command.run(getContext());
          if (result === false) {
            return 'unhandled';
          }
          return 'handled';
        }

        buffer.clear();
        throw new Error(`Command not registered: ${commandId}`);
      }

      if (hasPrefix(accum, contextKeymap, globalKeymap)) {
        buffer.set(accum);
        buffer.armTimeout();
        return 'pending';
      }

      const pending = buffer.get();
      if (pending.length > 0 && chord.length === 1) {
        const wildcardKey = `${pending}*`;
        const wildcardCommandId = contextKeymap.get(wildcardKey) ?? globalKeymap.get(wildcardKey);
        if (wildcardCommandId !== undefined) {
          const wildcardCommand = getCommand(wildcardCommandId);
          if (wildcardCommand === undefined) {
            buffer.clear();
            throw new Error(`Command not registered: ${wildcardCommandId}`);
          }

          buffer.clear();
          const result = wildcardCommand.run(getContext(), chord);
          if (result === false) {
            return 'unhandled';
          }
          return 'handled';
        }
      }

      if (chord.length === 1) {
        const wildcardCommandId = contextKeymap.get('*');
        if (wildcardCommandId !== undefined) {
          const wildcardCommand = getCommand(wildcardCommandId);
          if (wildcardCommand === undefined) {
            buffer.clear();
            throw new Error(`Command not registered: ${wildcardCommandId}`);
          }

          buffer.clear();
          const result = wildcardCommand.run(getContext(), chord);
          if (result === false) {
            return 'unhandled';
          }
          return 'handled';
        }
      }

      buffer.clear();
      return 'unhandled';
    }
  };
};
