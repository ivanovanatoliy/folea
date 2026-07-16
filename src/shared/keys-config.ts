export type KeymapLike = Map<string, string>;

export interface KeymapSet {
  readonly document: KeymapLike;
  readonly caret: KeymapLike;
  readonly visual: KeymapLike;
  readonly tree: KeymapLike;
  readonly treeSearch: KeymapLike;
  readonly palette: KeymapLike;
  readonly search: KeymapLike;
  readonly outline: KeymapLike;
  readonly links: KeymapLike;
  readonly quickOpen: KeymapLike;
  readonly global: KeymapLike;
  readonly templates?: KeymapLike;
}

export interface KeyBindingOverride {
  readonly context: string;
  readonly commandId: string;
  readonly chord: string;
}

export interface ParsedKeysConfig {
  readonly overrides: readonly KeyBindingOverride[];
  readonly warnings: readonly string[];
}

const CONTEXT_KEYS = [
  'document',
  'caret',
  'visual',
  'tree',
  'treeSearch',
  'palette',
  'search',
  'outline',
  'links',
  'quickOpen',
  'global',
  'templates'
] as const;

const CONTEXT_BY_COMMAND_NAMESPACE = new Map<string, keyof KeymapSet>([
  ['document', 'document'],
  ['caret', 'caret'],
  ['visual', 'visual'],
  ['tree', 'tree'],
  ['palette', 'palette'],
  ['search', 'search'],
  ['outline', 'outline'],
  ['links', 'links'],
  ['quickOpen', 'quickOpen'],
  ['view', 'global'],
  ['zoom', 'document'],
  ['editor', 'document'],
  ['app', 'global'],
  ['cache', 'global'],
  ['theme', 'global'],
  ['templates', 'templates']
]);

const NAMED_KEYS = new Set([
  'Enter',
  'Escape',
  'Backspace',
  'Space',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Delete',
  'Insert',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12'
]);

const isPrintableSingle = (char: string): boolean => char.length === 1 && char !== '\0';
const CANONICAL_NAMED_KEYS = new Set([...NAMED_KEYS].map((key) => key.toLowerCase()));
const isCanonicalCtrlKey = (key: string): boolean =>
  /^[a-z0-9]$/.test(key) || CANONICAL_NAMED_KEYS.has(key);

export const isValidChord = (chord: string): boolean => {
  if (chord.length === 0 || chord.includes('\0') || chord.includes(' ')) {
    return false;
  }

  let index = 0;
  let tokenCount = 0;

  while (index < chord.length) {
    const rest = chord.slice(index);
    if (rest.startsWith('<S-Space>')) {
      index += '<S-Space>'.length;
      tokenCount++;
      continue;
    }

    if (rest.startsWith('<C-')) {
      const close = rest.indexOf('>');
      if (close < 0) return false;
      const key = rest.slice(3, close);
      if (!isCanonicalCtrlKey(key)) return false;
      index += close + 1;
      tokenCount++;
      continue;
    }

    const named = [...NAMED_KEYS]
      .filter((candidate) => rest.startsWith(candidate))
      .sort((left, right) => right.length - left.length)[0];
    if (named) {
      index += named.length;
      tokenCount++;
      continue;
    }

    const char = rest[0];
    if (char === undefined || !isPrintableSingle(char) || char === '<') {
      return false;
    }

    index += 1;
    tokenCount++;
  }

  return tokenCount > 0;
};

const inferContext = (commandId: string): keyof KeymapSet | undefined => {
  const namespace = commandId.split('.')[0];
  return namespace ? CONTEXT_BY_COMMAND_NAMESPACE.get(namespace) : undefined;
};

export const parseKeysConfig = (
  content: string,
  knownCommandIds: ReadonlySet<string>
): ParsedKeysConfig => {
  const overrides: KeyBindingOverride[] = [];
  const warnings: string[] = [];

  content.split('\n').forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      return;
    }

    const match = /^([A-Za-z][A-Za-z0-9]*\.[A-Za-z0-9_.-]+)\s+(\S+)$/.exec(line);
    if (!match) {
      warnings.push(
        `keys.config:${lineNo}: invalid line, expected "<context>.<commandId> <chord>"`
      );
      return;
    }

    const commandId = match[1]!;
    const chord = match[2]!;
    const context = commandId.split('.')[0]!;

    if (!knownCommandIds.has(commandId)) {
      warnings.push(`keys.config:${lineNo}: unknown command "${commandId}", ignored`);
      return;
    }

    if (!isValidChord(chord)) {
      warnings.push(`keys.config:${lineNo}: invalid chord "${chord}", ignored`);
      return;
    }

    overrides.push({ context, commandId, chord });
  });

  return { overrides, warnings };
};

const cloneKeymaps = (defaults: KeymapSet): KeymapSet => ({
  document: new Map(defaults.document),
  caret: new Map(defaults.caret),
  visual: new Map(defaults.visual),
  tree: new Map(defaults.tree),
  treeSearch: new Map(defaults.treeSearch),
  palette: new Map(defaults.palette),
  search: new Map(defaults.search),
  outline: new Map(defaults.outline),
  links: new Map(defaults.links),
  quickOpen: new Map(defaults.quickOpen),
  global: new Map(defaults.global),
  ...(defaults.templates ? { templates: new Map(defaults.templates) } : {})
});

const contextsForCommand = (
  keymaps: KeymapSet,
  override: KeyBindingOverride
): (keyof KeymapSet)[] => {
  const found = CONTEXT_KEYS.filter((context) => {
    const keymap = keymaps[context];
    if (!keymap) return false;
    for (const commandId of keymap.values()) {
      if (commandId === override.commandId) {
        return true;
      }
    }

    return false;
  });

  if (found.length > 0) {
    return found;
  }

  const inferred = inferContext(override.commandId);
  return inferred ? [inferred] : [];
};

export const applyKeysConfigOverrides = (
  defaults: KeymapSet,
  parsed: ParsedKeysConfig
): { readonly keymaps: KeymapSet; readonly warnings: readonly string[] } => {
  const keymaps = cloneKeymaps(defaults);
  const warnings = [...parsed.warnings];
  const cleared = new Set<string>();

  for (const override of parsed.overrides) {
    const contexts = contextsForCommand(defaults, override);
    if (contexts.length === 0) {
      warnings.push(`keys.config: no default keymap contains "${override.commandId}", ignored`);
      continue;
    }

    for (const context of contexts) {
      const key = `${context}:${override.commandId}`;
      const keymap = keymaps[context];
      if (!keymap) continue;

      if (!cleared.has(key)) {
        for (const [chord, commandId] of [...keymap.entries()]) {
          if (commandId === override.commandId) {
            keymap.delete(chord);
          }
        }
        cleared.add(key);
      }

      const previous = keymap.get(override.chord);
      if (previous !== undefined && previous !== override.commandId) {
        warnings.push(
          `keys.config: chord "${override.chord}" in ${context} was rebound from "${previous}" to "${override.commandId}"`
        );
      }

      keymap.set(override.chord, override.commandId);
    }
  }

  return { keymaps, warnings };
};
