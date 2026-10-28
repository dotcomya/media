import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const pack = readFileSync(new URL('../.cache/mappack.js', import.meta.url), 'utf8');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await ctx.addInitScript(pack);
await ctx.addInitScript(() => { localStorage.setItem('yy:onboarded', 'true'); localStorage.setItem('yy:env', JSON.stringify({ textScale: 2, gps: 'real', network: 'online', reducedMotion: true, theme: 'system' })); });
const page = await ctx.newPage();
await page.goto('http://localhost:5173/');
await page.waitForTimeout(3000);
await page.locator('.result').first().click();
await page.waitForTimeout(1000);
console.log(await page.evaluate(() => {
  const r = (s) => document.querySelector(s)?.getBoundingClientRect().toJSON();
  const p = document.querySelector('.page');
  return { device: r('.device'), page: r('.page'), wrap: p?.parentElement?.getBoundingClientRect().toJSON(), bar: r('.action-bar'), style: p && getComputedStyle(p).transform, anim: p && getComputedStyle(p).animationName, bg: p && getComputedStyle(p).backgroundColor, scroll: r('.page-scroll') };
}));
await browser.close();
