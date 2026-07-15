import { assertSafeRelativePosixPath } from '../path';
import type { VaultPath } from './vault-core';

const RESERVED_ENTRY_SEGMENTS = new Set([
  '.git',
  '.obsidian',
  '.folea',
  '.folea-cache',
  'node_modules'
]);

export const parseVaultEntryPath = (
  value: unknown,
  options: { readonly allowTemplates?: boolean } = {}
): VaultPath => {
  if (typeof value !== 'string') throw new TypeError('Vault entry path must be a string');
  const parsed = assertSafeRelativePosixPath(value, { label: 'Vault entry path' });
  const segments = parsed.split('/');
  if (segments.some((segment) => RESERVED_ENTRY_SEGMENTS.has(segment)))
    throw new TypeError('Vault entry path targets a reserved directory');
  if (options.allowTemplates !== true && segments[0] === '_templates')
    throw new TypeError('_templates is only available in template mode');
  return parsed;
};

export const parseVaultDirectoryPath = (value: unknown): VaultPath => parseVaultEntryPath(value);

export const parseVaultEntryName = (value: unknown, label = 'Vault entry name'): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('\0') ||
    /^[A-Za-z]:$/.test(value)
  )
    throw new TypeError(`${label} must be one non-empty path segment`);
  if (RESERVED_ENTRY_SEGMENTS.has(value) || value === '_templates')
    throw new TypeError(`${label} is reserved`);
  return value;
};
