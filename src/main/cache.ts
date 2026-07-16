import type { Session } from 'electron';

export type CacheSession = Pick<Session, 'clearCodeCaches' | 'clearData'>;

export const clearApplicationCache = async (targetSession: CacheSession): Promise<void> => {
  await targetSession.clearData({ dataTypes: ['cache'] });
  await targetSession.clearCodeCaches({});
};
