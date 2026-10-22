// Browser end-to-end check with Playwright (playwright-core) and axe-core:
// makes a plan, visits every tab in every theme, and reports accessibility
// violations, including colour contrast, which jsdom cannot measure.
// Usage: npm run test:e2e -- [base-url]   (CHROME_PATH overrides the browser)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { chromium } from 'playwright-core';

const base = (process.argv[2] ?? 'http://localhost:8080').replace(/\/$/, '');
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chromium' },
);

let failures = 0;
const consoleErrors = [];

async function audit(page, label) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const { violations } = await window.axe.run(document, { resultTypes: ['violations'] });
    return violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(' ')}`);
  });
  if (result.length > 0) failures += 1;
  console.log(
    `${result.length === 0 ? 'PASS' : 'FAIL'} axe ${label}${result.length ? `\n  ${result.join('\n  ')}` : ''}`,
  );
}

for (const [theme, width] of [
  ['light', 1440],
  ['dark', 1440],
  ['contrast', 1440],
  ['light', 390],
]) {
  // bypassCSP lets the test inject axe-core; the app's own CSP blocks inline scripts.
  const context = await browser.newContext({ viewport: { width, height: 900 }, bypassCSP: true });
  await context.addInitScript((t) => {
    localStorage.setItem('utsav:v1:settings', JSON.stringify({ theme: t, reading: 'standard' }));
  }, theme);
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${theme}/${width}: ${m.text()}`);
  });
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await audit(page, `home ${theme} ${width}px`);
  await page.goto(`${base}/#/new/birthday`, { waitUntil: 'networkidle' });
  await page.waitForSelector('form');
  await audit(page, `form ${theme} ${width}px`);
  await page.getByRole('button', { name: 'Create my plan' }).click();
  await page.waitForURL(/#\/plan\//, { timeout: 60_000 });
  for (const tab of ['Overview', 'Budget', 'Timeline', 'Vendors', 'Ideas']) {
    await page.getByRole('tab', { name: tab }).click();
    await page.waitForSelector('#plan-panel .panel');
    await audit(page, `${tab.toLowerCase()} ${theme} ${width}px`);
  }
  await page.getByRole('button', { name: 'Refine with AI' }).click();
  await page.waitForSelector('dialog[open]');
  await audit(page, `refine dialog ${theme} ${width}px`);
  await context.close();
}

if (consoleErrors.length > 0) {
  failures += 1;
  console.log(`FAIL console errors:\n  ${consoleErrors.join('\n  ')}`);
}
await browser.close();
process.exit(failures > 0 ? 1 : 0);
