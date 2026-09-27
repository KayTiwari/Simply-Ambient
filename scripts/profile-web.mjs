// Web performance probe for the exported build.
//
// Usage:  npm run build:web && node scripts/profile-web.mjs
// Needs:  dist/ and a system Chrome install (same as capture-screenshots).
//
// Drives the real app through onboarding, then measures each transition
// (soundscape switches, tab changes, slider drags) with the Long Tasks API,
// a requestAnimationFrame frame counter, and a CDP CPU profile for the
// heavier ones. Numbers are for a desktop Chrome; a phone's JS thread is
// several times slower, so a 60 ms task here is a visible hitch there.
// Frame counts above 60 are double counting from an earlier window and can
// be ignored; the long-task and worst-frame columns are the signal.

import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { fileURLToPath } from 'node:url';
const DIST = join(fileURLToPath(new URL('..', import.meta.url)), 'dist');
const PORT = 4174;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  for (const file of [join(DIST, path), join(DIST, 'index.html')]) {
    try { const body = await readFile(file); res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' }); res.end(body); return; } catch {}
  }
  res.writeHead(404).end();
});
await new Promise(r => server.listen(PORT, r));

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const tap = async (text, { exact = false, nth = 0 } = {}) => {
  const el = page.getByText(text, { exact }).nth(nth);
  await el.waitFor({ state: 'visible', timeout: 15000 });
  await el.click();
};
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await tap('BEGIN', { exact: true });
await tap('I AGREE & CONTINUE');
await tap('Focus', { exact: true });
await tap('CONTINUE', { exact: true });
await page.getByText('Make the space yours').first().waitFor({ state: 'visible' });
await tap('Skip', { exact: true });
await page.getByText('FREQUENCY', { exact: true }).first().waitFor({ state: 'visible' });
await tap('CONTINUE', { exact: true });
await page.getByText('GOOD TO KNOW', { exact: true }).first().waitFor({ state: 'visible' });
await tap('ENTER SIMPLY AMBIENT', { exact: true });
await page.getByText('START SESSION').first().waitFor({ state: 'visible', timeout: 15000 });
await page.waitForTimeout(1500);

// Long-task + frame measurement for a window of ms.
async function measure(label, ms, during) {
  await page.evaluate(() => {
    window.__lt = { count: 0, total: 0, max: 0 };
    window.__ltObs?.disconnect();
    window.__ltObs = new PerformanceObserver(list => {
      for (const e of list.getEntries()) { window.__lt.count++; window.__lt.total += e.duration; window.__lt.max = Math.max(window.__lt.max, e.duration); }
    });
    window.__ltObs.observe({ type: 'longtask', buffered: false });
    window.__frames = 0; window.__frameStop = false; window.__worst = 0; let last = performance.now();
    const step = (t) => { window.__frames++; window.__worst = Math.max(window.__worst, t - last); last = t; if (!window.__frameStop) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  const t0 = Date.now();
  if (during) await during(); 
  const remaining = ms - (Date.now() - t0);
  if (remaining > 0) await page.waitForTimeout(remaining);
  const r = await page.evaluate(() => { window.__frameStop = true; window.__ltObs.disconnect(); return { ...window.__lt, frames: window.__frames, worst: window.__worst }; });
  const secs = ms / 1000;
  console.log(`${label.padEnd(34)} fps ${(r.frames / secs).toFixed(0).padStart(3)}  longtasks ${String(r.count).padStart(3)}  blocked ${r.total.toFixed(0).padStart(5)} ms  longest ${r.max.toFixed(0).padStart(4)} ms  worst frame ${r.worst.toFixed(0)} ms`);
}

async function cpuProfile(label, ms, during) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  if (during) await during();
  const remaining = ms - (Date.now() - t0);
  if (remaining > 0) await page.waitForTimeout(remaining);
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.detach();
  // Self time per function.
  const self = new Map();
  const nodeById = new Map(profile.nodes.map(n => [n.id, n]));
  const dt = profile.timeDeltas; const samples = profile.samples;
  for (let i = 0; i < samples.length; i++) {
    const n = nodeById.get(samples[i]); const cf = n.callFrame;
    const key = `${cf.functionName || '(anonymous)'} ${cf.url.split('/').pop()}:${cf.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  console.log(`\n== CPU self time, ${label} (${total.toFixed(0)} ms sampled over ${ms} ms) ==`);
  [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, v]) => console.log(`  ${v.toFixed(0).padStart(6)} ms  ${k}`));
}




const event = async (label, action, profile = false) => {
  if (profile) await cpuProfile(label, 2500, action);
  else await measure(label, 2500, action);
};
await measure('idle, Tones tab', 4000);
await tap('START SESSION');
try { await tap('I UNDERSTAND, PLAY'); } catch {}
await page.waitForTimeout(1500);
await measure('tone playing', 4000);
await event('open Soundscapes room', async () => { await tap('Scape', { exact: true }); }, true);
await page.getByText('NATURAL AMBIENCE').first().waitFor({ state: 'visible', timeout: 15000 });
await page.waitForTimeout(800);
await event('play Trickling Stream (file, first media)', async () => { await tap('Trickling Stream', { exact: true }); });
await event('file -> Box Fan (synth)', async () => { await tap('Box Fan', { exact: true }); });
await event('synth -> Ceiling Fan (synth)', async () => { await tap('Ceiling Fan', { exact: true }); });
await event('synth -> Soft Rain (file)', async () => { await tap('Soft Rain', { exact: true }); });
await event('file -> Vent Hum (synth)', async () => { await tap('Vent Hum', { exact: true }); }, true);
await measure('steady: tone + Vent Hum', 4000);

const slider = page.getByLabel('Soundscape volume').first();
await slider.waitFor({ state: 'visible', timeout: 10000 });
const box = await slider.boundingBox();
const drag = async () => {
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
  await page.mouse.down();
  for (let k = 0; k < 90; k++) {
    const f = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(k / 8));
    await page.mouse.move(box.x + box.width * f, box.y + box.height / 2);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
};
await measure('drag soundscape volume', 2500, drag);
await cpuProfile('drag soundscape volume', 2500, drag);

const scroll = async () => { for (let k = 0; k < 40; k++) { await page.mouse.wheel(0, k < 20 ? 60 : -60); await page.waitForTimeout(40); } };
await measure('scroll Soundscapes room', 2500, scroll);

await event('tab: Breathe', async () => { await tap('Breathe', { exact: true }); });
await event('tab: Chakras', async () => { await tap('Chakras', { exact: true }); }, true);
await event('tab: Stars', async () => { await tap('Stars', { exact: true }); }, true);
await event('tab: Tones', async () => { await tap('Tones', { exact: true }); });
await event('tab: More hub', async () => { await tap('More', { exact: true }); }, true);

await browser.close(); server.close();
