import type { LinkTarget } from '../surface/caret';

interface SmartJumpDeps {
  openNote(relPath: string, currentNoteRelPath: string | undefined): void;
  scrollToAnchor(id: string): void;
  /** Resolve a raw note href (from `fromRelPath`) to an actual vault note, or null. */
  resolveNoteHref(rawHref: string, fromRelPath: string): string | null;
}

export const dispatchSmartJump = (target: LinkTarget, deps: SmartJumpDeps): void => {
  switch (target.kind) {
    case 'anchor':
      deps.scrollToAnchor(target.id);
      break;
    case 'note': {
      const relPath = deps.resolveNoteHref(target.rawHref, target.fromRelPath);
      if (relPath) {
        deps.openNote(relPath, target.fromRelPath);
      } else {
        console.warn('Link target not found in vault:', target.rawHref);
      }
      break;
    }
    case 'external':
      void window.folea.shell.openExternal(target.url).catch((error: unknown) => {
        console.error('Unable to open external link', error);
      });
      break;
  }
};
