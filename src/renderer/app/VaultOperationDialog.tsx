import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';

import type { VaultTemplate } from '../../shared/ipc/vault';

export type VaultOperationDialogRequest =
  | {
      readonly kind: 'text';
      readonly title: string;
      readonly label: string;
      readonly value: string;
      readonly submitLabel: string;
      readonly placeholder?: string;
    }
  | {
      readonly kind: 'template';
      readonly title: string;
      readonly templates: readonly VaultTemplate[];
      readonly selectedRelPath: string | null;
      readonly submitLabel: string;
    }
  | {
      readonly kind: 'confirm';
      readonly title: string;
      readonly message: string;
      readonly submitLabel: string;
      readonly destructive?: boolean;
    };

interface VaultOperationDialogProps {
  readonly request: VaultOperationDialogRequest | undefined;
  readonly onCancel: () => void;
  readonly onSubmit: (value: string | null | boolean) => void;
  readonly registerActions: (actions: VaultOperationDialogActions) => void;
}

export interface VaultOperationDialogActions {
  readonly cancel: () => void;
  readonly submit: () => void;
  readonly next: () => void;
  readonly previous: () => void;
}

export const VaultOperationDialog = (props: VaultOperationDialogProps) => {
  const [textValue, setTextValue] = createSignal('');
  const [selectedTemplate, setSelectedTemplate] = createSignal<string | null>(null);
  let input: HTMLInputElement | undefined;
  let templateChoicesElement: HTMLDivElement | undefined;
  let dialog: HTMLElement | undefined;

  const templateChoices = createMemo(() => {
    const request = props.request;
    return request?.kind === 'template'
      ? [null, ...request.templates.map((item) => item.relPath)]
      : [];
  });

  createEffect(() => {
    const request = props.request;
    if (!request) return;

    if (request.kind === 'text') {
      setTextValue(request.value);
      queueMicrotask(() => {
        input?.focus();
        input?.select();
      });
    } else if (request.kind === 'template') {
      setSelectedTemplate(request.selectedRelPath);
      queueMicrotask(() => templateChoicesElement?.focus());
    } else {
      queueMicrotask(() => dialog?.focus());
    }
  });

  const submit = (): void => {
    const request = props.request;
    if (!request) return;
    props.onSubmit(
      request.kind === 'text'
        ? textValue()
        : request.kind === 'template'
          ? selectedTemplate()
          : true
    );
  };

  const moveTemplateSelection = (offset: number): void => {
    const choices = templateChoices();
    if (choices.length === 0) return;
    const currentIndex = Math.max(0, choices.indexOf(selectedTemplate()));
    const nextIndex = Math.min(choices.length - 1, Math.max(0, currentIndex + offset));
    setSelectedTemplate(choices[nextIndex] ?? null);
  };

  props.registerActions({
    cancel: () => props.onCancel(),
    submit,
    next: () => moveTemplateSelection(1),
    previous: () => moveTemplateSelection(-1)
  });

  return (
    <Show when={props.request} keyed>
      {(request) => (
        <div
          class="vault-dialog-backdrop"
          data-testid="vault-dialog-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) props.onCancel();
          }}
        >
          <section
            ref={(element) => {
              dialog = element;
            }}
            class="vault-dialog"
            data-testid="vault-operation-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={request.title}
            tabindex="-1"
          >
            <div class="vault-dialog-header">{request.title}</div>
            <Show when={request.kind === 'text'}>
              <label class="vault-dialog-field">
                <span>{request.kind === 'text' ? request.label : ''}</span>
                <input
                  ref={(element) => {
                    input = element;
                  }}
                  data-testid="vault-dialog-input"
                  value={textValue()}
                  placeholder={request.kind === 'text' ? request.placeholder : undefined}
                  spellcheck={false}
                  onInput={(event) => setTextValue(event.currentTarget.value)}
                />
              </label>
            </Show>
            <Show when={request.kind === 'confirm'}>
              <p class="vault-dialog-message">
                {request.kind === 'confirm' ? request.message : ''}
              </p>
            </Show>
            <Show when={request.kind === 'template'}>
              <div
                ref={(element) => {
                  templateChoicesElement = element;
                }}
                class="vault-dialog-choices"
                data-testid="vault-template-choices"
                tabindex="0"
              >
                <button
                  type="button"
                  data-testid="vault-template-choice"
                  data-relpath=""
                  data-selected={selectedTemplate() === null}
                  onClick={() => setSelectedTemplate(null)}
                >
                  Empty
                </button>
                <For each={request.kind === 'template' ? request.templates : []}>
                  {(template) => (
                    <button
                      type="button"
                      data-testid="vault-template-choice"
                      data-relpath={template.relPath}
                      data-selected={selectedTemplate() === template.relPath}
                      onClick={() => setSelectedTemplate(template.relPath)}
                    >
                      {template.name}
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <div class="vault-dialog-actions">
              <button type="button" data-testid="vault-dialog-cancel" onClick={props.onCancel}>
                Cancel
              </button>
              <button
                type="button"
                classList={{
                  'vault-dialog-destructive':
                    request.kind === 'confirm' && request.destructive === true
                }}
                data-testid="vault-dialog-submit"
                onClick={submit}
              >
                {request.submitLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </Show>
  );
};
