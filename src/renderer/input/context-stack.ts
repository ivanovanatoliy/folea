import type { Keymap } from './keymap';

export interface ContextEntry {
  readonly name: string;
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
