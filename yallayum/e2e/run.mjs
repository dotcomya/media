// Recette de bout en bout de l'application mobile (cahier des charges, § 13).
//
// Chaque scénario s'écrit « Étant donné / Quand / Alors » et tourne dans un
// Chromium mobile (390 × 844, tactile, fr-FR, Europe/Paris). Le serveur de
// développement est lancé ici ; la carte utilise le paquet de tuiles
// embarqué (.cache/mappack.js, voir « npm run tiles ») pour ne pas dépendre
// du réseau.
//
//   npm run test:e2e            tous les scénarios
//   npm run test:e2e -- 7 17    seulement les cas 7 et 17

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = 5180;
const BASE = `http://localhost:${PORT}/`;
const PACK = new URL('../.cache/mappack.js', import.meta.url);
const only = process.argv.slice(2);

mkdirSync(new URL('./screens/', import.meta.url), { recursive: true });

// ─── Serveur ────────────────────────────────────────────────────────────────

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: new URL('..', import.meta.url), stdio: 'pipe' });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('Le serveur de développement ne démarre pas')), 30_000);
  server.stdout.on('data', (d) => String(d).includes('Local') && (clearTimeout(t), resolve()));
});

const browser = await chromium.launch();
const pack = existsSync(PACK) ? readFileSync(PACK, 'utf8') : '';
if (!pack) console.log('⚠ paquet de carte absent : tuiles en ligne (npm run tiles pour les embarquer)');

async function newPage({ env = {}, onboarded = true, geolocation, storage = {} } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    ...(geolocation ? { geolocation, permissions: ['geolocation'] } : {}),
  });
  if (pack) await ctx.addInitScript(pack);
  await ctx.addInitScript(
    ({ env, onboarded, storage }) => {
      if (sessionStorage.getItem('yy:e2e-init')) return;
      sessionStorage.setItem('yy:e2e-init', '1');
      localStorage.clear();
      if (onboarded) localStorage.setItem('yy:onboarded', 'true');
      localStorage.setItem('yy:env', JSON.stringify({ gps: 'real', network: 'online', reducedMotion: true, textScale: 1, theme: 'system', ...env }));
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(`yy:${k}`, JSON.stringify(v));
    },
    { env, onboarded, storage },
  );
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  return page;
}

async function open(page, hash = '') {
  await page.goto(BASE + hash);
  await page.waitForFunction(() => window.__yy && document.querySelector('.bsheet-head'));
  await page.waitForTimeout(1600);
}

const state = (page) => page.evaluate(() => window.__yy.store.get());
const resultNames = (page) => page.locator('.results').first().locator('.result h3').allTextContents();

// ─── Petit harnais Étant donné / Quand / Alors ──────────────────────────────

const scenarios = [];
function scenario(id, title, fn) {
  scenarios.push({ id: String(id), title, fn });
}

