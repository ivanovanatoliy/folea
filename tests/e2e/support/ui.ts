import { expect, type Page } from '@playwright/test';

export const installCspViolationRecorder = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const target = window as Window & { __foleaCspViolations?: string[] };
    target.__foleaCspViolations = [];
    window.addEventListener('securitypolicyviolation', (event) => {
      target.__foleaCspViolations?.push(
        `${event.effectiveDirective}: ${event.blockedURI || 'inline'}`
      );
    });
  });
};

export const expectNoCspViolations = async (page: Page): Promise<void> => {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const target = window as Window & { __foleaCspViolations?: string[] };
        return target.__foleaCspViolations ?? [];
      })
    )
    .toEqual([]);
};

export const waitForSurfacePrefetched = (page: Page, noteId: string): Promise<boolean> =>
  page.evaluate(
    (expectedNoteId) =>
      new Promise<boolean>((resolve) => {
        window.addEventListener('folea:surface-prefetched', (event: Event) => {
          const detail = (event as CustomEvent<{ noteId: string; fromCache: boolean }>).detail;
          if (detail.noteId === expectedNoteId) resolve(detail.fromCache);
        });
      }),
    noteId
  );

export const selectedTreeRelPath = (page: Page): Promise<string | null> =>
  page.evaluate(
    () =>
      document
        .querySelector('[data-testid="tree-row"][data-selected="true"]')
        ?.getAttribute('data-relpath') ?? null
  );

export const selectTreeRow = async (page: Page, relPath: string): Promise<void> => {
  await page.keyboard.press('g');
  await page.keyboard.press('g');
  for (let attempt = 0; attempt < 200; attempt++) {
    if ((await selectedTreeRelPath(page)) === relPath) return;
    await page.keyboard.press('j');
  }
  throw new Error(`Unable to reach tree row: ${relPath}`);
};

export const clickLinkAndExpect = async (page: Page, targetText: string): Promise<void> => {
  const pseudo = page.getByTestId('typst-rendered-document').locator('.pseudo-link').first();
  const box = await pseudo.boundingBox();
  if (!box) throw new Error('pseudo-link not visible');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect
    .poll(() => page.getByTestId('typst-rendered-document').textContent(), { timeout: 10_000 })
    .toContain(targetText);
};
