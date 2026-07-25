import type { KeymapSet } from '../../shared/keys-config';
import { getCommand, VAULT_DIALOG_KEYMAP, type InputContextName, type Keymap } from '../input';
import { formatChord } from '../input/binding-index';

export type HelpTabId = 'reading' | 'tree' | 'panels' | 'selection';

export interface HelpBindingRow {
  readonly commandId: string;
  readonly title: string;
  readonly bindings: readonly string[];
}

export interface HelpGroup {
  readonly id: string;
  readonly label: string;
  readonly rows: readonly HelpBindingRow[];
}

export interface HelpTab {
  readonly id: HelpTabId;
  readonly label: string;
  readonly groups: readonly HelpGroup[];
}

export interface HelpCatalog {
  readonly tabs: readonly HelpTab[];
}

interface HelpGroupDefinition {
  readonly id: string;
  readonly label: string;
  readonly commandIds: readonly string[];
}

interface HelpTabDefinition {
  readonly id: HelpTabId;
  readonly label: string;
  readonly keymaps: readonly (keyof KeymapSet | 'vaultDialog')[];
  readonly groups: readonly HelpGroupDefinition[];
}

const TAB_DEFINITIONS: readonly HelpTabDefinition[] = [
  {
    id: 'reading',
    label: 'Reading',
    keymaps: ['document'],
    groups: [
      {
        id: 'movement',
        label: 'Movement',
        commandIds: [
          'document.scrollLineDown',
          'document.scrollLineUp',
          'document.scrollHalfDown',
          'document.scrollHalfUp',
          'document.scrollToTop',
          'document.scrollToBottom',
          'document.scrollLeft',
          'document.scrollRight'
        ]
      },
      {
        id: 'navigation',
        label: 'Navigation',
        commandIds: [
          'document.historyBack',
          'document.historyForward',
          'view.toggleTree',
          'document.quickOpen',
          'document.outline',
          'document.links'
        ]
      },
      {
        id: 'search',
        label: 'Search',
        commandIds: [
          'search.open',
          'document.nextMatch',
          'document.prevMatch',
          'document.clearSearch'
        ]
      },
      {
        id: 'actions',
        label: 'Actions',
        commandIds: [
          'caret.toggle',
          'palette.open',
          'editor.open',
          'tree.createNoteAtCurrent',
          'app.showKeyboardHelp'
        ]
      },
      {
        id: 'zoom',
        label: 'Zoom',
        commandIds: ['zoom.fitWidth', 'zoom.fitContentWidth', 'zoom.in', 'zoom.out']
      }
    ]
  },
  {
    id: 'tree',
    label: 'Tree',
    keymaps: ['tree', 'treeSearch', 'templates'],
    groups: [
      {
        id: 'movement',
        label: 'Movement',
        commandIds: [
          'tree.moveDown',
          'tree.moveUp',
          'tree.selectFirst',
          'tree.selectLast',
          'tree.openSelection',
          'tree.close'
        ]
      },
      {
        id: 'folders',
        label: 'Folders',
        commandIds: ['tree.expand', 'tree.collapse', 'tree.expandAll', 'tree.collapseAll']
      },
      {
        id: 'files',
        label: 'Files',
        commandIds: [
          'tree.createNote',
          'tree.createNoteAtCurrent',
          'tree.createDirectory',
          'tree.rename',
          'tree.delete'
        ]
      },
      {
        id: 'marks',
        label: 'Marks',
        commandIds: ['tree.toggleMark', 'tree.clearMarks', 'tree.moveMarks']
      },
      {
        id: 'search',
        label: 'Search',
        commandIds: [
          'tree.openSearch',
          'tree.closeSearch',
          'tree.searchBackspace',
          'tree.searchAppend',
          'search.open'
        ]
      },
      {
        id: 'templates',
        label: 'Templates',
        commandIds: [
          'templates.moveNext',
          'templates.movePrevious',
          'templates.open',
          'templates.rename',
          'templates.delete',
          'templates.close'
        ]
      },
      {
        id: 'actions',
        label: 'Actions',
        commandIds: [
          'view.toggleTree',
          'palette.open',
          'document.quickOpen',
          'app.showKeyboardHelp'
        ]
      }
    ]
  },
  {
    id: 'panels',
    label: 'Panels',
    keymaps: ['palette', 'search', 'quickOpen', 'outline', 'links', 'vaultDialog'],
    groups: [
      {
        id: 'palette',
        label: 'Palette',
        commandIds: [
          'palette.open',
          'palette.moveNext',
          'palette.movePrevious',
          'palette.accept',
          'palette.close'
        ]
      },
      {
        id: 'search',
        label: 'Search',
        commandIds: [
          'search.open',
          'search.moveNext',
          'search.movePrevious',
          'search.accept',
          'search.close'
        ]
      },
      {
        id: 'quick-open',
        label: 'Quick open',
        commandIds: [
          'document.quickOpen',
          'quickOpen.moveNext',
          'quickOpen.movePrevious',
          'quickOpen.accept',
          'quickOpen.close'
        ]
      },
      {
        id: 'outline',
        label: 'Outline',
        commandIds: ['outline.moveNext', 'outline.movePrevious', 'outline.accept', 'outline.close']
      },
      {
        id: 'links',
        label: 'Links',
        commandIds: ['links.moveNext', 'links.movePrevious', 'links.accept', 'links.close']
      },
      {
        id: 'dialogs',
        label: 'Dialogs',
        commandIds: [
          'vaultDialog.next',
          'vaultDialog.previous',
          'vaultDialog.submit',
          'vaultDialog.cancel'
        ]
      }
    ]
  },
  {
    id: 'selection',
    label: 'Selection',
    keymaps: ['caret', 'visual'],
    groups: [
      {
        id: 'caret-movement',
        label: 'Caret movement',
        commandIds: [
          'caret.moveDown',
          'caret.moveUp',
          'caret.moveLeft',
          'caret.moveRight',
          'caret.moveToStart',
          'caret.moveToEnd',
          'caret.paraBackward',
          'caret.paraForward'
        ]
      },
      {
        id: 'visual',
        label: 'Visual mode',
        commandIds: [
          'caret.enterVisual',
          'visual.extendDown',
          'visual.extendUp',
          'visual.extendLeft',
          'visual.extendRight',
          'visual.extendParaBackward',
          'visual.extendParaForward',
          'visual.yank',
          'visual.exit'
        ]
      },
      {
        id: 'navigation',
        label: 'Navigation',
        commandIds: [
          'document.historyBack',
          'document.historyForward',
          'caret.smartJump',
          'caret.nextMatch',
          'caret.prevMatch',
          'caret.setMark',
          'caret.jumpMark'
        ]
      },
      {
        id: 'scroll',
        label: 'Scroll',
        commandIds: ['document.scrollHalfDown', 'document.scrollHalfUp']
      },
      {
        id: 'actions',
        label: 'Actions',
        commandIds: [
          'caret.exit',
          'palette.open',
          'search.open',
          'document.outline',
          'document.links',
          'editor.open',
          'app.showKeyboardHelp'
        ]
      },
      {
        id: 'zoom',
        label: 'Zoom',
        commandIds: ['zoom.fitWidth', 'zoom.fitContentWidth', 'zoom.in', 'zoom.out']
      }
    ]
  }
];

