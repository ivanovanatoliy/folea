export const SEQUENCE_TIMEOUT_MS = 600;

export interface SequenceBuffer {
  get(): string;
  set(value: string): void;
  clear(): void;
  armTimeout(): void;
}

export const createSequenceBuffer = (): SequenceBuffer => {
  let current = '';
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const cancelTimeout = (): void => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  return {
    get(): string {
      return current;
    },
    set(value: string): void {
      current = value;
    },
    clear(): void {
      current = '';
      cancelTimeout();
    },
    armTimeout(): void {
      cancelTimeout();
      timeoutId = setTimeout(() => {
        current = '';
        timeoutId = undefined;
      }, SEQUENCE_TIMEOUT_MS);
    }
  };
};
