import { createEffect, onCleanup, Show } from 'solid-js';

import { resolveNotificationDuration, type NotificationValue } from './notification-model';

export type { NotificationValue } from './notification-model';

interface NotificationProps {
  readonly value: NotificationValue | undefined;
  readonly durationMs?: number;
  readonly onExpire: () => void;
}

export const Notification = (props: NotificationProps) => {
  createEffect(() => {
    const value = props.value;
    if (!value) return;

    const timeout = setTimeout(props.onExpire, resolveNotificationDuration(props.durationMs));
    onCleanup(() => clearTimeout(timeout));
  });

  return (
    <Show when={props.value} keyed>
      {(value) => (
        <aside
          class={`notification notification-${value.tone}`}
          data-testid="notification"
          role="status"
        >
          <span class="notification-message">{value.message}</span>
        </aside>
      )}
    </Show>
  );
};
