import type { ContextStack } from './context-stack';

export interface DocumentView {
  scrollByLines(n: number): void;
  scrollByViewport(fraction: number): void;
  scrollToStart(): void;
  scrollToEnd(): void;
  scrollToOffset(y: number): void;
  scrollLeft(): void;
  scrollRight(): void;
  nextMatch(): boolean;
  prevMatch(): boolean;
  clearSearch(): void;
}

export interface TreeView {
  moveDown(): void;
  moveUp(): void;
  collapse(): void;
  expand(): void;
  collapseAll(): void;
  expandAll(): void;
  close(): void;
  openSearch(): void;
  closeSearch(): void;
  openSelection(): void;
  toggleOverlay(): void;
  selectFirst(): void;
  selectLast(): void;
  appendSearchChar(char: string): void;
  backspaceSearch(): void;
  createNote?(): void;
  createNoteAtCurrent?(): void;
  createDirectory?(): void;
  renameSelection?(): void;
  toggleMark?(): void;
  clearMarks?(): void;
  moveMarks?(): void;
  deleteSelection?(): void;
  manageTemplates?(): void;
  closeTemplates?(): void;
  nextTemplate?(): void;
  previousTemplate?(): void;
  openTemplate?(): void;
  renameTemplate?(): void;
  deleteTemplate?(): void;
}

export interface VaultDialogView {
  cancel(): void;
  submit(): void;
  next(): void;
  previous(): void;
  ignore(): void;
}

export interface QuickOpenView {
  open(): void;
  close(): void;
  moveNext(): void;
  movePrevious(): void;
  accept(index?: number): void;
  setQuery(query: string): void;
}

export interface VaultView {
  open(): void;
  close(): void;
}

export interface PaletteView {
  open(): void;
  close(): void;
  moveNext(): void;
  movePrevious(): void;
  accept(): void;
  setQuery(query: string): void;
}

export interface SearchView {
  open(): void;
  openGlobal(): void;
  close(): void;
  moveNext(): void;
  movePrevious(): void;
  accept(index?: number): void;
  setQuery(query: string): void;
}

export interface OutlineView {
  open(): void;
  close(): void;
  moveNext(): void;
  movePrevious(): void;
  accept(index?: number): void;
}

export interface LinksView {
  open(): void;
  close(): void;
  moveNext(): void;
  movePrevious(): void;
  accept(index?: number): void;
}

export interface ZoomView {
  fitWidth(): void;
  fitContentWidth(): void;
  fitPage(): void;
  zoomIn(): void;
  zoomOut(): void;
}

export interface CaretView {
  toggle(): boolean;
  exit(): boolean;
  moveDown(): void;
  moveUp(): void;
  moveLeft(): void;
  moveRight(): void;
  moveToStart(): void;
  moveToEnd(): void;
  jumpParaForward(): void;
  jumpParaBackward(): void;
  enterVisual(): boolean;
  exitVisual(): boolean;
  extendDown(): void;
  extendUp(): void;
  extendLeft(): void;
  extendRight(): void;
  yank(): boolean;
  setMark(char: string): void;
  jumpMark(char: string): boolean;
  nextMatch(): boolean;
  prevMatch(): boolean;
  smartJump(): boolean;
}

export interface EditorView {
  openCurrentNote(): Promise<void>;
}

export interface ThemeView {
  useSystem(): Promise<void>;
  useLight(): Promise<void>;
  useDark(): Promise<void>;
  cycle(): Promise<void>;
}

export interface CacheView {
  clearCurrentVault(): Promise<void>;
  clearApplication(): Promise<void>;
}

export interface CommandContext {
  readonly document: DocumentView;
  readonly contexts: ContextStack;
  readonly caret: CaretView;
  readonly editor: EditorView;
  readonly theme: ThemeView;
  readonly cache: CacheView;
  readonly zoom: ZoomView;
  readonly outline: OutlineView;
  readonly links: LinksView;
  readonly palette: PaletteView;
  readonly search: SearchView;
  readonly quickOpen: QuickOpenView;
  readonly tree: TreeView;
  readonly vault: VaultView;
  readonly vaultDialog?: VaultDialogView;
}

export type CommandExposure = 'action' | 'navigation' | 'internal';

export interface Command {
  readonly id: string;
  readonly title?: string;
  readonly exposure: CommandExposure;
  run(ctx: CommandContext, arg?: string): boolean | void;
}

type CommandRegistration = Omit<Command, 'exposure'> & {
  readonly exposure?: CommandExposure;
};
export type DispatchResult = 'handled' | 'pending' | 'unhandled';

const registry = new Map<string, Command>();

export const registerCommand = (command: CommandRegistration): void => {
  registry.set(command.id, { ...command, exposure: command.exposure ?? 'navigation' });
};

export const getCommand = (id: string): Command | undefined => registry.get(id);

export const hasCommand = (id: string): boolean => registry.has(id);

export const listCommands = (): readonly Command[] =>
  [...registry.values()].sort((left, right) => left.id.localeCompare(right.id));

export const listPaletteCommands = (): readonly Command[] =>
  listCommands().filter((command) => command.exposure === 'action');

export const listRemappableCommands = (): readonly Command[] =>
  listCommands().filter((command) => command.exposure !== 'internal');
