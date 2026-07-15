import { OBSIDIAN_TEMPLATE_IMPORT_PLACEHOLDER } from './obsidian-typst';

export type TypstReferenceKind = 'link' | 'import' | 'include';

export interface TypstReferenceRange {
  readonly rawTarget: string;
  readonly kind: TypstReferenceKind;
  readonly start: number;
  readonly end: number;
  readonly targetStart: number;
  readonly targetEnd: number;
  readonly bodyStart?: number;
  readonly bodyEnd?: number;
  readonly safeToRemove: boolean;
}

export interface TypstRewriteResult {
  readonly source: string;
  readonly updated: number;
  readonly warnings: readonly string[];
}

const SKIP_PREFIXES = ['http://', 'https://', '#', '@'];

const maskComments = (source: string): string => {
  const chars = [...source];
  let index = 0;
  let quote = false;
  while (index < chars.length) {
    if (quote) {
      if (chars[index] === '\\') {
        index += 2;
        continue;
      }
      if (chars[index] === '"') quote = false;
      index++;
      continue;
    }
    if (chars[index] === '"') {
      quote = true;
      index++;
      continue;
    }
    if (chars[index] === '/' && chars[index + 1] === '/') {
      while (index < chars.length && chars[index] !== '\n') chars[index++] = ' ';
      continue;
    }
    if (chars[index] === '/' && chars[index + 1] === '*') {
      chars[index++] = ' ';
      chars[index++] = ' ';
      while (index < chars.length && !(chars[index] === '*' && chars[index + 1] === '/')) {
        if (chars[index] !== '\n') chars[index] = ' ';
        index++;
      }
      if (index < chars.length) {
        chars[index++] = ' ';
        chars[index++] = ' ';
      }
      continue;
    }
    index++;
  }
  return chars.join('');
};

const findBalancedBody = (
  source: string,
  open: number
): { readonly start: number; readonly end: number } | undefined => {
  if (source[open] !== '[') return undefined;
  let depth = 0;
  let quote = false;
  for (let index = open; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === '"') quote = false;
      continue;
    }
    if (char === '"') quote = true;
    else if (char === '[') depth++;
    else if (char === ']' && --depth === 0) return { start: open + 1, end: index };
  }
  return undefined;
};

const isCodePosition = (source: string, position: number): boolean => {
  let quote = false;
  for (let index = 0; index < position; index++) {
    if (quote && source[index] === '\\') {
      index++;
    } else if (source[index] === '"') {
      quote = !quote;
    }
  }
  return !quote;
};

/** Parse the supported string-literal Typst references while preserving source ranges. */
export const parseTypstReferences = (source: string): readonly TypstReferenceRange[] => {
  const masked = maskComments(source);
  const refs: TypstReferenceRange[] = [];
  let match: RegExpExecArray | null;

  const linkPattern = /#link\(\s*"([^"\\]*)"\s*\)/g;
  while ((match = linkPattern.exec(masked)) !== null) {
    if (!isCodePosition(masked, match.index)) continue;
    const rawTarget = match[1] ?? '';
    if (rawTarget.length === 0 || SKIP_PREFIXES.some((prefix) => rawTarget.startsWith(prefix)))
      continue;
    const quotedOffset = match[0].indexOf('"') + 1;
    let end = match.index + match[0].length;
    let bodyStart: number | undefined;
    let bodyEnd: number | undefined;
    const body = findBalancedBody(source, end);
    if (body) {
      bodyStart = body.start;
      bodyEnd = body.end;
      end = body.end + 1;
    }
    refs.push({
      rawTarget,
      kind: 'link',
      start: match.index,
      end,
      targetStart: match.index + quotedOffset,
      targetEnd: match.index + quotedOffset + rawTarget.length,
      ...(bodyStart === undefined || bodyEnd === undefined ? {} : { bodyStart, bodyEnd }),
      safeToRemove: true
    });
  }

  const statementPattern = /#(import|include)\s+"([^"\\]*)"/g;
  while ((match = statementPattern.exec(masked)) !== null) {
    if (!isCodePosition(masked, match.index)) continue;
    const kind = match[1] as 'import' | 'include';
    const rawTarget = match[2] ?? '';
    if (
      rawTarget.length === 0 ||
      rawTarget === OBSIDIAN_TEMPLATE_IMPORT_PLACEHOLDER ||
      SKIP_PREFIXES.some((prefix) => rawTarget.startsWith(prefix))
    )
      continue;
    const quotedOffset = match[0].indexOf('"') + 1;
    const lineStart = source.lastIndexOf('\n', match.index - 1) + 1;
    const newline = source.indexOf('\n', match.index + match[0].length);
    const lineEnd = newline < 0 ? source.length : newline + 1;
    const line = masked.slice(lineStart, newline < 0 ? source.length : newline).trim();
    const safePattern =
      kind === 'include'
        ? /^#include\s+"[^"\\]*"\s*$/
        : /^#import\s+"[^"\\]*"(?:\s*:\s*[A-Za-z0-9_*,\s]+|\s+as\s+[A-Za-z_][A-Za-z0-9_]*)?\s*$/;
    refs.push({
      rawTarget,
      kind,
      start: lineStart,
      end: lineEnd,
      targetStart: match.index + quotedOffset,
      targetEnd: match.index + quotedOffset + rawTarget.length,
      safeToRemove: safePattern.test(line)
    });
  }

  return refs.sort((left, right) => left.start - right.start);
};

