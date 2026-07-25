import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { cleanupApp, currentEnv, expectSurfaceRendered, launchApp } from './support/electron';

test.afterEach(cleanupApp);

const createVault = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-help-vault-'));
  await fs.writeFile(path.join(root, 'index.typ'), '= Keyboard Help\n\nFirst note.\n', 'utf8');
  return root;
};

test('shows keyboard help after the first vault open and remembers acknowledgement', async () => {
  const vaultRoot = await createVault();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-help-userdata-'));
  const env = {
    ...currentEnv(),
    FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
    FOLEA_TEST_VAULT_PATH: vaultRoot,
    FOLEA_TEST_SKIP_FIRST_RUN_HELP: '0'
  };

  try {
    let app = await launchApp(env, [`--user-data-dir=${userDataDir}`]);
    let page = await app.firstWindow();

    await expectSurfaceRendered(page);
    await expect(page.getByTestId('keyboard-help-overlay')).toBeVisible();
    const helpBox = await page.getByTestId('keyboard-help-overlay').boundingBox();
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(helpBox!.width).toBeCloseTo(Math.min(viewport.width - 24, 1200), 0);
    expect(Math.abs(helpBox!.x + helpBox!.width / 2 - viewport.width / 2)).toBeLessThan(1);
    expect(helpBox!.height / viewport.height).toBeGreaterThan(0.85);
    await expect(page.getByTestId('keyboard-help-overlay')).not.toContainText('Global shortcuts');
    await expect(page.getByTestId('keyboard-help-overlay')).not.toContainText('· current');
    await expect(page.getByTestId('keyboard-help-overlay')).not.toContainText('view.toggleTree');
    await expect(page.locator('[data-command-id="view.toggleTree"]')).toBeVisible();
    await expect(page.locator('[data-help-group="movement"]')).toContainText('Movement');
    await expect(page.locator('[data-help-group="navigation"]')).toContainText('Navigation');
    await expect(page.locator('.keyboard-help-header, .keyboard-help-footer')).toHaveCount(0);
    const overlayStyle = await page.getByTestId('keyboard-help-overlay').evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, backdropFilter: style.backdropFilter };
    });
    expect(overlayStyle.backgroundColor).not.toContain('rgba');
    expect(overlayStyle.backdropFilter).toBe('none');
    const helpRowHeight = (await page.getByTestId('keyboard-help-row').first().boundingBox())!
      .height;
    const bodyBox = await page.getByTestId('keyboard-help-body').boundingBox();
    const tabBoxes = await page.getByTestId('keyboard-help-tab').evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      })
    );
    expect(tabBoxes[0]!.y).toBeLessThan(bodyBox!.y);
    expect(tabBoxes[0]!.height).toBeLessThanOrEqual(38);
    const tabsLeft = tabBoxes[0]!.x;
    const tabsRight = tabBoxes.at(-1)!.x + tabBoxes.at(-1)!.width;
    expect(Math.abs((tabsLeft + tabsRight) / 2 - (helpBox!.x + helpBox!.width / 2))).toBeLessThan(
      2
    );
    const groupBoxes = await page.locator('.keyboard-help-group').evaluateAll((elements) =>
      elements.slice(0, 3).map((element) => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y };
      })
    );
    expect(Math.abs(groupBoxes[0]!.y - groupBoxes[1]!.y)).toBeLessThan(2);
    expect(Math.abs(groupBoxes[0]!.y - groupBoxes[2]!.y)).toBeLessThan(2);
    expect(groupBoxes[1]!.x).toBeGreaterThan(groupBoxes[0]!.x);
    expect(groupBoxes[2]!.x).toBeGreaterThan(groupBoxes[1]!.x);
    const gridBox = await page.locator('.keyboard-help-grid').boundingBox();
    expect(gridBox!.width).toBeLessThanOrEqual(1070);
    expect(
      Math.abs(gridBox!.x + gridBox!.width / 2 - (helpBox!.x + helpBox!.width / 2))
    ).toBeLessThan(1);
    const visualMetrics = await page.evaluate(() => {
      const overlay = document.querySelector<HTMLElement>('.keyboard-help-overlay')!;
      const group = document.querySelector<HTMLElement>('.keyboard-help-group')!;
      const heading = group.querySelector<HTMLElement>('h2')!;
      const rows = [...document.querySelectorAll<HTMLElement>('.keyboard-help-row')];
      const firstRowStyle = getComputedStyle(rows[0]!);
      const lastRowStyle = getComputedStyle(rows.at(-1)!);
      const headingStyle = getComputedStyle(heading);
      const heights = rows.map((row) => row.getBoundingClientRect().height);

      return {
        groupBackground: getComputedStyle(group).backgroundColor,
        overlayBackground: getComputedStyle(overlay).backgroundColor,
        groupBorderWidth: getComputedStyle(group).borderTopWidth,
        headingRuleColor: headingStyle.borderBottomColor,
        headingRuleWidth: headingStyle.borderBottomWidth,
        rowRuleColor: firstRowStyle.borderBottomColor,
        rowRuleWidth: firstRowStyle.borderBottomWidth,
        lastRowRuleWidth: lastRowStyle.borderBottomWidth,
        bindingAlignment: getComputedStyle(rows[0]!.querySelector('.keyboard-help-bindings')!)
          .justifyContent,
        titleAlignment: getComputedStyle(rows[0]!.querySelector('.keyboard-help-title')!).textAlign,
        rowHeightRange: Math.max(...heights) - Math.min(...heights)
      };
    });
    expect(visualMetrics.groupBackground).not.toBe(visualMetrics.overlayBackground);
    expect(visualMetrics.groupBorderWidth).toBe('1px');
    expect(visualMetrics.headingRuleColor).toBe(visualMetrics.rowRuleColor);
    expect(visualMetrics.headingRuleWidth).toBe('1px');
    expect(visualMetrics.rowRuleWidth).toBe('1px');
    expect(visualMetrics.lastRowRuleWidth).toBe('1px');
    expect(visualMetrics.bindingAlignment).toBe('flex-end');
    expect(visualMetrics.titleAlignment).toBe('left');
    expect(visualMetrics.rowHeightRange).toBeLessThanOrEqual(0.5);
    await expect(
      page.getByTestId('keyboard-help-row').first().locator(':scope > :first-child')
    ).toHaveClass(/keyboard-help-title/);
    await expect(
      page.getByTestId('keyboard-help-tab').filter({ hasText: 'Reading' })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByTestId('keyboard-help-row').filter({ hasText: 'Navigate back' })
    ).toContainText('Backspace');
    await expect
      .poll(async () => {
        const state = JSON.parse(
          await fs.readFile(path.join(userDataDir, 'state.json'), 'utf8')
        ) as {
          hasSeenKeyboardHelp?: boolean;
        };
        return state.hasSeenKeyboardHelp;
      })
      .toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('keyboard-help-overlay')).toHaveCount(0);
    await page.keyboard.type(':');
    await expect(page.getByTestId('palette-overlay')).toBeVisible();
    const paletteRowHeight = (await page
      .locator('[data-testid="palette-row"][data-command-id="view.toggleTree"]')
      .boundingBox())!.height;
    expect(Math.abs(helpRowHeight - paletteRowHeight)).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    await cleanupApp();

    app = await launchApp(env, [`--user-data-dir=${userDataDir}`]);
    page = await app.firstWindow();
    await expectSurfaceRendered(page);
    await expect(page.getByTestId('keyboard-help-overlay')).toHaveCount(0);
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('opens contextually, switches tabs, restores the parent, and shows remaps', async () => {
  const vaultRoot = await createVault();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folea-e2e-help-userdata-'));
  await fs.writeFile(path.join(userDataDir, 'keys.config'), 'document.scrollLineDown F8\n', 'utf8');

  try {
    const app = await launchApp(
      {
        ...currentEnv(),
        FOLEA_ALLOW_TEST_VAULT_OPEN: '1',
        FOLEA_TEST_VAULT_PATH: vaultRoot,
        FOLEA_TEST_USER_DATA_DIR: userDataDir
      },
      [`--user-data-dir=${userDataDir}`]
    );
    const page = await app.firstWindow();
    await expectSurfaceRendered(page);

    await page.keyboard.press('Control+b');
    await expect(page.getByTestId('tree-overlay')).toBeVisible();
    await page.keyboard.type('?');

    const help = page.getByTestId('keyboard-help-overlay');
    await expect(help).toBeVisible();
    await expect(page.getByTestId('keyboard-help-tab').filter({ hasText: 'Tree' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.locator('[data-help-group="movement"]')).toBeVisible();
    await expect(page.locator('[data-help-group="folders"]')).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(
      page.getByTestId('keyboard-help-tab').filter({ hasText: 'Panels' })
    ).toHaveAttribute('aria-selected', 'true');
    const clippedPanelTitles = await page
      .locator('.keyboard-help-title')
      .evaluateAll(
        (elements) =>
          elements.filter((element) => element.scrollWidth > element.clientWidth + 1).length
      );
    expect(clippedPanelTitles).toBe(0);
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('keyboard-help-tab').filter({ hasText: 'Tree' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await page.keyboard.press('ArrowRight');
    await expect(
      page.getByTestId('keyboard-help-tab').filter({ hasText: 'Panels' })
    ).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('keyboard-help-tab').filter({ hasText: 'Tree' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    const selectionTab = page.getByTestId('keyboard-help-tab').filter({ hasText: 'Selection' });
    const selectionBox = await selectionTab.boundingBox();
    expect(selectionBox).not.toBeNull();
    await page.mouse.click(
      selectionBox!.x + selectionBox!.width / 2,
      selectionBox!.y + selectionBox!.height / 2
    );
    await expect(selectionTab).toHaveAttribute('aria-selected', 'true');
    const helpBody = page.getByTestId('keyboard-help-body');
    await expect.poll(() => helpBody.evaluate((element) => element.scrollTop)).toBe(0);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => helpBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const afterArrow = await helpBody.evaluate((element) => element.scrollTop);
    await page.keyboard.press('k');
    await expect
      .poll(() => helpBody.evaluate((element) => element.scrollTop))
      .toBeLessThan(afterArrow);
    await page.keyboard.press('j');
    await expect.poll(() => helpBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
    await expect(help).toHaveCount(0);
    await expect(page.getByTestId('tree-overlay')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.keyboard.type('?');
    await expect(help).toBeVisible();
    await expect(page.locator('[data-command-id="document.scrollLineDown"]')).toContainText('F8');
    await expect(page.locator('[data-command-id="document.scrollLineDown"]')).not.toContainText(
      'j'
    );
    for (const width of [1100, 800, 640, 470, 360]) {
      await app.evaluate(({ BrowserWindow }, nextWidth) => {
        BrowserWindow.getAllWindows()[0]!.setSize(nextWidth, 620);
      }, width);
      await expect.poll(() => page.evaluate(() => innerWidth)).toBeGreaterThanOrEqual(width - 40);

      const adaptiveLayout = await help.evaluate((overlay) => {
        const body = overlay.querySelector<HTMLElement>('.keyboard-help-body')!;
        const tabs = overlay.querySelector<HTMLElement>('.keyboard-help-tabs')!;
        const grid = overlay.querySelector<HTMLElement>('.keyboard-help-grid')!;
        const groups = [...overlay.querySelectorAll<HTMLElement>('.keyboard-help-group')];
        const rows = [...overlay.querySelectorAll<HTMLElement>('.keyboard-help-row')];
        const firstRow = rows[0]!;
        const title = firstRow.querySelector<HTMLElement>('.keyboard-help-title')!;
        const bindings = firstRow.querySelector<HTMLElement>('.keyboard-help-bindings')!;
        const overlayBox = overlay.getBoundingClientRect();
        const gridBox = grid.getBoundingClientRect();
        const firstGroup = groups[0]!.getBoundingClientRect();
        const secondGroup = groups[1]!.getBoundingClientRect();
        const titleBox = title.getBoundingClientRect();
        const bindingBox = bindings.getBoundingClientRect();

        return {
          bindingLabelsOverflow: [
            ...overlay.querySelectorAll<HTMLElement>('.keyboard-help-binding')
          ].some((binding) => binding.scrollWidth > binding.clientWidth),
          bodyOverflowsHorizontally: body.scrollWidth > body.clientWidth,
          gridDisplay: getComputedStyle(grid).display,
          groupOverflowsGrid: groups.some((group) => {
            const box = group.getBoundingClientRect();
            return box.left < gridBox.left - 0.5 || box.right > gridBox.right + 0.5;
          }),
          overlayOverflowsViewport:
            overlayBox.left < -0.5 ||
            overlayBox.right > innerWidth + 0.5 ||
            overlayBox.top < -0.5 ||
            overlayBox.bottom > innerHeight + 0.5,
          rowContentsOverlap: rows.some((row) => {
            const rowTitle = row.querySelector<HTMLElement>('.keyboard-help-title')!;
            const rowBindings = row.querySelector<HTMLElement>('.keyboard-help-bindings')!;
            return (
              rowTitle.getBoundingClientRect().right >
              rowBindings.getBoundingClientRect().left + 0.5
            );
          }),
          rowHeight: firstRow.getBoundingClientRect().height,
          rowOverflowsGroup: rows.some((row) => {
            const rowBox = row.getBoundingClientRect();
            const groupBox = row.closest('.keyboard-help-group')!.getBoundingClientRect();
            return rowBox.left < groupBox.left - 0.5 || rowBox.right > groupBox.right + 0.5;
          }),
          sectionsAreStacked: secondGroup.top > firstGroup.bottom,
          tabsOverflowHorizontally: tabs.scrollWidth > tabs.clientWidth,
          titleAndBindingsShareRow:
            Math.abs(
              titleBox.top + titleBox.height / 2 - (bindingBox.top + bindingBox.height / 2)
            ) < 1,
          viewportWidth: innerWidth
        };
      });

      expect(adaptiveLayout.overlayOverflowsViewport).toBe(false);
      expect(adaptiveLayout.tabsOverflowHorizontally).toBe(false);
      expect(adaptiveLayout.bodyOverflowsHorizontally).toBe(false);
      expect(adaptiveLayout.groupOverflowsGrid).toBe(false);
      expect(adaptiveLayout.rowOverflowsGroup).toBe(false);
      expect(adaptiveLayout.rowContentsOverlap).toBe(false);
      expect(adaptiveLayout.bindingLabelsOverflow).toBe(false);
      expect(adaptiveLayout.rowHeight).toBeLessThan(40);
      if (adaptiveLayout.viewportWidth <= 680) {
        expect(adaptiveLayout.gridDisplay).toBe('flex');
        expect(adaptiveLayout.sectionsAreStacked).toBe(true);
        expect(adaptiveLayout.titleAndBindingsShareRow).toBe(true);
      } else {
        expect(adaptiveLayout.gridDisplay).toBe('grid');
      }
    }
    await page.keyboard.type('?');
    await expect(help).toHaveCount(0);

    await page.keyboard.type(':');
    await expect(page.getByTestId('palette-overlay')).toBeVisible();
    await page.keyboard.type('?');
    await expect(page.getByTestId('palette-input')).toHaveValue('?');
    await expect(help).toHaveCount(0);
  } finally {
    await fs.rm(vaultRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
});
