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

function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : `: ${detail}`}`);
}

// Behaviour in a real browser: exact budgets, and edits that survive a reload.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/#/new/birthday`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Create my plan' }).click();
  await page.waitForURL(/#\/plan\//, { timeout: 60_000 });
  await page.waitForFunction(() => localStorage.getItem('utsav:v1:plans') !== null);
  const budget = await page.evaluate(
    () => JSON.parse(localStorage.getItem('utsav:v1:plans') ?? '[]')[0]?.brief.budget,
  );
  await page.getByRole('tab', { name: 'Budget' }).click();
  await page
    .getByRole('textbox', { name: /^Planned for / })
    .first()
    .waitFor();
  const planned = async () => {
    const values = await page
      .getByRole('textbox', { name: /^Planned for / })
      .evaluateAll((inputs) => inputs.map((input) => Number(input.value.replace(/,/g, ''))));
    return values.reduce((sum, value) => sum + value, 0);
  };
  // Inputs show new amounts a render after the change, so give them a moment to settle.
  const addsUp = async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      if ((await planned()) === budget) return true;
      await page.waitForTimeout(100);
    }
    return false;
  };
  check('budget lines add up to the budget', await addsUp(), `${await planned()} vs ${budget}`);
  const first = page.getByRole('textbox', { name: /^Planned for / }).first();
  await first.fill('5000');
  await first.press('Enter');
  await page.getByText('Set by you').first().waitFor();
  check('still adds up after locking a line', await addsUp(), `${await planned()} vs ${budget}`);
  await page.getByRole('tab', { name: 'Timeline' }).click();
  const task = page.getByRole('checkbox').first();
  const taskName = await task.evaluate((input) => input.labels?.[0]?.textContent ?? '');
  await task.check();
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#plan-panel .panel');
  check(
    'a ticked task is still ticked after a reload',
    await page.getByRole('checkbox', { name: taskName, exact: true }).first().isChecked(),
  );
  await context.close();
}

if (consoleErrors.length > 0) {
  failures += 1;
  console.log(`FAIL console errors:\n  ${consoleErrors.join('\n  ')}`);
}
await browser.close();
process.exit(failures > 0 ? 1 : 0);
