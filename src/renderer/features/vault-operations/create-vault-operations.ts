import type { Accessor, Setter } from 'solid-js';

import { parseVaultEntryName, type VaultTemplate } from '../../../shared/ipc/vault';
import type { VaultStateFileV1 } from '../../../shared/ipc/vault-state';
import { rewriteTypstReferences } from '../../../shared/typst-links';
import type { TreeRow } from '../../app/tree-model';
import type { VaultOperationDialogRequest } from '../../app/VaultOperationDialog';

type DialogResult = string | null | boolean | undefined;

interface VaultOperationsOptions {
  readonly selectedRow: Accessor<TreeRow | undefined>;
  readonly marks: Accessor<ReadonlySet<string>>;
  readonly setMarks: Setter<ReadonlySet<string>>;
  readonly selectedRelPath: Accessor<string>;
  readonly managedTemplates: Accessor<readonly VaultTemplate[]>;
  readonly setManagedTemplates: Setter<readonly VaultTemplate[]>;
  readonly selectedTemplateIndex: Accessor<number>;
  readonly setSelectedTemplateIndex: Setter<number>;
  readonly lastCreationTemplate: Accessor<string | null>;
  readonly setLastCreationTemplate: Setter<string | null>;
  readonly requestDialog: (request: VaultOperationDialogRequest) => Promise<DialogResult>;
  readonly requestText: (
    title: string,
    label: string,
    value: string,
    submitLabel: string,
    placeholder?: string
  ) => Promise<string | undefined>;
  readonly requestConfirmation: (
    title: string,
    message: string,
    submitLabel: string,
    destructive?: boolean
  ) => Promise<boolean>;
  readonly refreshVault: (state?: VaultStateFileV1) => Promise<void>;
  readonly selectNote: (relPath: string) => Promise<void>;
  readonly openTemplateManager: () => void;
  readonly reportError: (error: unknown) => void;
  readonly reportWarnings: (warnings: readonly string[]) => void;
  readonly onNoteCreated?: (relPath: string) => void;
}

export interface VaultOperations {
  createNote(directory: string): Promise<void>;
  createDirectory(directory?: string): Promise<void>;
  renameSelection(): Promise<void>;
  moveMarks(sources?: readonly string[], target?: TreeRow): Promise<void>;
  deleteSelection(sources?: readonly string[]): Promise<void>;
  manageTemplates(): Promise<void>;
  openTemplate(index?: number): Promise<void>;
  renameTemplate(index?: number): Promise<void>;
  deleteTemplate(index?: number): Promise<void>;
}

const parentDirectory = (relPath: string): string =>
  relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '';

