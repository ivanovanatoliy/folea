export const KEYS_CONFIG_LOAD_CHANNEL = 'folea:keysConfig:load' as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export interface KeysConfigLoadResponse {
  readonly content: string;
  readonly warnings: readonly string[];
}

export const parseKeysConfigLoadResponse = (value: unknown): KeysConfigLoadResponse => {
  if (!isRecord(value)) {
    return { content: '', warnings: [] };
  }

  return {
    content: typeof value.content === 'string' ? value.content : '',
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((warning): warning is string => typeof warning === 'string')
      : []
  };
};
