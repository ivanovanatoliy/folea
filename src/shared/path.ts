export interface SafeRelativePosixPathOptions {
  readonly label?: string;
  readonly allowLeadingSlash?: boolean;
  readonly allowedSuffixes?: readonly string[];
}

export const assertSafeRelativePosixPath = (
  value: string,
  options: SafeRelativePosixPathOptions = {}
): string => {
  const label = options.label ?? 'path';

  if (value.length === 0 || value.includes('\0')) {
    throw new TypeError(`${label} must be non-empty`);
  }

  if (value.includes('\\')) {
    throw new TypeError(`${label} must be POSIX-style`);
  }

  if (value.startsWith('/') && options.allowLeadingSlash !== true) {
    throw new TypeError(`${label} must be relative`);
  }

  const relativePath = value.startsWith('/') ? value.slice(1) : value;

  if (relativePath.length === 0 || /^[A-Za-z]:\//.test(relativePath)) {
    throw new TypeError(`${label} must be relative`);
  }

  const segments = relativePath.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new TypeError(`${label} must not contain empty, dot, or traversal segments`);
  }

  if (
    options.allowedSuffixes &&
    !options.allowedSuffixes.some((suffix) => relativePath.endsWith(suffix))
  ) {
    throw new TypeError(`${label} must use an allowed file suffix`);
  }

  return relativePath;
};
