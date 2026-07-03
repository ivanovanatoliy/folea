import type { RenderArtifact, TextLayerModel } from '../../shared/worker/typst';

export const extractTextLayerModel = (svg: string, artifact: RenderArtifact): TextLayerModel => {
  const text = extractTextLayerText(svg);

  return {
    version: 1,
    text,
    spans: [],
    pages: [{ page: 0, width: artifact.width, height: artifact.height }]
  };
};

const extractTextLayerText = (svg: string): string => {
  const selectableText = Array.from(
    svg.matchAll(/<h5:(div|span)\b(?=[^>]*\bclass="[^"]*\btsel\b)[^>]*>([\s\S]*?)<\/h5:\1>/g),
    (match) => stripMarkup(match[2] ?? '')
  ).filter((value) => value.length > 0);

  if (selectableText.length > 0) {
    return selectableText.join('');
  }

  return Array.from(svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g), (match) =>
    stripMarkup(match[1] ?? '')
  )
    .filter((value) => value.length > 0)
    .join('\n');
};

const stripMarkup = (value: string): string =>
  decodeEntities(
    value
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );

const decodeEntities = (value: string): string =>
  value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
