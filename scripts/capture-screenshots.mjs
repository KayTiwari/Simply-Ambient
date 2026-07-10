// Draft Play Store screenshots from the exported web build.
//
// Usage:  node scripts/capture-screenshots.mjs
// Needs:  dist/ (npm run build:web) and a system Chrome install.
//
// These are DRAFTS for layout and caption planning. Final store shots
// should be captured on an Android device per docs/play-store-improvements.md
// (the web build has no haptics, no notifications, and Web Audio tones).

import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'docs', 'screenshots');
const PORT = 4173;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

// Static server with SPA fallback; /api/* 404s and the app degrades politely.
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
// 360x800 @3x renders 1080x2400, the Play Store phone screenshot size.
const page = await browser.newPage({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 3 });

const shot = async (name) => {
  await page.waitForTimeout(900); // let fades/gradients settle
  await page.screenshot({ path: join(OUT, name) });
  console.log('captured', name);
};
const tap = async (text, { exact = false, nth = 0 } = {}) => {
  console.log('tap:', text);
  const el = page.getByText(text, { exact }).nth(nth);
  await el.waitFor({ state: 'visible', timeout: 15000 });
  await el.click();
};

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500); // font load + app fade-in

// --- 1. Walkthrough intent step, one card selected -------------------------
await tap('BEGIN', { exact: true });
await tap('I AGREE & CONTINUE');
await tap('Focus', { exact: true });
await shot('05-walkthrough-intent.png');

// Finish the walkthrough: intent -> profile -> recommendations -> field guide.
// Steps cross-fade over ~500ms, so wait for a marker unique to each step
// before tapping its button; otherwise a tap can land on the previous step.
await tap('CONTINUE', { exact: true });   // intent -> profile
await page.getByText('Make the space yours').first().waitFor({ state: 'visible' });
await tap('Skip', { exact: true });       // profile -> recommendations
await page.getByText('FREQUENCY', { exact: true }).first().waitFor({ state: 'visible' });
await tap('CONTINUE', { exact: true });   // recommendations -> tips
await page.getByText('GOOD TO KNOW', { exact: true }).first().waitFor({ state: 'visible' });
await tap('ENTER SIMPLY AMBIENT', { exact: true }); // tips -> app

// --- 2. Frequencies tab, tone playing (hero) --------------------------------
await page.getByText('START SESSION').first().waitFor({ state: 'visible', timeout: 15000 });
await tap('START SESSION');
await tap('I UNDERSTAND, PLAY');          // audio-safety confirm
await page.waitForTimeout(2600);          // gradient crossfade mid-motion
await shot('01-frequencies-hero.png');

// --- 3. More inherits the live Alpha field ----------------------------------
await tap('More', { exact: true });
await shot('09-more-fluid.png');

// --- 4. Soundscapes layered under the tone ---------------------------------
await tap('Soundscapes');
await tap('Soft Rain');
await page.waitForTimeout(1200);
await shot('02-soundscapes-layered.png');

// --- 5. Settings: privacy card + rate + replay ------------------------------
await page.getByLabel('Back', { exact: true }).first().click(); // Soundscapes sub-page -> hub
await tap('Settings', { exact: true });
await page.getByText('YOUR PRIVACY').first().scrollIntoViewIfNeeded();
await shot('04-settings-privacy.png');

// --- 6. Breath library + immersive mandala session --------------------------
await tap('Breathe', { exact: true });    // tab bar
await shot('10-breath-library.png');
await tap('Box Breathing');
await tap('Mandala');                     // visualization toggle
await tap('BEGIN PRACTICE', { exact: true });
await page.waitForTimeout(4200);          // mid-phase
await shot('03-breath-mandala.png');

// --- 7. Chakra spectrum -----------------------------------------------------
await tap('Chakras', { exact: true });
await shot('06-chakra-spectrum.png');

// --- 8. Horoscope manuscript + tarot room ----------------------------------
await tap('Stars', { exact: true });
await page.getByText('HOROSCOPE', { exact: true }).first().waitFor({ state: 'visible' });
await shot('07-horoscope-reading.png');
await tap('TAROT', { exact: true });
await shot('08-tarot-room.png');

await browser.close();
server.close();
console.log('done ->', OUT);
