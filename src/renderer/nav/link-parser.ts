export type LinkEdgeKind = 'link' | 'import' | 'include';

export interface ParsedRef {
  readonly rawTarget: string;
  readonly kind: LinkEdgeKind;
}

const SKIP_PREFIXES = ['http://', 'https://', '#', '@'];

const shouldSkipTarget = (target: string): boolean =>
  target.length === 0 || SKIP_PREFIXES.some((p) => target.startsWith(p));

// Best-effort comment stripping: block comments first, then line comments.
// Does not handle comment markers inside string literals — documented limitation.
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');

/** Extract every parseable #link / #import / #include string-literal target from one note's source. */
export function parseRefs(source: string): readonly ParsedRef[] {
  const stripped = stripComments(source);
  const refs: ParsedRef[] = [];

  // #link("TARGET") or #link("TARGET")[body] — only string-literal first arg
  const linkRe = /#link\(\s*"([^"]*)"\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(stripped)) !== null) {
    const target = m[1];
    if (target !== undefined && !shouldSkipTarget(target)) {
      refs.push({ rawTarget: target, kind: 'link' });
    }
  }

  // #import "TARGET" / #import "TARGET": ... / #import "TARGET" as ...
  const importRe = /#import\s+"([^"]*)"/g;
  while ((m = importRe.exec(stripped)) !== null) {
    const target = m[1];
    if (target !== undefined && !shouldSkipTarget(target)) {
      refs.push({ rawTarget: target, kind: 'import' });
    }
  }

  // #include "TARGET"
  const includeRe = /#include\s+"([^"]*)"/g;
  while ((m = includeRe.exec(stripped)) !== null) {
    const target = m[1];
    if (target !== undefined && !shouldSkipTarget(target)) {
      refs.push({ rawTarget: target, kind: 'include' });
    }
  }

  return refs;
}