export const splitTypstTargetSuffix = (
  rawTarget: string
): { readonly path: string; readonly suffix: string } => {
  const index = rawTarget.search(/[?#]/);
  return index < 0
    ? { path: rawTarget, suffix: '' }
    : { path: rawTarget.slice(0, index), suffix: rawTarget.slice(index) };
};

const normalizeVaultPath = (value: string): string | null => {
  const parts: string[] = [];
  for (const part of value.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
};

const dirname = (value: string): string =>
  value.includes('/') ? value.slice(0, value.lastIndexOf('/')) : '';

export const resolveTypstReferencePath = (
  rawTarget: string,
  fromRelPath: string
): string | null => {
  const { path } = splitTypstTargetSuffix(rawTarget);
  if (path.length === 0) return null;
  return normalizeVaultPath(
    path.startsWith('/') ? path.slice(1) : `${dirname(fromRelPath)}/${path}`
  );
};

const mapPath = (relPath: string, mappings: ReadonlyMap<string, string>): string => {
  const direct = mappings.get(relPath);
  if (direct) return direct;
  const parents = [...mappings.keys()].sort((a, b) => b.length - a.length);
  for (const from of parents) {
    if (relPath.startsWith(`${from}/`))
      return `${mappings.get(from)!}${relPath.slice(from.length)}`;
  }
  return relPath;
};

const relativePath = (fromDir: string, to: string): string => {
  const fromParts = fromDir === '' ? [] : fromDir.split('/');
  const toParts = to.split('/');
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  )
    common++;
  const parts = [...fromParts.slice(common).map(() => '..'), ...toParts.slice(common)];
  return parts.join('/') || toParts.at(-1) || to;
};

export const rewriteTypstReferences = (
  source: string,
  fromBefore: string,
  fromAfter: string,
  mappings: ReadonlyMap<string, string>,
  kinds?: ReadonlySet<TypstReferenceKind>
): TypstRewriteResult => {
  const replacements: { start: number; end: number; text: string }[] = [];
  for (const ref of parseTypstReferences(source)) {
    if (kinds && !kinds.has(ref.kind)) continue;
    const parts = splitTypstTargetSuffix(ref.rawTarget);
    const resolved = resolveTypstReferencePath(ref.rawTarget, fromBefore);
    if (!resolved) continue;
    const extensionless = !parts.path.endsWith('.typ');
    const mapped = mapPath(resolved, mappings);
    const mappedWithExtension = extensionless ? mapPath(`${resolved}.typ`, mappings) : mapped;
    const effective =
      extensionless && mappedWithExtension !== `${resolved}.typ`
        ? mappedWithExtension.slice(0, -'.typ'.length)
        : mapped;
    const sourceMoved = fromBefore !== fromAfter;
    const targetMoved = effective !== resolved;
    if (!sourceMoved && !targetMoved) continue;
    const nextPath = parts.path.startsWith('/')
      ? `/${effective}`
      : relativePath(dirname(fromAfter), effective);
    const nextTarget = `${nextPath}${parts.suffix}`;
    if (nextTarget !== ref.rawTarget)
      replacements.push({ start: ref.targetStart, end: ref.targetEnd, text: nextTarget });
  }
  let rewritten = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    rewritten = `${rewritten.slice(0, replacement.start)}${replacement.text}${rewritten.slice(replacement.end)}`;
  }
  return { source: rewritten, updated: replacements.length, warnings: [] };
};

export const cleanupTypstReferences = (
  source: string,
  fromRelPath: string,
  deletedPaths: ReadonlySet<string>
): TypstRewriteResult => {
  const replacements: { start: number; end: number; text: string }[] = [];
  const warnings: string[] = [];
  for (const ref of parseTypstReferences(source)) {
    const resolved = resolveTypstReferencePath(ref.rawTarget, fromRelPath);
    if (!resolved) continue;
    const target = deletedPaths.has(resolved)
      ? resolved
      : deletedPaths.has(`${resolved}.typ`)
        ? `${resolved}.typ`
        : undefined;
    if (!target) continue;
    if (ref.kind === 'link') {
      replacements.push({
        start: ref.start,
        end: ref.end,
        text: ref.bodyStart === undefined ? '' : source.slice(ref.bodyStart, ref.bodyEnd)
      });
    } else if (ref.safeToRemove) {
      replacements.push({ start: ref.start, end: ref.end, text: '' });
    } else {
      warnings.push(`${fromRelPath}: ambiguous #${ref.kind} was not removed`);
    }
  }
  let rewritten = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    rewritten = `${rewritten.slice(0, replacement.start)}${replacement.text}${rewritten.slice(replacement.end)}`;
  }
  return { source: rewritten, updated: replacements.length, warnings };
};
