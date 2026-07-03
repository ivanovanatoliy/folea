export const APP_VERSION_CHANNEL = 'folea:app:version' as const;

export interface FoleaAppBridge {
  version(): Promise<string>;
}

export interface FoleaBridgeM0 {
  app: FoleaAppBridge;
}

export interface AppVersionRequest {
  readonly type: typeof APP_VERSION_CHANNEL;
}

export type AppVersionResponse = string;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const createAppVersionRequest = (): AppVersionRequest => ({ type: APP_VERSION_CHANNEL });

export const parseAppVersionRequestArgs = (args: readonly unknown[]): AppVersionRequest => {
  if (args.length !== 0) {
    throw new TypeError('app.version accepts no arguments');
  }

  return createAppVersionRequest();
};

export const parseAppVersionInvokeRequest = (value: unknown): AppVersionRequest => {
  if (!isRecord(value) || value.type !== APP_VERSION_CHANNEL || Object.keys(value).length !== 1) {
    throw new TypeError('Malformed app.version request');
  }

  return { type: APP_VERSION_CHANNEL };
};

export const parseAppVersionResponse = (value: unknown): AppVersionResponse => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('Malformed app.version response');
  }

  return value;
};
