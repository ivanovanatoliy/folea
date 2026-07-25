import type { VaultPathMapping } from '../../shared/ipc/vault';
import type { NotePositionState } from '../../shared/ipc/vault-state';
import { mapMovedPath } from '../../shared/typst-links';

export const NAVIGATION_HISTORY_MAX = 100;

export type NavigationLocation = NotePositionState;

export interface NavigationHistory {
  record(location: NavigationLocation): void;
  back(
    current: NavigationLocation,
    isAvailable?: (relPath: string) => boolean
  ): NavigationLocation | undefined;
  forward(
    current: NavigationLocation,
    isAvailable?: (relPath: string) => boolean
  ): NavigationLocation | undefined;
  remap(mappings: readonly VaultPathMapping[]): void;
  prune(availableRelPaths: ReadonlySet<string>): void;
  clear(): void;
  readonly backCount: number;
  readonly forwardCount: number;
}

const sameLocation = (left: NavigationLocation, right: NavigationLocation): boolean =>
  left.relPath === right.relPath &&
  left.scrollTop === right.scrollTop &&
  left.scrollLeft === right.scrollLeft &&
  left.zoomMode === right.zoomMode &&
  left.zoomLevel === right.zoomLevel &&
  left.caretSpanIndex === right.caretSpanIndex;

const pushBounded = (stack: NavigationLocation[], location: NavigationLocation): void => {
  const previous = stack.at(-1);
  if (previous && sameLocation(previous, location)) return;
  stack.push(location);
  if (stack.length > NAVIGATION_HISTORY_MAX) {
    stack.splice(0, stack.length - NAVIGATION_HISTORY_MAX);
  }
};

const compact = (locations: readonly NavigationLocation[]): NavigationLocation[] => {
  const result: NavigationLocation[] = [];
  for (const location of locations) pushBounded(result, location);
  return result;
};

export const createNavigationHistory = (): NavigationHistory => {
  let backStack: NavigationLocation[] = [];
  let forwardStack: NavigationLocation[] = [];

  const takeAvailable = (
    stack: NavigationLocation[],
    isAvailable: (relPath: string) => boolean
  ): NavigationLocation | undefined => {
    for (;;) {
      const candidate = stack.pop();
      if (!candidate || isAvailable(candidate.relPath)) return candidate;
    }
  };

  return {
    record(location): void {
      pushBounded(backStack, location);
      forwardStack = [];
    },
    back(current, isAvailable = () => true): NavigationLocation | undefined {
      const target = takeAvailable(backStack, isAvailable);
      if (!target) return undefined;
      pushBounded(forwardStack, current);
      return target;
    },
    forward(current, isAvailable = () => true): NavigationLocation | undefined {
      const target = takeAvailable(forwardStack, isAvailable);
      if (!target) return undefined;
      pushBounded(backStack, current);
      return target;
    },
    remap(mappings): void {
      if (mappings.length === 0) return;
      const pathMappings = new Map(mappings.map((mapping) => [mapping.from, mapping.to]));
      const remapStack = (stack: readonly NavigationLocation[]): NavigationLocation[] =>
        compact(
          stack.map((location) => {
            const relPath = mapMovedPath(location.relPath, pathMappings);
            return relPath === location.relPath ? location : { ...location, relPath };
          })
        );
      backStack = remapStack(backStack);
      forwardStack = remapStack(forwardStack);
    },
    prune(availableRelPaths): void {
      backStack = backStack.filter((location) => availableRelPaths.has(location.relPath));
      forwardStack = forwardStack.filter((location) => availableRelPaths.has(location.relPath));
    },
    clear(): void {
      backStack = [];
      forwardStack = [];
    },
    get backCount(): number {
      return backStack.length;
    },
    get forwardCount(): number {
      return forwardStack.length;
    }
  };
};
