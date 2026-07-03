import { assertSafeRelativePosixPath } from '../../shared/path';

export const toVirtualTypstPath = (path: string): string =>
  `/${assertSafeRelativePosixPath(path, {
    label: 'Typst source path',
    allowLeadingSlash: true
  })}`;

export const fromVirtualTypstPath = (path: string): string =>
  assertSafeRelativePosixPath(path, {
    label: 'Typst source path',
    allowLeadingSlash: true
  });
