// Lightweight responsive smoke test for the exported app.
// Usage: npm run build:web && node scripts/verify-responsive.mjs

import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const PORT = 4175;
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
await new Promise(resolve => server.listen(PORT, resolve));

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 320, height: 720 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

const tap = async (text, exact = true) => {
  const target = page.getByText(text, { exact }).first();
  await target.waitFor({ state: 'visible', timeout: 15000 });
  await target.click();
};

const assertNoRootOverflow = async label => {
  await page.waitForTimeout(350);
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  assert.ok(
    metrics.documentWidth <= metrics.viewport + 1 && metrics.bodyWidth <= metrics.viewport + 1,
    `${label} overflows horizontally: ${JSON.stringify(metrics)}`,
  );
};

const assertChakraConsoleContained = async width => {
  const eyebrow = page.getByText('CURRENT TONE', { exact: true });
  const statusLabel = page.getByText('READY', { exact: true });
  const topRow = eyebrow.locator('..');
  const consoleSurface = topRow.locator('..');
  const status = statusLabel.locator('..');
  const [eyebrowBox, consoleBox, statusBox] = await Promise.all([
    eyebrow.boundingBox(),
    consoleSurface.boundingBox(),
    status.boundingBox(),
  ]);
  assert.ok(eyebrowBox && consoleBox && statusBox, `${width} chakra console geometry unavailable`);
  assert.ok(
    statusBox.x + statusBox.width <= consoleBox.x + consoleBox.width + 1,
    `${width} Current Tone status escapes its surface`,
  );
  assert.ok(
    statusBox.x >= eyebrowBox.x + eyebrowBox.width,
    `${width} Current Tone status overlaps its label`,
  );
};

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

// Complete first-run once; the same browser context retains AsyncStorage for
// the wide reload below.
await tap('BEGIN');
await tap('I AGREE & CONTINUE');
await tap('Calm');
await assertNoRootOverflow('320 onboarding intention');
await tap('CONTINUE');
await page.getByText('Make the space yours').first().waitFor({ state: 'visible' });
await tap('Skip');
await page.getByText('FREQUENCY', { exact: true }).first().waitFor({ state: 'visible' });
await tap('CONTINUE');
await page.getByText('GOOD TO KNOW', { exact: true }).first().waitFor({ state: 'visible' });
await tap('ENTER SIMPLY AMBIENT');

const exerciseRooms = async width => {
  await page.getByText('Binaural frequency generator', { exact: true }).waitFor({ state: 'visible' });
  await assertNoRootOverflow(`${width} tones`);

  await tap('Breathe');
  await page.getByText('Follow the breath', { exact: true }).waitFor({ state: 'visible' });
  await assertNoRootOverflow(`${width} breathe`);
  await tap('Box Breathing');
  await page.getByText('BEGIN PRACTICE', { exact: true }).waitFor({ state: 'visible' });
  await assertNoRootOverflow(`${width} breath practice`);
  const phaseTones = page.getByLabel('Eyes-closed phase tones', { exact: true });
  const phaseTonesOn = phaseTones.getByText('ON', { exact: true });
  if (!(await phaseTonesOn.isVisible().catch(() => false))) await phaseTones.click();
  await phaseTonesOn.waitFor({ state: 'visible' });
  await page.getByLabel('Begin breathing practice', { exact: true }).click();
  await page.getByLabel('End breathing practice', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('End breathing practice', { exact: true }).click();

  await tap('Chakras');
  await page.getByText('Move through the spectrum', { exact: true }).waitFor({ state: 'visible' });
  await assertNoRootOverflow(`${width} chakras`);
  await assertChakraConsoleContained(width);

  await tap('Stars');
  await page.getByText('Read the sky', { exact: true }).waitFor({ state: 'visible' });
  await tap('TAROT');
  await assertNoRootOverflow(`${width} tarot`);

  await tap('More');
  await page.getByText('A quiet corner,', { exact: false }).first().waitFor({ state: 'visible' });
  await assertNoRootOverflow(`${width} more hub`);
  await tap('Take a five-second check-in');
  await page.getByText('Meet Your Mood', { exact: true }).waitFor({ state: 'visible' });
  await assertNoRootOverflow(`${width} more destination`);

  await page.getByLabel('Back', { exact: true }).first().click();
  await page.getByText('Soundscapes', { exact: true }).first().waitFor({ state: 'visible' });
  await tap('Soundscapes');
  await page.getByText('Layer the Room', { exact: true }).waitFor({ state: 'visible' });
  await assertNoRootOverflow(`${width} soundscapes`);
  await tap('Soft Rain');
  await page.getByText('Playing now', { exact: true }).waitFor({ state: 'visible' });
  await assertNoRootOverflow(`${width} active soundscape`);
  const sidewaysScroll = await page.evaluate(() => ({
    windowX: window.scrollX,
    elements: Array.from(document.querySelectorAll('*'))
      .filter(element => element.scrollLeft > 1)
      .map(element => ({
        tag: element.tagName,
        className: element.className,
        scrollLeft: element.scrollLeft,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        overflowX: getComputedStyle(element).overflowX,
      })),
  }));
  assert.equal(sidewaysScroll.windowX, 0, `${width} soundscapes shifted the window sideways`);
  const uncontainedSidewaysScroll = sidewaysScroll.elements.filter(
    element => !['auto', 'scroll', 'hidden', 'clip'].includes(element.overflowX),
  );
  assert.deepEqual(
    uncontainedSidewaysScroll,
    [],
    `${width} soundscapes shifted an uncontained element sideways`,
  );

  const pin = page.getByLabel('Pin Soundscapes to the app navbar', { exact: true });
  if (await pin.isVisible().catch(() => false)) await pin.click();
  await page.getByText('Scape', { exact: true }).waitFor({ state: 'visible' });
  await assertNoRootOverflow(`${width} six-tab navbar`);
  const unpin = page.getByLabel('Unpin Soundscapes from the app navbar', { exact: true });
  if (await unpin.isVisible().catch(() => false)) await unpin.click();
};

await exerciseRooms(320);

await page.setViewportSize({ width: 768, height: 900 });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1600);
await exerciseRooms(768);

assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join('\n')}`);
console.log('responsive smoke passed: 320px and 768px');

await browser.close();
server.close();
