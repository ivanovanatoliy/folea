import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NOTIFICATION_DURATION_MS,
  resolveNotificationDuration
} from '../../src/renderer/app/notification-model';

describe('notification duration', () => {
  it('defaults to three seconds', () => {
    expect(DEFAULT_NOTIFICATION_DURATION_MS).toBe(3_000);
    expect(resolveNotificationDuration()).toBe(3_000);
  });

  it('accepts a duration override from the component user', () => {
    expect(resolveNotificationDuration(7_500)).toBe(7_500);
  });
});
