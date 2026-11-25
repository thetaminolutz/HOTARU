// Renders listenable music samples (offline, mono 22 kHz WAV) → docs/audio/
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, waitReady } from './browser.mjs';
import { serve } from './serve.mjs';
const out = new URL('../docs/audio/', import.meta.url);
mkdirSync(out, { recursive: true });
const SAMPLES = [
  ['main-theme-title', 'lake', 12, true, 50],
  ['cedar-forest-day', 'cedar', 11, false, 40],
  ['rice-valley-day', 'rice', 11, false, 35],
  ['lake-night', 'lake', 23, false, 40],
];
const server = await serve();
const browser = await launch();
const page = await browser.newPage();
await page.goto(server.url + '?nosw=1&ui=gallery');
await waitReady(page);
for (const [name, region, hour, title, sec] of SAMPLES) {
  const data = await page.evaluate(([r, h, t, s]) => window.__hotaru.renderPiece(r, h, t, s), [region, hour, title, sec]);
  const sr = 22050, n = data.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(data[i] * k * 32767))), 44 + i * 2);
  writeFileSync(new URL(`${name}.wav`, out), buf);
  console.log(name, (buf.length / 1e6).toFixed(2) + ' MB', 'peak', peak.toFixed(3));
}
await browser.close();
server.stop();
