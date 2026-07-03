import {
  OBSIDIAN_DEFAULT_TEMPLATE_RELATIVE_PATH,
  OBSIDIAN_DEFAULT_TEMPLATE_VIRTUAL_PATH,
  OBSIDIAN_TEMPLATE_DIRECTORY_VIRTUAL_ROOT,
  OBSIDIAN_TEMPLATE_IMPORT_PLACEHOLDER,
  OBSIDIAN_TYPST_PACKAGE_CACHE_VIRTUAL_ROOT
} from '../../shared/obsidian-typst';

import { FoleaTypstDiagnosticError } from './diagnostics';

export interface ResolvedCompatFile {
  readonly path: string;
  readonly contents: Uint8Array;
}

export const hasObsidianCompatFile = (
  _files: ReadonlyMap<string, Uint8Array>,
  virtualPath: string
): boolean => isObsidianTemplateImportAlias(virtualPath);

export const readObsidianCompatFile = (
  files: ReadonlyMap<string, Uint8Array>,
  virtualPath: string
): ResolvedCompatFile | undefined => {
  if (!isObsidianTemplateImportAlias(virtualPath)) {
    return undefined;
  }

  const contents = files.get(OBSIDIAN_DEFAULT_TEMPLATE_VIRTUAL_PATH);
  if (!contents) {
    throw new FoleaTypstDiagnosticError(
      `Obsidian template import "${OBSIDIAN_TEMPLATE_IMPORT_PLACEHOLDER}" in ${virtualPath} expected ${OBSIDIAN_DEFAULT_TEMPLATE_RELATIVE_PATH} in the vault snapshot`
    );
  }

  return {
    path: OBSIDIAN_DEFAULT_TEMPLATE_VIRTUAL_PATH,
    contents
  };
};

export const assertObsidianTemplateImportAvailable = (
  files: ReadonlyMap<string, Uint8Array>,
  mainVirtualPath: string,
  source: string
): void => {
  if (
    mainVirtualPath.startsWith(`${OBSIDIAN_TEMPLATE_DIRECTORY_VIRTUAL_ROOT}/`) &&
    source.includes(OBSIDIAN_TEMPLATE_IMPORT_PLACEHOLDER) &&
    !files.has(OBSIDIAN_DEFAULT_TEMPLATE_VIRTUAL_PATH)
  ) {
    throw new FoleaTypstDiagnosticError(
      `Obsidian template import "${OBSIDIAN_TEMPLATE_IMPORT_PLACEHOLDER}" in ${mainVirtualPath} expected ${OBSIDIAN_DEFAULT_TEMPLATE_RELATIVE_PATH} in the vault snapshot`
    );
  }
};

export const resolveObsidianPackageRoot = (
  files: ReadonlyMap<string, Uint8Array>,
  spec: unknown
): string => {
  const { namespace, name, version } = parsePackageSpec(spec);
  const packageRoot = `${OBSIDIAN_TYPST_PACKAGE_CACHE_VIRTUAL_ROOT}/${namespace}/${name}/${version}`;

  if (files.has(`${packageRoot}/typst.toml`)) {
    return packageRoot;
  }

  throw new FoleaTypstDiagnosticError(
    `@${namespace}/${name}:${version} not found in the vault's Typst package cache`
  );
};

const isObsidianTemplateImportAlias = (virtualPath: string): boolean =>
  virtualPath.startsWith(`${OBSIDIAN_TEMPLATE_DIRECTORY_VIRTUAL_ROOT}/`) &&
  virtualPath.endsWith(`/${OBSIDIAN_TEMPLATE_IMPORT_PLACEHOLDER}`);

const parsePackageSpec = (
  spec: unknown
): { readonly namespace: string; readonly name: string; readonly version: string } => {
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
    throw new FoleaTypstDiagnosticError('Malformed Typst package spec');
  }

  const record = spec as Record<string, unknown>;
  const namespace = record.namespace;
  const name = record.name;
  const version = record.version;

  if (typeof namespace !== 'string' || typeof name !== 'string' || typeof version !== 'string') {
    throw new FoleaTypstDiagnosticError('Malformed Typst package spec');
  }

  assertPackageSegment(namespace, 'namespace');
  assertPackageSegment(name, 'name');
  assertPackageSegment(version, 'version');

  return { namespace, name, version };
};

const assertPackageSegment = (value: string, label: string): void => {
  if (
    value.length === 0 ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('\0') ||
    value === '.' ||
    value === '..'
  ) {
    throw new FoleaTypstDiagnosticError(`Malformed Typst package ${label}`);
  }
};
