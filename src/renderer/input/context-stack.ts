import type { Keymap } from './keymap';

export type InputContextName =
  | 'document'
  | 'caret'
  | 'visual'
  | 'tree'
  | 'tree-search'
  | 'palette'
  | 'search'
  | 'outline'
  | 'links'
  | 'quick-open'
  | 'templates'
  | 'vault-dialog';

export interface ContextEntry {
  readonly name: InputContextName;
  readonly keymap: Keymap;
}

export interface ContextStack {
  push(entry: ContextEntry): void;
  pop(): ContextEntry | undefined;
  peek(): ContextEntry | undefined;
  active(): ContextEntry | undefined;
}

export const createContextStack = (): ContextStack => {
  const stack: ContextEntry[] = [];

  return {
    push(entry: ContextEntry): void {
      stack.push(entry);
    },
    pop(): ContextEntry | undefined {
      return stack.pop();
    },
    peek(): ContextEntry | undefined {
      return stack[stack.length - 1];
    },
    active(): ContextEntry | undefined {
      return stack[stack.length - 1];
    }
  };
};
