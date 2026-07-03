// typst-for-obsidian stores downloaded Typst packages inside the vault at this path.
export const OBSIDIAN_TYPST_PACKAGE_CACHE_RELATIVE_PATH =
  '.obsidian/plugins/typst-for-obsidian/packages';

// typst-for-obsidian template notes conventionally live under this vault directory.
export const OBSIDIAN_TEMPLATE_DIRECTORY_RELATIVE_PATH = '_templates';

// Compatibility token observed in typst-for-obsidian template notes; see ADR-0011.
export const OBSIDIAN_TEMPLATE_IMPORT_PLACEHOLDER = '__TEMPLATE_IMPORT__';

// Default template target used by typst-for-obsidian-style template imports; see ADR-0011.
export const OBSIDIAN_DEFAULT_TEMPLATE_RELATIVE_PATH = '_typst/template.typ';

export const OBSIDIAN_TYPST_PACKAGE_CACHE_VIRTUAL_ROOT = `/${OBSIDIAN_TYPST_PACKAGE_CACHE_RELATIVE_PATH}`;
export const OBSIDIAN_TEMPLATE_DIRECTORY_VIRTUAL_ROOT = `/${OBSIDIAN_TEMPLATE_DIRECTORY_RELATIVE_PATH}`;
export const OBSIDIAN_DEFAULT_TEMPLATE_VIRTUAL_PATH = `/${OBSIDIAN_DEFAULT_TEMPLATE_RELATIVE_PATH}`;
