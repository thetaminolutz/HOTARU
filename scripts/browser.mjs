// Shared Playwright launcher (uses the pre-installed Chromium; WebGL via SwiftShader in CI/containers).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
export const { chromium } = pw;
export async function launch() {
  return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
}
export async function waitReady(page, timeout = 120000) {
  await page.waitForFunction(() => window.__hotaru && window.__hotaru.ready, null, { timeout });
}
