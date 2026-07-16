export const DEFAULT_NOTIFICATION_DURATION_MS = 3_000;

export interface NotificationValue {
  readonly tone: 'error' | 'warning' | 'success';
  readonly message: string;
}

export const resolveNotificationDuration = (durationMs?: number): number =>
  durationMs ?? DEFAULT_NOTIFICATION_DURATION_MS;