export const HELP_TAB_ORDER: readonly HelpTabId[] = TAB_DEFINITIONS.map(({ id }) => id);

const formatHelpChord = (chord: string): string => {
  if (chord === '*') return 'Any text';
  if (chord.endsWith('*')) return `${chord.slice(0, -1)}{key}`;
  return formatChord(chord);
};

export const buildHelpRows = (keymap: Keymap): readonly HelpBindingRow[] => {
  const rows = new Map<string, { title: string; bindings: string[] }>();

  for (const [chord, commandId] of keymap) {
    if (commandId === 'vaultDialog.ignore') continue;
    const existing = rows.get(commandId);
    const binding = formatHelpChord(chord);
    if (existing) {
      if (!existing.bindings.includes(binding)) existing.bindings.push(binding);
      continue;
    }

    const command = getCommand(commandId);
    rows.set(commandId, {
      title: command?.title ?? commandId,
      bindings: [binding]
    });
  }

  return [...rows].map(([commandId, row]) => ({
    commandId,
    title: row.title,
    bindings: row.bindings
  }));
};

export const helpTabForContext = (context: InputContextName): HelpTabId => {
  switch (context) {
    case 'tree':
    case 'tree-search':
    case 'templates':
      return 'tree';
    case 'palette':
    case 'search':
    case 'quick-open':
    case 'outline':
    case 'links':
    case 'vault-dialog':
      return 'panels';
    case 'caret':
    case 'visual':
      return 'selection';
    case 'document':
    case 'help':
      return 'reading';
  }
};

export const buildHelpCatalog = (keymaps: KeymapSet): HelpCatalog => {
  const keymapFor = (name: keyof KeymapSet | 'vaultDialog'): Keymap => {
    if (name === 'vaultDialog') return VAULT_DIALOG_KEYMAP;
    return keymaps[name] ?? new Map();
  };

  const effectiveKeymap = (local: Keymap): Keymap => {
    const effective = new Map(keymaps.global);
    for (const [chord, commandId] of local) effective.set(chord, commandId);
    return effective;
  };

  return {
    tabs: TAB_DEFINITIONS.map((tab) => {
      const available = new Map<string, HelpBindingRow>();
      for (const name of tab.keymaps) {
        for (const row of buildHelpRows(effectiveKeymap(keymapFor(name)))) {
          const existing = available.get(row.commandId);
          if (!existing) {
            available.set(row.commandId, row);
            continue;
          }

          available.set(row.commandId, {
            ...existing,
            bindings: [...new Set([...existing.bindings, ...row.bindings])]
          });
        }
      }

      return {
        id: tab.id,
        label: tab.label,
        groups: tab.groups.flatMap((group) => {
          const rows = group.commandIds.flatMap((commandId) => {
            const row = available.get(commandId);
            return row ? [row] : [];
          });
          return rows.length > 0 ? [{ id: group.id, label: group.label, rows }] : [];
        })
      };
    })
  };
};
