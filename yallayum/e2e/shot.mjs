// Captures d'écran rapides pendant le développement : node e2e/shot.mjs [url] [sortie]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'e2e/screens/shot.png';
mkdirSync('e2e/screens', { recursive: true });
const pack = readFileSync(new URL('../.cache/mappack.js', import.meta.url), 'utf8');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await ctx.addInitScript(pack);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForTimeout(4000);
await page.screenshot({ path: out });
console.log('erreurs :', errors.slice(0, 10));
await browser.close();
