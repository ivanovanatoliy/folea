import { Show } from 'solid-js';

export interface OperationNoticeValue {
  readonly tone: 'error' | 'warning';
  readonly message: string;
}

interface OperationNoticeProps {
  readonly notice: OperationNoticeValue | undefined;
  readonly onDismiss: () => void;
}

export const OperationNotice = (props: OperationNoticeProps) => (
  <Show when={props.notice} keyed>
    {(notice) => (
      <aside
        class={`operation-notice operation-notice-${notice.tone}`}
        data-testid="operation-notice"
        role="status"
      >
        <span class="operation-notice-message">{notice.message}</span>
        <button type="button" aria-label="Dismiss notification" onClick={props.onDismiss}>
          Close
        </button>
      </aside>
    )}
  </Show>
);
