// Audio e2e (SPEC §25): audio starts on the first gesture, produces real signal, and the mix
// changes with place and time (the "eyes closed" check: beds and event rates differ per place).
import { launch, waitReady } from './browser.mjs';
import { serve } from './serve.mjs';

const server = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(server.url + '?nosw=1&play=1');
await waitReady(page);
await page.mouse.click(500, 350); // the first gesture unlocks audio
await page.waitForFunction(() => window.__hotaru.audio, null, { timeout: 20000 });

// measure the output level with an analyser on the master bus
await page.evaluate(() => {
  const a = window.__hotaru.audio, ctx = a.mix.ctx;
  const an = ctx.createAnalyser(); an.fftSize = 2048;
  a.mix.master.connect(an);
  window.__rms = () => { const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length); };
});

const PLACES = [
  { name: 'lake shore, night', x: 30, z: 330, hour: 22 },
  { name: 'cedar forest, dawn', x: -3280, z: -120, hour: 6.2 },
  { name: 'bamboo grove, noon', x: -2700, z: 1700, hour: 12 },
  { name: 'coast, noon', x: 4600, z: -900, hour: 12, toSea: true },
  { name: 'rice valley, dusk', x: -200, z: 3100, hour: 18.8 },
  { name: 'snowy pass, day', x: -400, z: -4100, hour: 13 },
];
const results = {};
for (const p of PLACES) {
  const r = await page.evaluate(async (p) => {
    const h = window.__hotaru, g = h.game, c = g.controller;
    let x = p.x, z = p.z;
    if (p.toSea) { // walk east until the ground meets the sea
      for (let k = 0; k < 400 && g.world.height(x, z) > 1; k++) x += 5;
    }
    c.placeAt(x, z);
    h.clock.setHour(p.hour);
    await new Promise((res) => setTimeout(res, 2500));
    const a = h.audio;
    const top = Object.entries(a.ambience.rates).filter(([, v]) => v > 0.2).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${v.toFixed(1)}`);
    return { region: a.context.region, space: a.mix.space, surface: a.surface(), beds: a.ambience.levels(), top, rms: window.__rms() };
  }, p);
  results[p.name] = r;
}
// force a music piece and check it plays
const music = await page.evaluate(async () => {
  const a = window.__hotaru.audio;
  a.music.playNow();
  await new Promise((res) => setTimeout(res, 3000));
  return { playing: a.music.playing, mood: a.music.piece?.mood.id, seconds: Math.round(a.music.piece?.seconds ?? 0), rms: window.__rms() };
});
console.log(JSON.stringify({ results, music, errors }, null, 1));

const fail = [];
const R = results;
if (errors.length) fail.push('console errors');
if (!(music.playing && music.rms > 0.001)) fail.push('music is silent');
if (!Object.values(R).every((r) => r.rms > 0.0005)) fail.push('silent place');
if (!(R['cedar forest, dawn'].space === 'forest')) fail.push('forest reverb');
if (!(R['coast, noon'].beds.surf > 0.01)) fail.push('no surf at the coast');
if (!(R['lake shore, night'].top.some((t) => /cricket|frog|owl/.test(t)))) fail.push('no night voices at the lake');
if (!(R['cedar forest, dawn'].top.some((t) => /warbler|tit/.test(t)))) fail.push('no dawn chorus in the forest');
if (!(R['bamboo grove, noon'].beds.bamboo > 0)) fail.push('no bamboo whoosh');
if (!(R['snowy pass, day'].surface === 'snow' || R['snowy pass, day'].surface === 'gravel' || R['snowy pass, day'].surface === 'grass')) fail.push('surface');
await browser.close();
server.stop();
if (fail.length) { console.error('AUDIO TEST FAILED: ' + fail.join(', ')); process.exit(1); }
console.log('AUDIO TEST PASSED');
