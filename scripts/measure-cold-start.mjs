import { _electron as electron } from 'playwright';

const startedAt = performance.now();
const electronApp = await electron.launch({
  args: [process.cwd()]
});

try {
  const page = await electronApp.firstWindow();
  await page.getByTestId('folea-shell').waitFor({ state: 'visible' });
  const elapsedMs = Math.round(performance.now() - startedAt);
  console.log(`cold start: ${elapsedMs} ms`);
} finally {
  await electronApp.close();
}
