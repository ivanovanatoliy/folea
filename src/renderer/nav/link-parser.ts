import { parseTypstReferences, type TypstReferenceKind } from '../../shared/typst-links';

export type LinkEdgeKind = TypstReferenceKind;

export interface ParsedRef {
  readonly rawTarget: string;
  readonly kind: LinkEdgeKind;
}

/** Extract every safely recognized #link / #import / #include string target. */
export const parseRefs = (source: string): readonly ParsedRef[] =>
  parseTypstReferences(source).map(({ rawTarget, kind }) => ({ rawTarget, kind }));

export { parseTypstReferences } from '../../shared/typst-links';
