import type { DispatchResult } from './commands';
import { normalizeChord } from './keys';

interface Dispatcher {
  dispatch(chord: string): DispatchResult;
}

const isKeyboardEvent = (event: Event): event is KeyboardEvent => 'key' in event;

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
};

export const attachKeyListener = (
  target: Window | HTMLElement,
  dispatcher: Dispatcher
): (() => void) => {
  const handler = (event: Event): void => {
    if (!isKeyboardEvent(event)) {
      return;
    }

    const chord = normalizeChord(event);
    if (chord === null) {
      return;
    }

    if (
      isEditableTarget(event.target) &&
      chord.length === 1 &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      return;
    }

    const result = dispatcher.dispatch(chord);
    if (result === 'handled' || result === 'pending') {
      event.preventDefault();
    }
  };

  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
};
