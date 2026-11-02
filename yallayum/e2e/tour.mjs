// Visite guidée en captures : node e2e/tour.mjs [préfixe]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const pack = readFileSync(new URL('../.cache/mappack.js', import.meta.url), 'utf8');
const prefix = process.argv[2] ?? 't';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris',
  geolocation: { latitude: 48.8686, longitude: 2.3621 }, permissions: ['geolocation'],
});
await ctx.addInitScript(pack);
// Démo à 20:30 un mardi : on fige l'heure de la page.
await ctx.addInitScript(() => { localStorage.setItem('yy:onboarded', 'true'); });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: `e2e/screens/${prefix}-${name}.png` }); };
await page.goto('http://localhost:5173/');
await page.waitForTimeout(3500);
await shot('1-carte');
await page.getByRole('button', { name: 'Autour de moi' }).click();
await page.waitForTimeout(2500);
await shot('2-autour');
const marker = page.locator('.marker').first();
await marker.click();
await page.waitForTimeout(1200);
await shot('3-selection');
await page.locator('.peek.is-current').click();
await page.waitForTimeout(1200);
await shot('4-fiche');
await page.locator('.page-scroll').evaluate((el) => el.scrollTo(0, 520));
await shot('5-fiche-bas');
await page.getByRole('button', { name: 'Retour' }).click();
await page.waitForTimeout(600);
await page.locator('.search-trigger').click();
await page.locator('#q').fill('burger à saint denis ouvert après 23h');
await shot('6-recherche');
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
await shot('7-resultats');
console.log('erreurs', errors);
await browser.close();
