// Screenshots of the reworked More section (docs/screenshots/more/).
// Usage: npm run build:web && node scripts/capture-more-pages.mjs
// Drives the exported web build with a named profile so the hub greeting,
// day-scoped mood, and value-first Insights states are all visible.

import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'docs', 'screenshots', 'more');
await mkdir(OUT, { recursive: true });
const PORT = 4174;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf',
};
const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  for (const file of [join(DIST, path), join(DIST, 'index.html')]) {
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
      return;
    } catch {}
  }
  res.writeHead(404).end();
});
await new Promise(r => server.listen(PORT, r));

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 3 });

const shot = async (name) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, name) });
  console.log('captured', name);
};
const tap = async (text, { exact = false, nth = 0 } = {}) => {
  console.log('tap:', text);
  const el = page.getByText(text, { exact }).nth(nth);
  await el.waitFor({ state: 'visible', timeout: 15000 });
  await el.click();
};
const back = async () => {
  await page.getByLabel('Back', { exact: true }).first().click();
  await page.waitForTimeout(600);
};

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// Walkthrough with a name, so the hub greeting personalizes.
await tap('BEGIN', { exact: true });
await tap('I AGREE & CONTINUE');
await tap('Calm', { exact: true });
await tap('CONTINUE', { exact: true });
await page.getByText('A little about you').first().waitFor({ state: 'visible' });
await page.getByPlaceholder('What should we call you?').fill('River');
await tap('CONTINUE', { exact: true });
await page.getByText('FREQUENCY', { exact: true }).first().waitFor({ state: 'visible' });
await tap('CONTINUE', { exact: true });
await page.getByText('Good to know').first().waitFor({ state: 'visible' });
await tap('ENTER', { exact: true });
await page.waitForTimeout(1200);

// 1. Hub with greeting and regrouped tiles.
await tap('More', { exact: true });
await shot('01-hub-greeting.png');

// 2. Mood: log today, see the day-scoped page.
await tap('Mood Check-in');
await tap('Good', { exact: true });
await page.waitForTimeout(3600); // let the Noted toast pass
await shot('02-mood-day-scoped.png');
await back();

// 3. AI Insights: value-first empty state.
await tap('AI Insights');
await shot('03-insights-welcome.png');
await back();

// 4. Grounding: mark two steps of the ritual.
await tap('Grounding');
await tap('see', { nth: 0 });
await tap('touch', { nth: 0 });
await shot('04-grounding-ritual.png');
await back();

// 5. Support: reordered with shipped group.
await tap('Support', { exact: true });
await shot('05-support-reordered.png');

await browser.close();
server.close();
console.log('done ->', OUT);
