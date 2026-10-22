// Fails the build when the shipped JavaScript or CSS grows past its budget.
// "Initial" is what the first screen needs: the entry script, everything it
// imports up front, and the stylesheet. Every lazily loaded chunk has its own cap.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist/client';
const KB = 1024;
const BUDGET = { initialJs: 80 * KB, lazyChunk: 30 * KB, css: 10 * KB };

const gz = (file) => gzipSync(readFileSync(join(DIST, file))).length;
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const referenced = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((m) => m[1]);
const entry = referenced.find((f) => f.endsWith('.js'));

// Follow static imports from the entry to find everything loaded up front.
const initial = new Set();
const queue = [entry];
while (queue.length > 0) {
  const file = queue.pop();
  if (!file || initial.has(file)) continue;
  initial.add(file);
  const code = readFileSync(join(DIST, file), 'utf8');
  for (const m of code.matchAll(/\bimport\s*(?:[\w{},*\s]+from\s*)?["']\.\/([\w.-]+\.js)["']/g)) {
    queue.push(`assets/${m[1]}`);
  }
}

const assets = readdirSync(join(DIST, 'assets'));
const js = assets.filter((f) => f.endsWith('.js')).map((f) => `assets/${f}`);
const css = assets.filter((f) => f.endsWith('.css')).map((f) => `assets/${f}`);
const initialJs = [...initial].reduce((sum, f) => sum + gz(f), 0);
const cssTotal = css.reduce((sum, f) => sum + gz(f), 0);
const lazy = js.filter((f) => !initial.has(f)).map((f) => ({ f, size: gz(f) }));
const biggestLazy = lazy.reduce((max, c) => (c.size > max.size ? c : max), { f: '-', size: 0 });

const rows = [
  ['Initial JavaScript', initialJs, BUDGET.initialJs],
  [`Largest lazy chunk (${biggestLazy.f})`, biggestLazy.size, BUDGET.lazyChunk],
  ['CSS', cssTotal, BUDGET.css],
];
let failed = false;
for (const [label, size, limit] of rows) {
  const ok = size <= limit;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'OVER'} ${label}: ${(size / KB).toFixed(1)} KB gzip (budget ${limit / KB} KB)`,
  );
}
console.log(`${lazy.length} lazy chunks load on demand.`);
process.exit(failed ? 1 : 0);
