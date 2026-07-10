// Screenshots of the composition-level More redesign
// (docs/screenshots/more-v2/).
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
const OUT = join(ROOT, 'docs', 'screenshots', 'more-v2');
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
await page.getByText('Make the space yours').first().waitFor({ state: 'visible' });
await page.getByPlaceholder('What should we call you?').fill('River');
await tap('CONTINUE', { exact: true });
await page.getByText('FREQUENCY', { exact: true }).first().waitFor({ state: 'visible' });
await tap('CONTINUE', { exact: true });
await page.getByText('GOOD TO KNOW', { exact: true }).first().waitFor({ state: 'visible' });
await tap('ENTER SIMPLY AMBIENT', { exact: true });
await page.waitForTimeout(1200);

// 1. Personalized editorial hub.
await tap('More', { exact: true });
await shot('01-editorial-hub.png');

// 2. Mood horizon: log today, then show the selected weather.
await tap('Take a five-second check-in', { exact: true });
await page.waitForTimeout(700);
await tap('Good', { exact: true });
await page.waitForTimeout(3600); // let the Noted toast pass
await shot('02-mood-horizon.png');
await back();

// 3. Release ritual.
await tap('Release', { exact: true });
await shot('03-release-ritual.png');
await back();

// 4. Grounding compass: move to the third sense.
await tap('5-4-3-2-1 Grounding', { exact: true });
await tap('Done, next', { exact: true });
await tap('Done, next', { exact: true });
await shot('04-grounding-compass.png');
await back();

// 5. Gratitude daybook.
await tap('Gratitude', { exact: true });
await shot('05-gratitude-daybook.png');
await back();

// 6. Soundscape scene, actively playing.
await tap('Soundscapes', { exact: true });
await tap('Soft Rain', { exact: true });
await page.getByText('Playing now', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
await shot('06-soundscape-scene.png');
await page.getByLabel('Stop all audio', { exact: true }).click();
await page.waitForTimeout(500);
await back();

// 7. Profile identity atlas, seeded for the cosmic pages that follow.
await tap('Profile', { exact: true });
await page.getByPlaceholder('YYYY-MM-DD').fill('1990-06-15');
await page.getByPlaceholder('HH:MM').fill('08:30');
await page.getByPlaceholder('City, country').fill('Detroit, USA');
await shot('07-profile-atlas.png');
await back();

// 8. Honest natal wheel (Sun sign only).
await tap('Natal', { exact: true });
await shot('08-natal-wheel.png');
await back();

// 9. Settings atmosphere preview.
await tap('Settings', { exact: true });
await shot('09-settings-preview.png');
await back();

// 10. Scannable safety guide.
await tap('Safety', { exact: true });
await shot('10-safety-guide.png');
await back();

// 11. Feedback postcard.
await tap('Feedback', { exact: true });
await shot('11-feedback-postcard.png');
await back();

// 12. Maker letter and visual roadmap.
await tap('Support', { exact: true });
await shot('12-support-maker-letter.png');
await back();

// 13. Reading room and data-ingredient tray.
await tap('AI Insights', { exact: true });
await shot('13-insights-reading-room.png');
await back();

// 14. Themed routine paths.
await tap('Routines', { exact: true });
await shot('14-routine-paths.png');
await back();

// 15. Dual-orbit compatibility composer.
await tap('Compatibility', { exact: true });
await shot('15-compatibility-orbits.png');
await back();

// 16. Daily affirmation talisman.
await tap('Affirmation', { exact: true });
await shot('16-affirmation-talisman.png');
await back();

// 17. Intention seed and orbit archive.
await tap('Intentions', { exact: true });
await shot('17-intention-seed.png');

await browser.close();
server.close();
console.log('done ->', OUT);
