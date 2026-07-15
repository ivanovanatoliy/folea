export const VAULT_IO_CONCURRENCY = 16;

export const mapWithConcurrency = async <Input, Output>(
  values: readonly Input[],
  concurrency: number,
  transform: (value: Input, index: number) => Promise<Output>
): Promise<Output[]> => {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError('Concurrency must be a positive safe integer');
  }
  const output = new Array<Output>(values.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      output[index] = await transform(values[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return output;
};
