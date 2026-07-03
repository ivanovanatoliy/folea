import { describe, expect, it } from 'vitest';

import { extractOutlineEntries } from '../../src/workers/typst-compile/outline';

describe('typst outline extraction', () => {
  it('maps queried headings onto selectable SVG text positions', () => {
    const queryResult = JSON.stringify([
      { level: 1, body: { text: 'Alpha' } },
      { level: 2, body: { text: 'Beta' } }
    ]);
    const svg = `
      <svg>
        <g class="typst-page" transform="translate(0, 0)">
          <g transform="translate(70.866,70.866)">
            <g transform="translate(0.000,10.996)">
              <foreignObject><h5:div class="tsel">Alpha</h5:div></foreignObject>
            </g>
          </g>
          <g transform="translate(70.866,97.702)">
            <g transform="translate(0.000,9.425)">
              <foreignObject><h5:div class="tsel">Beta</h5:div></foreignObject>
            </g>
          </g>
        </g>
      </svg>
    `;

    expect(extractOutlineEntries(queryResult, svg)).toEqual([
      { level: 1, text: 'Alpha', position: { page: 0, y: 81.862 } },
      { level: 2, text: 'Beta', position: { page: 0, y: 107.127 } }
    ]);
  });

  it('falls back safely when no matching SVG text exists', () => {
    const queryResult = JSON.stringify([{ level: 1, body: { text: 'Gamma' } }]);
    expect(extractOutlineEntries(queryResult, '<svg></svg>', 12)).toEqual([
      { level: 1, text: 'Gamma', position: { page: 0, y: 12 } }
    ]);
  });

  it('decodes nbsp and numeric entities before matching headings', () => {
    const queryResult = JSON.stringify([
      { level: 1, body: { text: 'Alpha Beta' } },
      { level: 2, body: { text: 'Section §' } }
    ]);
    const svg = `
      <svg>
        <g class="typst-page" transform="translate(0, 0)">
          <g transform="translate(10,20)">
            <foreignObject><h5:div class="tsel">Alpha&nbsp;Beta</h5:div></foreignObject>
          </g>
          <g transform="translate(10,40)">
            <foreignObject><h5:div class="tsel">Section &#167;</h5:div></foreignObject>
          </g>
        </g>
      </svg>
    `;

    expect(extractOutlineEntries(queryResult, svg)).toEqual([
      { level: 1, text: 'Alpha Beta', position: { page: 0, y: 20 } },
      { level: 2, text: 'Section §', position: { page: 0, y: 40 } }
    ]);
  });
});