export const createVaultOperations = (options: VaultOperationsOptions): VaultOperations => {
  const creationDirectory = (row = options.selectedRow()): string =>
    !row ? '' : row.kind === 'folder' ? row.relPath : parentDirectory(row.relPath);

  const createNote = async (directory: string): Promise<void> => {
    const rawName = await options.requestText(
      'Create note',
      'Note name',
      '',
      'Continue',
      'Note name'
    );
    if (rawName === undefined) return;
    try {
      const segment = parseVaultEntryName(rawName.trim(), 'Note name');
      const filename = segment.endsWith('.typ') ? segment : `${segment}.typ`;
      const templates = await window.folea.vault.templates();
      const previous = options.lastCreationTemplate();
      const selected = await options.requestDialog({
        kind: 'template',
        title: 'Choose template',
        templates,
        selectedRelPath: templates.some((template) => template.relPath === previous)
          ? previous
          : null,
        submitLabel: 'Create'
      });
      if (selected === undefined) return;
      const template =
        typeof selected === 'string'
          ? templates.find((candidate) => candidate.relPath === selected)
          : undefined;
      const relPath = directory === '' ? filename : `${directory}/${filename}`;
      const contents = template
        ? rewriteTypstReferences(
            template.contents,
            template.relPath,
            relPath,
            new Map(),
            new Set(['import', 'include'] as const)
          ).source
        : '';
      await window.folea.vault.create({ relPath, contents });
      const state = await window.folea.vaultState.update({
        type: 'templateSelected',
        relPath: template?.relPath ?? null
      });
      options.setLastCreationTemplate(state.lastCreationTemplate);
      await options.refreshVault(state);
      await options.selectNote(relPath);
      options.onNoteCreated?.(relPath);
    } catch (error) {
      options.reportError(error);
    }
  };

  return {
    createNote,
    async createDirectory(directoryOverride): Promise<void> {
      const rawName = await options.requestText(
        'Create directory',
        'Directory name',
        '',
        'Create',
        'Directory name'
      );
      if (rawName === undefined) return;
      try {
        const name = parseVaultEntryName(rawName.trim(), 'Directory name');
        const directory = directoryOverride ?? creationDirectory();
        await window.folea.vault.createDirectory({
          relPath: directory === '' ? name : `${directory}/${name}`
        });
        await options.refreshVault();
      } catch (error) {
        options.reportError(error);
      }
    },
    async renameSelection(): Promise<void> {
      const row = options.selectedRow();
      if (!row) return;
      const rawName = await options.requestText('Rename entry', 'New name', row.name, 'Rename');
      if (rawName === undefined) return;
      try {
        let name = parseVaultEntryName(rawName.trim(), 'New name');
        if (row.kind === 'note' && !name.endsWith('.typ')) name += '.typ';
        const parent = parentDirectory(row.relPath);
        const to = parent === '' ? name : `${parent}/${name}`;
        const impact = await window.folea.vault.analyzeOperation({
          operation: 'rename',
          sources: [row.relPath],
          destination: to
        });
        const updateReferences =
          impact.references.length === 0 ||
          (await options.requestConfirmation(
            'Update references',
            `${impact.references.length} references are affected. Update them?`,
            'Update'
          ));
        const result = await window.folea.vault.renameEntry({
          from: row.relPath,
          to,
          updateReferences
        });
        options.setMarks(
          (marks) => new Set([...marks].filter((mark) => mark !== row.relPath).concat(to))
        );
        await options.refreshVault();
        if (row.kind === 'note' && options.selectedRelPath() === row.relPath)
          await options.selectNote(to);
        options.reportWarnings(result.warnings);
      } catch (error) {
        options.reportError(error);
      }
    },
    async moveMarks(explicitSources, target = options.selectedRow()): Promise<void> {
      const sources = explicitSources ?? [...options.marks()];
      if (sources.length === 0) return;
      const destinationDirectory = target
        ? target.kind === 'folder'
          ? target.relPath
          : parentDirectory(target.relPath)
        : '';
      try {
        const impact = await window.folea.vault.analyzeOperation({
          operation: 'move',
          sources,
          destination: destinationDirectory
        });
        const updateReferences =
          impact.references.length === 0 ||
          (await options.requestConfirmation(
            'Update references',
            `${impact.references.length} references are affected. Update them?`,
            'Update'
          ));
        const result = await window.folea.vault.moveBatch({
          sources,
          destinationDirectory,
          updateReferences
        });
        options.setMarks(new Set<string>());
        await options.refreshVault();
        const selected = options.selectedRelPath();
        const mapping = result.mappings.find(
          (item) => selected === item.from || selected.startsWith(`${item.from}/`)
        );
        if (mapping) {
          const mapped = `${mapping.to}${selected.slice(mapping.from.length)}`;
          if (mapped.endsWith('.typ')) await options.selectNote(mapped);
        }
        options.reportWarnings(result.warnings);
      } catch (error) {
        options.reportError(error);
      }
    },
    async deleteSelection(explicitSources): Promise<void> {
      const row = options.selectedRow();
      const sources =
        explicitSources ??
        (options.marks().size > 0 ? [...options.marks()] : row ? [row.relPath] : []);
      if (sources.length === 0) return;
      try {
        const impact = await window.folea.vault.analyzeOperation({ operation: 'trash', sources });
        const summary = `${impact.counts.notes} notes, ${impact.counts.directories} directories, ${impact.counts.otherFiles} other files`;
        if (
          !(await options.requestConfirmation(
            'Move to trash',
            `Move ${summary} to the system trash?`,
            'Move to trash',
            true
          ))
        )
          return;
        const removeReferences =
          impact.references.length > 0 &&
          (await options.requestConfirmation(
            'Remove references',
            `Remove ${impact.references.length} external references too?`,
            'Remove references',
            true
          ));
        const result = await window.folea.vault.trashBatch({ sources, removeReferences });
        const succeeded = new Set(
          result.results.filter((item) => item.success).map((item) => item.source)
        );
        options.setMarks((marks) => new Set([...marks].filter((mark) => !succeeded.has(mark))));
        await options.refreshVault();
        options.reportWarnings([
          ...result.results
            .filter((item) => !item.success)
            .map((item) => `${item.source}: ${item.error ?? 'unable to trash'}`),
          ...result.warnings
        ]);
      } catch (error) {
        options.reportError(error);
      }
    },
    async manageTemplates(): Promise<void> {
      try {
        options.setManagedTemplates(await window.folea.vault.templates());
        options.setSelectedTemplateIndex(0);
        options.openTemplateManager();
      } catch (error) {
        options.reportError(error);
      }
    },
    async openTemplate(index = options.selectedTemplateIndex()): Promise<void> {
      const template = options.managedTemplates()[index];
      if (template) await window.folea.editor.open(template.relPath).catch(options.reportError);
    },
    async renameTemplate(index = options.selectedTemplateIndex()): Promise<void> {
      const template = options.managedTemplates()[index];
      if (!template) return;
      const rawName = await options.requestText(
        'Rename template',
        'New template name',
        template.name,
        'Rename'
      );
      if (rawName === undefined) return;
      try {
        const name = parseVaultEntryName(rawName.trim(), 'Template name');
        const to = `_templates/${name.endsWith('.typ') ? name : `${name}.typ`}`;
        await window.folea.vault.renameEntry({
          from: template.relPath,
          to,
          updateReferences: false,
          templateMode: true
        });
        options.setManagedTemplates(await window.folea.vault.templates());
        options.setLastCreationTemplate((current) => (current === template.relPath ? to : current));
      } catch (error) {
        options.reportError(error);
      }
    },
    async deleteTemplate(index = options.selectedTemplateIndex()): Promise<void> {
      const template = options.managedTemplates()[index];
      if (!template) return;
      if (
        !(await options.requestConfirmation(
          'Move template to trash',
          `Move template ${template.name} to the system trash?`,
          'Move to trash',
          true
        ))
      )
        return;
      try {
        const result = await window.folea.vault.trashBatch({
          sources: [template.relPath],
          templateMode: true
        });
        const failed = result.results.find((item) => !item.success);
        if (failed) throw new Error(failed.error ?? 'Unable to trash template');
        options.setManagedTemplates(await window.folea.vault.templates());
        options.setSelectedTemplateIndex((current) =>
          Math.min(current, Math.max(0, options.managedTemplates().length - 1))
        );
        if (options.lastCreationTemplate() === template.relPath)
          options.setLastCreationTemplate(null);
      } catch (error) {
        options.reportError(error);
      }
    }
  };
};
