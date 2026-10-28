// Ouvre la page artefact assemblée dans un squelette proche de celui de l'hébergeur.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const body = readFileSync(new URL('../dist-artifact/yallayum.html', import.meta.url), 'utf8');
mkdirSync(new URL('./screens/', import.meta.url), { recursive: true });
const page0 = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${body}</body></html>`;
writeFileSync(new URL('../dist-artifact/preview.html', import.meta.url), page0);
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const browser = await chromium.launch({ proxy });
for (const [name, viewport, hash] of [['mobile', { width: 390, height: 844 }, ''], ['desktop', { width: 1440, height: 900 }, ''], ['admin', { width: 1440, height: 900 }, '#admin']]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ignoreHTTPSErrors: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', isMobile: name === 'mobile', hasTouch: name === 'mobile' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(`échec ${r.url().slice(0, 80)} ${r.failure()?.errorText}`));
  await page.goto(new URL(`../dist-artifact/preview.html${hash}`, import.meta.url).href);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `e2e/screens/artifact-${name}.png` });
  console.log(name, errors.length ? errors : 'sans erreur', await page.evaluate(() => ({ markers: document.querySelectorAll('.marker, .cluster').length, overflow: document.documentElement.scrollWidth - innerWidth })));
  await ctx.close();
}
await browser.close();