let failures = 0;
async function runAll() {
  for (const s of scenarios) {
    if (only.length && !only.includes(s.id)) continue;
    const log = [];
    const step = (kind) => (text) => log.push(`    ${kind} ${text}`);
    const t = { given: step('Étant donné'), when: step('Quand'), then: step('Alors'), and: step('Et') };
    const started = Date.now();
    try {
      await s.fn(t);
      console.log(`✓ ${s.id}. ${s.title} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
      console.log(log.join('\n'));
    } catch (e) {
      failures++;
      console.log(`✗ ${s.id}. ${s.title}`);
      console.log(log.join('\n'));
      console.log(`    → ${e.message.split('\n').slice(0, 6).join('\n      ')}`);
    }
  }
}

// ─── Scénarios ──────────────────────────────────────────────────────────────

scenario(1, 'GPS refusé : une ville suffit, sans compte', async (t) => {
  t.given('une première ouverture, la position refusée par le système');
  const page = await newPage({ onboarded: false });
  await open(page);
  t.when('je touche « Utiliser ma position »');
  await page.locator('.prime').getByRole('button', { name: 'Utiliser ma position' }).click();
  await page.waitForTimeout(900);
  t.then('un message explique le refus sans bloquer, et propose une ville');
  await page.getByText('Position refusée').waitFor();
  assert.equal((await state(page)).location.status, 'denied');
  t.when('je choisis « Paris 11e »');
  await page.getByRole('button', { name: 'Choisir', exact: true }).click();
  await page.locator('.modal input').fill('11e');
  await page.getByRole('button', { name: /^Paris 11e/ }).click();
  await page.waitForTimeout(1200);
  t.then('des adresses s’affichent, sans compte ni position');
  const s = await state(page);
  assert.ok(s.response.results.length > 0, 'aucun résultat');
  assert.equal(s.areaLabel, 'Paris 11e');
  assert.equal(s.account, undefined);
  t.and('la bannière signale que la zone est choisie à la main');
  await page.getByText('Position non partagée').waitFor();
  await page.screenshot({ path: 'e2e/screens/e2e-01.png' });
  assert.deepEqual(page.errors, []);
});

scenario(2, 'Zéro résultat : pas de faux marqueur, des corrections chiffrées', async (t) => {
  t.given('la carte sur Lyon, où la démo n’a aucune adresse');
  const page = await newPage();
  await open(page);
  await page.locator('.search-trigger').click();
  await page.locator('#q').fill('lyon');
  await page.getByRole('button', { name: /^Lyon/ }).click();
  await page.waitForTimeout(1500);
  t.then('« Pas encore d’adresse référencée ici » et aucun marqueur');
  await page.getByText('Pas encore d’adresse référencée ici').waitFor();
  assert.equal(await page.locator('.marker, .cluster').count(), 0);
  t.given('Paris, avec « Coréenne » et un budget « € »');
  await page.evaluate(() => window.__yy.runSearch({ area: [2.28, 48.81, 2.42, 48.9], areaLabel: 'Paris', camera: { bbox: [2.28, 48.81, 2.42, 48.9], nonce: Date.now() } }));
  await page.locator('.search-trigger').click();
  await page.locator('#q').fill('coréen pas cher');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  t.then('la feuille dit pourquoi et chiffre chaque correction');
  await page.getByText(/Rien ne correspond à tous tes filtres|Cette combinaison n’existe pas encore/).waitFor();
  const fix = page.locator('.fix', { hasText: 'Retirer « Jusqu' });
  const label = await fix.textContent();
  const promised = Number(label.match(/(\d+) résultat/)[1]);
  t.when(`je touche « ${label.replace(/\d+ résultats?/, '').trim()} »`);
  await fix.click();
  await page.waitForTimeout(800);
  t.then('le nombre annoncé de résultats apparaît');
  assert.equal((await state(page)).response.results.length, promised);
  await page.screenshot({ path: 'e2e/screens/e2e-02.png' });
});

scenario(3, 'Fermé définitivement : hors découverte, lien expliqué', async (t) => {
  t.given('« Kebab Royal Oberkampf », fermé définitivement');
  const page = await newPage();
  await open(page);
  t.when('je cherche « kebab royal »');
  const names = (await state(page)).response.results.map((r) => r.restaurant.name);
  assert.ok(!names.includes('Kebab Royal Oberkampf'));
  await page.locator('.search-trigger').click();
  await page.locator('#q').fill('kebab royal');
  t.then('il n’apparaît ni dans les suggestions ni dans les résultats');
  assert.equal(await page.locator('.suggest-item', { hasText: 'Kebab Royal', hasNotText: 'Rechercher' }).count(), 0);
  await page.getByRole('button', { name: 'Retour' }).click();
  t.when('j’ouvre son lien partagé yallayum.app/r/kebab-royal-oberkampf');
  await page.goto(BASE + '#r-kebab-royal-oberkampf');
  await page.waitForTimeout(1500);
  t.then('une page explique la fermeture et propose des adresses proches');
  await page.getByText('a fermé définitivement').waitFor();
  assert.ok((await page.locator('.page .result').count()) >= 1);
  await page.screenshot({ path: 'e2e/screens/e2e-03.png' });
});

scenario(4, 'Une chaîne, deux établissements distincts', async (t) => {
  t.given('l’enseigne Smash Club, à République et à Saint-Denis');
  const page = await newPage();
  await open(page);
  t.when('je cherche « smash » dans le Grand Paris');
  await page.evaluate(() => window.__yy.runSearch({ area: [2.25, 48.8, 2.45, 48.95] }));
  await page.locator('.search-trigger').click();
  await page.locator('#q').fill('smash');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  t.then('deux fiches, avec adresses et horaires propres');
  const res = (await state(page)).response.results.filter((r) => r.restaurant.brandId === 'smash-club');
  assert.equal(res.length, 2);
  assert.notEqual(res[0].restaurant.address.street, res[1].restaurant.address.street);
  assert.notDeepEqual(res[0].restaurant.hours.weekly, res[1].restaurant.hours.weekly);
});

scenario(5, 'Statut halal non documenté : jamais « certifié »', async (t) => {
  t.given('« Wings Suprême », sans aucune preuve validée');
  const page = await newPage();
  await open(page, '#r-wings-supreme');
  t.then('la fiche affiche « Info halal à confirmer » et aucun badge certifié');
  await page.locator('.halal-card').getByText('Info halal à confirmer').waitFor();
  assert.equal(await page.locator('.halal-card', { hasText: 'Certifié' }).count(), 0);
  await page.screenshot({ path: 'e2e/screens/e2e-05.png' });
});

scenario(6, 'Certification expirée : badge adapté le jour même', async (t) => {
  t.given('« Istanbul Kitchen », certificat arrivé à échéance hier, vérification d’équipe valide');
  const page = await newPage();
  await open(page, '#r-istanbul-kitchen');
  t.then('le niveau affiché est « Vérifié par YallaYum » et l’expiration est dite');
  await page.locator('.halal-card h3', { hasText: 'Vérifié par YallaYum' }).waitFor();
  await page.getByText('Le certificat de l’organisme a expiré').waitFor();
  t.and('le filtre « Certifié uniquement » l’écarte');
  await page.getByRole('button', { name: 'Retour' }).click();
  await page.evaluate(() => window.__yy.runSearch({ filters: { ...window.__yy.store.get().filters, halalMin: 'certified' } }));
  await page.waitForTimeout(300);
  const names = (await state(page)).response.results.map((r) => r.restaurant.name);
  assert.ok(!names.includes('Istanbul Kitchen'));
});

scenario(7, 'Horaires 18:00 → 02:00 : ouvert juste après minuit', async (t) => {
  t.given('« Les Braises de Belleville », ouvert le vendredi de 18:00 à 02:00');
  const page = await newPage();
  await open(page);
  t.when('il est samedi 00:30 et je filtre « Ouvert maintenant »');
  await page.getByRole('button', { name: 'Profil' }).click();
  await page.getByRole('button', { name: /Banc d’essai du prototype/ }).click();
  await page.getByRole('button', { name: 'Samedi 00:30' }).click();
  await page.getByRole('button', { name: 'Fermer' }).click();
  await page.getByRole('button', { name: 'Explorer' }).click();
  await page.locator('.chip', { hasText: 'Ouvert maintenant' }).click();
  await page.waitForTimeout(800);
  t.then('elle fait partie des résultats, « ouvert jusqu’à 02:00 »');
  const hit = (await state(page)).response.results.find((r) => r.restaurant.id === 'braises-belleville');
  assert.ok(hit, 'absent des résultats');
  assert.equal(hit.open.state, 'open');
  assert.equal(hit.open.closesAt, '02:00');
  t.and('aucune adresse fermée ou aux horaires inconnus n’est présentée comme ouverte');
  for (const r of (await state(page)).response.results) assert.equal(r.open.state, 'open', r.restaurant.name);
  await page.screenshot({ path: 'e2e/screens/e2e-07.png' });
});

scenario(8, 'Retour de fiche : cadrage, filtres et sélection intacts', async (t) => {
  t.given('vendredi 23:30, un filtre actif, la carte déplacée et un marqueur sélectionné');
  const page = await newPage();
  await open(page);
  await page.evaluate(() => window.__yy.setEnv({ fixedTime: window.__yy.nextParisTime(5, '23:30'), fixedLabel: 'Vendredi 23:30' }));
  await page.locator('.chip', { hasText: 'Ouvert maintenant' }).click();
  await page.evaluate(() => window.__yyMap.jumpTo({ center: [2.37, 48.865], zoom: 14.2 }));
  await page.waitForTimeout(800);
  const target = (await state(page)).response.results[0]?.restaurant.id;
  assert.ok(target, `aucun résultat ouvert : ${JSON.stringify((await state(page)).response.results.length)}`);
  await page.evaluate((id) => window.__yy.store.set({ selectedId: id }), target);
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => ({ c: window.__yyMap.getCenter(), z: window.__yyMap.getZoom(), s: window.__yy.store.get() }));
  t.when('j’ouvre la fiche depuis le carrousel puis je reviens');
  await page.locator('.peek.is-current').click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Retour' }).click();
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({ c: window.__yyMap.getCenter(), z: window.__yyMap.getZoom(), s: window.__yy.store.get() }));
  t.then('même centre, même zoom, mêmes filtres, même sélection, même hauteur de feuille');
  assert.ok(Math.abs(before.c.lat - after.c.lat) < 1e-6 && Math.abs(before.c.lng - after.c.lng) < 1e-6, 'centre déplacé');
  assert.equal(before.z, after.z);
  assert.deepEqual(before.s.filters, after.s.filters);
  assert.equal(after.s.selectedId, before.s.selectedId);
  assert.equal(after.s.sheet, before.s.sheet);
  await page.locator('.marker-pill').waitFor();
});

scenario(9, 'Marqueurs, carrousel et liste : même ordre, même sélection', async (t) => {
  t.given('les résultats autour de République');
  const page = await newPage({ geolocation: { latitude: 48.8686, longitude: 2.3621 } });
  await open(page);
  await page.getByRole('button', { name: 'Autour de moi' }).click();
  await page.waitForTimeout(2000);
  const listOrder = await page.locator('.results').first().locator('.result').evaluateAll((els) => els.map((e) => e.dataset.id));
  t.when('je touche un marqueur');
  await page.locator('.marker').first().click();
  await page.waitForTimeout(900);
  t.then('le carrousel suit l’ordre de la liste et centre la carte du marqueur');
  const carouselOrder = await page.locator('.carousel .peek').evaluateAll((els) => els.map((e) => e.dataset.id));
  assert.deepEqual(carouselOrder, listOrder);
  const selected = (await state(page)).selectedId;
  assert.equal(await page.locator('.peek.is-current').getAttribute('data-id'), selected);
  t.when('je fais défiler le carrousel d’une carte');
  const idx = carouselOrder.indexOf(selected);
  const next = carouselOrder[(idx + 1) % carouselOrder.length];
  await page.locator(`.carousel .peek[data-id="${next}"]`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  t.then('la sélection et la pastille du marqueur suivent');
  assert.equal((await state(page)).selectedId, next);
  const name = await page.locator(`.carousel .peek[data-id="${next}"] h3`).textContent();
  await page.locator('.marker-pill', { hasText: name }).waitFor();
  await page.screenshot({ path: 'e2e/screens/e2e-09.png' });
});

scenario(10, 'Réseau perdu : état utile, données signalées comme anciennes', async (t) => {
  t.given('des résultats affichés, puis le réseau coupé');
  const page = await newPage();
  await open(page);
  const before = (await state(page)).response.results.length;
  await page.evaluate(() => {
    const s = window.__yy.store;
    s.set({ env: { ...s.get().env, network: 'offline' } });
  });
  await page.waitForTimeout(300);
  t.then('une bannière annonce des résultats en cache, peut-être anciens');
  await page.getByText('Hors ligne · résultats en cache, peut-être anciens').waitFor();
  t.when('je lance une recherche');
  await page.locator('.search-trigger').click();
  await page.locator('#q').fill('burger');
  await page.keyboard.press('Enter');
  t.then('les résultats précédents restent, avec un message clair');
  await page.getByText('Hors ligne : résultats en cache').waitFor();
  assert.equal((await state(page)).response.results.length, before);
  await page.screenshot({ path: 'e2e/screens/e2e-10.png' });
});

scenario(12, 'Contribution : file de modération, aucune publication', async (t) => {
  t.given('la fiche « Teranga Express »');
  const page = await newPage();
  await open(page, '#r-teranga-express');
  const before = await page.locator('.halal-card h3').textContent();
  t.when('je signale une information halal avec sa source');
  await page.locator('.halal-card').getByRole('button', { name: 'Signaler' }).click();
  await page.locator('#c-source').fill('Certificat affiché en vitrine');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  t.then('un accusé de réception le dit, et la fiche publiée ne change pas');
  await page.getByText('On vérifie avant toute modification').waitFor();
  assert.equal(await page.locator('.halal-card h3').textContent(), before);
  t.and('le signalement apparaît « Reçu » dans le profil');
  const s = await state(page);
  assert.equal(s.contributions[0].status, 'received');
});

scenario(14, 'Fidélité : un même QR scanné deux fois ne crédite qu’une fois', async (t) => {
  t.given('une carte activée');
  const page = await newPage({ storage: { account: { email: 'test@exemple.fr', since: Date.now() } } });
  await open(page);
  await page.getByRole('button', { name: 'Avantages' }).click();
  await page.getByRole('button', { name: 'Activer ma carte' }).click();
  t.when('le restaurant scanne le QR');
  await page.getByRole('button', { name: /Simuler un passage en caisse/ }).click();
  await page.getByText(/\+10 points/).waitFor();
  const after1 = (await state(page)).loyalty.ledger.length;
  t.and('le même QR est scanné une seconde fois');
  await page.getByRole('button', { name: 'Profil' }).click();
  await page.getByRole('button', { name: /Banc d’essai du prototype/ }).click();
  await page.getByRole('button', { name: 'Rescanner le même code' }).click();
  await page.getByRole('button', { name: 'Fermer' }).click();
  await page.getByRole('button', { name: 'Avantages' }).click();
  t.then('« Déjà enregistré », aucun point en double, une seule transaction');
  await page.getByText('Déjà enregistré.').waitFor();
  assert.equal((await state(page)).loyalty.ledger.length, after1);
  await page.screenshot({ path: 'e2e/screens/e2e-14.png' });
});

scenario(15, 'Suppression : ce qui part, ce qui reste et pourquoi', async (t) => {
  t.given('un compte avec une transaction de fidélité');
  const page = await newPage({
    storage: {
      account: { email: 'test@exemple.fr', since: Date.now() },
      loyalty: { activated: true, cardId: 'card-e2e', vouchers: [], ledger: [{ id: 't1', cardId: 'card-e2e', partnerId: 'p-dar-lalla', kind: 'earn', points: 10, at: new Date().toISOString(), idempotencyKey: 'k' }] },
      favorites: ['dar-lalla'],
    },
  });
  await open(page);
  t.when('je demande la suppression de mes données');
  await page.getByRole('button', { name: 'Profil' }).click();
  await page.getByRole('button', { name: 'Supprimer mes données' }).click();
  t.then('favoris supprimés, transactions conservées anonymisées, confirmation explicite exigée');
  await page.locator('.row', { hasText: 'Favoris et collections personnelles' }).getByText('Supprimé').waitFor();
  await page.locator('.row', { hasText: 'Transactions de fidélité' }).getByText(/Conservé 10 an/).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Supprimer définitivement' }).isDisabled());
});

scenario(16, 'Grande police et lecteur d’écran : rien ne déborde, tout est nommé', async (t) => {
  t.given('un texte à 200 % et les animations réduites');
  const page = await newPage({ env: { textScale: 2 } });
  await open(page);
  t.then('aucun défilement horizontal sur la carte');
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok((await overflow()) <= 0, 'débordement horizontal');
  t.and('chaque bouton a un nom accessible');
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('button, a, [role="button"]')]
      .filter((b) => b.offsetParent !== null)
      .filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim() || b.getAttribute('title')))
      .map((b) => b.outerHTML.slice(0, 80)),
  );
  assert.deepEqual(unnamed, []);
  t.when('j’ouvre une fiche');
  await page.locator('.result').first().click();
  await page.waitForTimeout(900);
  t.then('l’itinéraire reste visible et nommé, sans débordement');
  await page.getByRole('button', { name: /Itinéraire/ }).waitFor();
  assert.ok((await overflow()) <= 0);
  const bar = await page.locator('.action-bar').boundingBox();
  assert.ok(bar.y + bar.height <= 844 + 1, 'barre d’action hors écran');
  await page.screenshot({ path: 'e2e/screens/e2e-16.png' });
});

scenario(17, 'Liens profonds : fiche, ancien lien, déménagement, introuvable', async (t) => {
  const page = await newPage();
  t.when('j’ouvre yallayum.app/r/les-braises-de-belleville');
  await open(page, '#r-les-braises-de-belleville');
  t.then('la fiche s’ouvre');
  await page.locator('.fiche-title', { hasText: 'Les Braises de Belleville' }).waitFor();
  t.when('j’ouvre un ancien lien (/r/seoul-fried-paris)');
  await page.goto(BASE + '#r-seoul-fried-paris');
  await page.waitForTimeout(1200);
  t.then('il mène à la fiche actuelle');
  await page.locator('.fiche-title', { hasText: 'Seoul Fried' }).last().waitFor();
  t.when('j’ouvre le lien d’une adresse qui a déménagé');
  await page.goto(BASE + '#r-seoul-fried-ancienne-adresse');
  await page.waitForTimeout(1200);
  t.then('un message le dit et la nouvelle adresse s’ouvre');
  await page.getByText('a déménagé : voici la nouvelle adresse').waitFor();
  t.when('j’ouvre un lien qui n’existe pas');
  await page.goto(BASE + '#r-n-existe-pas');
  await page.waitForTimeout(1200);
  t.then('« Lien introuvable », avec une recherche proposée');
  await page.getByText('Lien introuvable').waitFor();
});

scenario(18, 'Sponsorisé : signalé, à sa place, sans passe-droit halal', async (t) => {
  t.given('« Burger Garage », campagne active, information halal « déclarée »');
  const page = await newPage();
  await open(page);
  t.then('il est inséré une seule fois, en 3e position, marqué « Sponsorisé »');
  const res = (await state(page)).response.results;
  const idx = res.findIndex((r) => r.restaurant.id === 'burger-garage');
  assert.equal(idx, 2);
  assert.equal(res[idx].sponsored, true);
  assert.equal(res.filter((r) => r.restaurant.id === 'burger-garage').length, 1);
  await page.locator('.result', { hasText: 'Burger Garage' }).getByText('Sponsorisé').waitFor();
  t.when('j’ouvre sa fiche');
  await page.locator('.result', { hasText: 'Burger Garage' }).click();
  t.then('la mention sponsorisée est expliquée et le niveau reste « Déclaré par le restaurant »');
  await page.getByText('a payé pour apparaître plus haut').waitFor();
  await page.locator('.halal-card h3', { hasText: 'Déclaré par le restaurant' }).waitFor();
  await page.screenshot({ path: 'e2e/screens/e2e-18.png' });
  t.when('je filtre « Vérifié ou certifié »');
  await page.getByRole('button', { name: 'Retour' }).click();
  await page.evaluate(() => window.__yy.runSearch({ filters: { ...window.__yy.store.get().filters, halalMin: 'team_verified' } }));
  await page.waitForTimeout(300);
  t.then('il n’apparaît plus du tout');
  assert.ok(!(await state(page)).response.results.some((r) => r.restaurant.id === 'burger-garage'));
});

try {
  await runAll();
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} scénario(s) en échec` : '\nTous les scénarios passent.');
process.exit(failures ? 1 : 0);
