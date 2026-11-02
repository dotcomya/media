// État de l'application mobile et actions.
//
// Tout ce qui doit survivre à l'ouverture d'une fiche (zone, filtres, tri,
// sélection, hauteur de la feuille, cadrage de la carte) vit ici et non dans
// les composants : revenir d'une fiche retrouve exactement l'écran quitté.

import { ARTICLES, CERTIFIERS, COLLECTIONS, LOYALTY_PARTNERS, RESTAURANTS, type EditorialCollection } from '../data/demo';
import { buildEvent, type EventName, type TrackedEvent } from '../domain/analytics';
import { activeFilterKeys, EMPTY_FILTERS, removeFilter, type FilterKey, type Filters } from '../domain/filters';
import { bboxAround, bboxOf, distanceMeters, inBBox, scaleBBox } from '../domain/geo';
import { isOpenAt, localClock, addDays, zonedInstant, hoursConfidence } from '../domain/hours';
import { cardToken, demoSigner, DEMO_PROGRAM, earn, type EarnOutcome, type LoyaltyTx, type Voucher, redeem as redeemPoints } from '../domain/loyalty';
import { CONTRIBUTION_LABELS, type Contribution, type ContributionKind } from '../domain/moderation';
import { PLACES, placeBBox, type Place } from '../domain/places';
import { isDiscoverable } from '../domain/publication';
import { interpret, type Interpretation } from '../domain/query';
import { search, type SearchResponse } from '../domain/search';
import type { SortKey } from '../domain/ranking';
import type { BBox, LatLng, Restaurant } from '../domain/types';
import { createStore, storage } from './store';
import { vibrate } from './haptics';

export type Tab = 'explore' | 'collections' | 'loyalty' | 'profile';
export type SheetSnap = 'peek' | 'half' | 'full';
export type GpsMode = 'real' | 'simulated' | 'denied' | 'unavailable' | 'imprecise';
export type NetworkMode = 'online' | 'offline';
export type NavApp = 'apple' | 'google' | 'waze' | 'citymapper';

export interface LocationState {
  status: 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable';
  position?: LatLng;
  accuracy?: number;
  simulated?: boolean;
  /** Ville choisie à la main, quand la position n'est pas partagée. */
  city?: Place;
}

export interface Env {
  /** Heure simulée (ms) ; absent = heure réelle. */
  fixedTime?: number;
  fixedLabel?: string;
  gps: GpsMode;
  network: NetworkMode;
  reducedMotion: boolean;
  textScale: number;
  theme: 'system' | 'light' | 'dark';
}

export type Overlay =
  | { kind: 'search' }
  | { kind: 'filters'; focus?: 'cuisines' | 'occasions' | 'price' | 'halal' }
  | { kind: 'route'; restaurantId: string }
  | { kind: 'contribute'; restaurantId?: string; preset?: ContributionKind }
  | { kind: 'lab' }
  | { kind: 'account'; reason: string }
  | { kind: 'privacy' }
  | { kind: 'halal-help' }
  | { kind: 'why'; restaurantId: string }
  | { kind: 'city' }
  | { kind: 'deletion' };

export interface Page {
  kind: 'restaurant' | 'collection' | 'article' | 'link';
  id: string;
  /** Rectangle de la vignette d'origine, pour l'ouverture « morphing ». */
  from?: DOMRect;
}

export interface AppState {
  tab: Tab;
  onboarded: boolean;
  location: LocationState;
  // Recherche
  query: string;
  interpretation?: Interpretation;
  filters: Filters;
  sort: SortKey;
  area: BBox;
  areaLabel: string;
  origin?: LatLng;
  originIsUser: boolean;
  response: SearchResponse;
  /** La carte a bougé depuis la dernière recherche. */
  areaDirty: boolean;
  showUncertain: boolean;
  selectedId?: string;
  sheet: SheetSnap;
  /** Cadrage de la carte demandé par une action (vol vers une ville, recentrage). */
  camera?: { bbox?: BBox; center?: LatLng; zoom?: number; nonce: number };
  /** Résultats affichés hors ligne : date de la dernière réponse du serveur. */
  cachedAt?: number;
  // Navigation
  pages: Page[];
  overlay?: Overlay;
  toast?: { text: string; action?: { label: string; run: () => void }; nonce: number };
  // Personnel (stocké sur le téléphone)
  favorites: string[];
  visited: string[];
  recent: string[];
  consent: { analytics: boolean; history: boolean; decided: boolean };
  prefs: { navApp?: NavApp };
  account?: { email: string; since: number };
  contributions: Contribution[];
  loyalty: { activated: boolean; cardId: string; ledger: LoyaltyTx[]; vouchers: Voucher[]; last?: EarnOutcome & { at: number } };
  events: TrackedEvent[];
  env: Env;
}

const PARIS = PLACES.find((p) => p.id === 'paris')!;
const REPUBLIQUE = PLACES.find((p) => p.id === 'republique')!;
const ARTIFACT = typeof __ARTIFACT__ !== 'undefined' && __ARTIFACT__;

const savedEnv = storage.read<Partial<Env>>('env', {});

const initialEnv: Env = {
  gps: ARTIFACT ? 'simulated' : 'real',
  network: 'online',
  reducedMotion: false,
  textScale: 1,
  theme: 'system',
  ...savedEnv,
  // L'heure simulée ne survit pas à un rechargement : on revient au présent.
  fixedTime: undefined,
  fixedLabel: undefined,
};

export const store = createStore<AppState>({
  tab: 'explore',
  onboarded: storage.read('onboarded', false),
  location: { status: 'idle' },
  query: '',
  filters: EMPTY_FILTERS,
  sort: 'relevance',
  area: placeBBox(PARIS),
  areaLabel: 'Paris',
  origin: PARIS.center,
  originIsUser: false,
  response: { results: [], uncertain: [], areaEmpty: false },
  areaDirty: false,
  showUncertain: false,
  sheet: 'half',
  pages: [],
  favorites: storage.read('favorites', [] as string[]),
  visited: storage.read('visited', [] as string[]),
  recent: storage.read('recent', [] as string[]),
  consent: storage.read('consent', { analytics: false, history: true, decided: false }),
  prefs: storage.read('prefs', {}),
  account: storage.read('account', undefined),
  contributions: storage.read('contributions', [] as Contribution[]),
  loyalty: storage.read('loyalty', { activated: false, cardId: `card-${Math.random().toString(36).slice(2, 8)}`, ledger: [] as LoyaltyTx[], vouchers: [] as Voucher[] }),
  events: [],
  env: initialEnv,
});

// Les tests de bout en bout lisent l'état en développement (jamais en production).
if (import.meta.env.DEV) (window as unknown as { __yy: unknown }).__yy = { store, runSearch: (patch: Partial<AppState>) => runSearch(patch), setEnv: (patch: Partial<Env>) => setEnv(patch), nextParisTime: (d: number, t: string) => nextParisTime(d, t) };

// ─── Temps ──────────────────────────────────────────────────────────────────

export function now(): Date {
  return new Date(store.get().env.fixedTime ?? Date.now());
}

export function today(): string {
  return localClock(now(), 'Europe/Paris').date;
}

// ─── Mesure d'audience (journal visible dans le banc d'essai) ───────────────

export function track(name: EventName, props: Record<string, unknown> = {}) {
  const s = store.get();
  const e = buildEvent(name, props, { analytics: s.consent.analytics }, now());
  if (!e) return;
  store.set({ events: [e, ...s.events].slice(0, 120) });
}

// ─── Recherche ──────────────────────────────────────────────────────────────

export const CATALOG: Restaurant[] = RESTAURANTS;

export function restaurantById(id: string): Restaurant | undefined {
  return CATALOG.find((r) => r.id === id);
}

function filtersWithInterpretation(f: Filters, i?: Interpretation): Filters {
  if (!i) return f;
  return {
    ...f,
    cuisines: [...new Set([...f.cuisines, ...i.cuisines])],
    occasions: [...new Set([...f.occasions, ...i.occasions])],
    amenities: [...new Set([...f.amenities, ...i.amenities])],
    priceMax: i.priceMax ?? f.priceMax,
    openNow: f.openNow || i.openNow,
    openAt: i.openAt ?? f.openAt,
  };
}

/** Relance la recherche avec l'état courant (zone, filtres, tri, requête). */
export function runSearch(extra: Partial<AppState> = {}) {
  store.set(extra);
  const s = store.get();
  if (s.env.network === 'offline') {
    // Hors ligne : on garde les derniers résultats, signalés comme possiblement anciens.
    store.set({ areaDirty: false, toast: { text: 'Hors ligne : résultats en cache, peut-être anciens.', nonce: Date.now() } });
    return;
  }
  const response = search(
    CATALOG,
    {
      area: s.area,
      origin: s.origin,
      originIsUser: s.originIsUser,
      text: s.interpretation?.text ?? '',
      dishTerms: s.interpretation?.dishTerms ?? [],
      filters: s.filters,
      sort: s.sort,
      now: now(),
    },
    CERTIFIERS,
  );
  const selectedStillThere = s.selectedId && response.results.some((r) => r.restaurant.id === s.selectedId);
  store.set({
    response,
    areaDirty: false,
    cachedAt: Date.now(),
    selectedId: selectedStillThere ? s.selectedId : undefined,
    // Zéro résultat : la feuille monte pour que les corrections proposées soient lisibles en entier.
    ...(response.results.length === 0 && !response.areaEmpty ? { sheet: 'full' as const } : {}),
  });
}

export function setFilters(next: Filters, changed?: FilterKey) {
  const before = store.get().filters;
  runSearch({ filters: next });
  if (changed) {
    const added = activeFilterKeys(next).includes(changed) && !activeFilterKeys(before).includes(changed);
    track('filter_applied', { filter: changed, action: added ? 'add' : 'remove', results: store.get().response.results.length });
  }
}

export function clearFilters() {
  runSearch({ filters: EMPTY_FILTERS, interpretation: undefined, query: '' });
  track('filter_applied', { filter: 'all', action: 'clear_all', results: store.get().response.results.length });
}

export function dropFilter(key: FilterKey) {
  const s = store.get();
  // Un filtre venu de la requête comprise disparaît aussi de la puce correspondante.
  let i = s.interpretation;
  if (i) {
    i = { ...i };
    if (key === 'cuisines') i.cuisines = [];
    if (key === 'occasions') i.occasions = [];
    if (key === 'amenities') i.amenities = [];
    if (key === 'priceMax') i.priceMax = undefined;
    if (key === 'openNow') i.openNow = false;
    if (key === 'openAt') i.openAt = undefined;
  }
  setFilters(removeFilter(s.filters, key), key);
  store.set({ interpretation: i });
}

/** Applique une requête comprise : lieu → zone, le reste → filtres stricts. */
export function submitQuery(raw: string) {
  const s = store.get();
  const origin = s.location.position ?? mapCenter(s.area);
  const i = interpret(raw, { origin });
  const patch: Partial<AppState> = { query: raw, interpretation: i, filters: filtersWithInterpretation({ ...s.filters, openNow: s.filters.openNow }, i) };
  if (i.place) {
    const area = placeBBox(i.place);
    Object.assign(patch, { area, areaLabel: i.place.name, origin: i.place.center, originIsUser: false, camera: { bbox: area, nonce: Date.now() } });
  } else if (i.nearMe && s.location.position) {
    const area = bboxAround(s.location.position, 900);
    Object.assign(patch, { area, areaLabel: 'Autour de toi', origin: s.location.position, originIsUser: true, camera: { bbox: area, nonce: Date.now() } });
  } else if (i.text && !i.cuisines.length && !i.occasions.length) {
    // Recherche d'un nom : on cherche dans tout le catalogue chargé, pas seulement la carte.
    const matches = CATALOG.filter(isDiscoverable).filter((r) => r.name.toLowerCase().includes(i.text));
    const bbox = bboxOf(matches.map((m) => m.location));
    if (bbox) Object.assign(patch, { area: scaleBBox(bbox, 1.6), areaLabel: `« ${i.text} »`, camera: { bbox: scaleBBox(bbox, 1.6), nonce: Date.now() } });
  }
  runSearch({ ...patch, selectedId: undefined, sheet: 'half' });
  const r = store.get().response;
  track('search_submitted', {
    results: r.results.length,
    zero_query: r.results.length === 0 ? raw : undefined,
    understood_place: !!i.place,
    understood_cuisine: i.cuisines.length > 0,
    understood_occasion: i.occasions.length > 0,
  });
  if (s.consent.history && raw.trim()) {
    const recent = [raw.trim(), ...s.recent.filter((q) => q !== raw.trim())].slice(0, 8);
    store.set({ recent });
    storage.write('recent', recent);
  }
}

export function choosePlace(place: Place) {
  const area = placeBBox(place);
  runSearch({
    area,
    areaLabel: place.name,
    origin: place.center,
    originIsUser: false,
    camera: { bbox: area, nonce: Date.now() },
    location: { ...store.get().location, city: place },
    selectedId: undefined,
  });
}

export function mapCenter(b: BBox): LatLng {
  return { lat: (b[1] + b[3]) / 2, lng: (b[0] + b[2]) / 2 };
}

/** « Rechercher dans cette zone » : la zone visible devient la zone de recherche. */
export function searchVisibleArea(bbox: BBox) {
  const s = store.get();
  const center = mapCenter(bbox);
  const userInside = s.location.position && inBBox(s.location.position, bbox);
  runSearch({
    area: bbox,
    areaLabel: 'Cette zone',
    origin: userInside ? s.location.position : center,
    originIsUser: !!userInside,
  });
  track('map_area_searched', { results: store.get().response.results.length });
}

export function expandArea() {
  const s = store.get();
  const area = scaleBBox(s.area, 2.5);
  runSearch({ area, areaLabel: `${s.areaLabel} et alentours`, camera: { bbox: area, nonce: Date.now() } });
}

// ─── Position ───────────────────────────────────────────────────────────────

const COVERAGE_RADIUS = 30_000;

function nearestRestaurantDistance(p: LatLng): number {
  return Math.min(...CATALOG.filter(isDiscoverable).map((r) => distanceMeters(p, r.location)));
}

function applyLocation(position: LatLng, accuracy: number, simulated: boolean) {
  const area = bboxAround(position, Math.max(800, Math.min(accuracy, 2500)));
  const covered = nearestRestaurantDistance(position) < COVERAGE_RADIUS;
  store.set({ location: { status: 'granted', position, accuracy, simulated } });
  track('location_permission_result', { result: 'granted' });
  if (!covered) {
    runSearch({ area: placeBBox(PARIS), areaLabel: 'Paris', origin: PARIS.center, originIsUser: false, camera: { center: position, zoom: 11, nonce: Date.now() } });
    toast('Aucune adresse de la démo près de toi. On t’affiche Paris.', { label: 'Voir Paris', run: () => choosePlace(PARIS) });
    return;
  }
  runSearch({ area, areaLabel: 'Autour de toi', origin: position, originIsUser: true, camera: { center: position, zoom: 15, nonce: Date.now() }, selectedId: undefined });
  if (accuracy > 1000) toast(`Position approximative (± ${(accuracy / 1000).toFixed(1).replace('.', ',')} km)`);
}

export function requestLocation() {
  const { env } = store.get();
  store.set({ location: { ...store.get().location, status: 'locating' } });
  const fail = (status: 'denied' | 'unavailable') => {
    store.set({ location: { ...store.get().location, status } });
    track('location_permission_result', { result: status });
    toast(status === 'denied' ? 'Position refusée. Choisis une ville, tout reste accessible.' : 'Position indisponible pour le moment. Choisis une ville.', {
      label: 'Choisir',
      run: () => openOverlay({ kind: 'city' }),
    });
  };
  const sim = (p: LatLng, acc: number) => setTimeout(() => applyLocation(p, acc, true), 450);
  if (env.gps === 'simulated') return sim({ lat: REPUBLIQUE.center.lat + 0.0012, lng: REPUBLIQUE.center.lng - 0.0015 }, 25);
  if (env.gps === 'imprecise') return sim(REPUBLIQUE.center, 1800);
  if (env.gps === 'denied') return setTimeout(() => fail('denied'), 300);
  if (env.gps === 'unavailable') return setTimeout(() => fail('unavailable'), 600);
  if (!('geolocation' in navigator)) return fail('unavailable');
  navigator.geolocation.getCurrentPosition(
    (pos) => applyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }, pos.coords.accuracy, false),
    (err) => fail(err.code === 1 ? 'denied' : 'unavailable'),
    { enableHighAccuracy: true, timeout: 9000, maximumAge: 60_000 },
  );
}

/** « Autour de moi » : la zone devient le voisinage de la position, demandée si besoin. */
export function searchAroundMe() {
  const { location } = store.get();
  if (location.status === 'granted' && location.position) {
    const area = bboxAround(location.position, 900);
    runSearch({ area, areaLabel: 'Autour de toi', origin: location.position, originIsUser: true, camera: { bbox: area, nonce: Date.now() }, selectedId: undefined });
  } else {
    requestLocation();
  }
}

export function recenter() {
  const { location } = store.get();
  if (location.status === 'granted' && location.position) {
    store.set({ camera: { center: location.position, zoom: 15, nonce: Date.now() } });
  } else {
    requestLocation();
  }
}

// ─── Navigation dans l'app ──────────────────────────────────────────────────

export function openRestaurant(id: string, source: string, from?: DOMRect) {
  const s = store.get();
  const ranked = s.response.results.find((r) => r.restaurant.id === id);
  store.set({ pages: [...s.pages, { kind: 'restaurant', id, from }] });
  track('restaurant_opened', { restaurant_id: id, source, sponsored: ranked?.sponsored ?? false, distance: bucket(id) });
}

export function openPage(page: Page) {
  store.set({ pages: [...store.get().pages, page] });
}

export function closePage() {
  store.set({ pages: store.get().pages.slice(0, -1) });
}

export function openOverlay(overlay: Overlay) {
  store.set({ overlay });
}

export function closeOverlay() {
  store.set({ overlay: undefined });
}

export function toast(text: string, action?: { label: string; run: () => void }) {
  store.set({ toast: { text, action, nonce: Date.now() } });
}

export function setTab(tab: Tab) {
  store.set({ tab, pages: [] });
}

function bucket(id: string) {
  const s = store.get();
  const r = restaurantById(id);
  if (!r || !s.location.position) return 'inconnue';
  const d = distanceMeters(s.location.position, r.location);
  return d < 500 ? '<500m' : d < 1000 ? '500m-1km' : d < 3000 ? '1-3km' : d < 10000 ? '3-10km' : '>10km';
}

export function distanceBucketFor(id: string) {
  return bucket(id);
}

// ─── Favoris, carnet ────────────────────────────────────────────────────────

export function toggleFavorite(id: string) {
  const s = store.get();
  const on = s.favorites.includes(id);
  const favorites = on ? s.favorites.filter((f) => f !== id) : [id, ...s.favorites];
  store.set({ favorites });
  storage.write('favorites', favorites);
  vibrate(on ? 8 : [10, 30, 14]);
  if (!on) {
    track('favorite_added', { restaurant_id: id, signed_in: !!s.account });
    if (!s.account && s.favorites.length === 0) {
      toast('Enregistré sur ce téléphone.', { label: 'Synchroniser', run: () => openOverlay({ kind: 'account', reason: 'Garde tes favoris même si tu changes de téléphone.' }) });
    } else {
      toast('Ajouté à tes favoris.');
    }
  }
}

export function toggleVisited(id: string) {
  const s = store.get();
  const visited = s.visited.includes(id) ? s.visited.filter((v) => v !== id) : [id, ...s.visited];
  store.set({ visited });
  storage.write('visited', visited);
}

// ─── Consentements ──────────────────────────────────────────────────────────

export function setConsent(patch: Partial<AppState['consent']>) {
  const consent = { ...store.get().consent, ...patch, decided: true };
  store.set({ consent });
  storage.write('consent', consent);
  if (patch.history === false) {
    store.set({ recent: [] });
    storage.write('recent', []);
  }
}

// ─── Contributions ──────────────────────────────────────────────────────────

export function submitContribution(c: Omit<Contribution, 'id' | 'status' | 'createdAt' | 'history'>) {
  const s = store.get();
  const at = now().toISOString();
  const contribution: Contribution = {
    ...c,
    id: `k-${Date.now().toString(36)}`,
    status: 'received',
    createdAt: at,
    history: [{ at, status: 'received' }],
    userId: s.account?.email,
  };
  const contributions = [contribution, ...s.contributions];
  store.set({ contributions });
  storage.write('contributions', contributions);
  track('report_submitted', { kind: c.kind });
  toast(
    s.env.network === 'offline'
      ? 'Enregistré : envoi dès le retour du réseau.'
      : `${CONTRIBUTION_LABELS[c.kind]} : reçu. On vérifie avant toute modification.`,
  );
}

// ─── Fidélité ───────────────────────────────────────────────────────────────

export const SIGNER = demoSigner('demo-secret-ne-pas-utiliser-en-production');

export function currentToken(at = now()): string {
  return cardToken(store.get().loyalty.cardId, at, DEMO_PROGRAM, SIGNER);
}

function saveLoyalty() {
  storage.write('loyalty', store.get().loyalty);
}

export function activateCard() {
  store.set({ loyalty: { ...store.get().loyalty, activated: true } });
  saveLoyalty();
  track('loyalty_card_opened', { activated: true });
}

/**
 * Simule le passage en caisse : le terminal du partenaire scanne le jeton
 * présenté. `replay` rejoue exactement le même jeton (double scan).
 */
export function simulateScan(partnerId = LOYALTY_PARTNERS[0].id, mode: 'fresh' | 'replay' | 'expired' = 'fresh') {
  const s = store.get();
  const at = now();
  const token =
    mode === 'replay' && s.loyalty.last && 'tx' in s.loyalty.last
      ? s.loyalty.last.tx.idempotencyKey.split(':').slice(2).join(':')
      : mode === 'expired'
        ? currentToken(new Date(at.getTime() - 10 * 60_000))
        : currentToken(at);
  const { outcome, ledger } = earn(s.loyalty.ledger, { token, partnerId, partnerActive: true, merchantUserId: 'caisse-demo', at }, DEMO_PROGRAM, SIGNER);
  store.set({ loyalty: { ...s.loyalty, ledger, last: { ...outcome, at: Date.now() } } });
  saveLoyalty();
  vibrate(outcome.status === 'credited' ? [12, 40, 18] : 30);
  track('loyalty_transaction_result', { status: outcome.status });
}

export function redeemReward(rewardId: string) {
  const s = store.get();
  const reward = DEMO_PROGRAM.rewards.find((r) => r.id === rewardId);
  if (!reward) return;
  const res = redeemPoints(s.loyalty.ledger, s.loyalty.cardId, reward, now());
  if (!res.ok) {
    toast(`Encore ${res.missing} points.`);
    return;
  }
  store.set({ loyalty: { ...s.loyalty, ledger: res.ledger, vouchers: [res.voucher, ...s.loyalty.vouchers] } });
  saveLoyalty();
  toast(`${reward.label} : bon disponible ${reward.validityDays} jours.`);
}

// ─── Collections calculées ──────────────────────────────────────────────────

export function collectionRestaurants(c: EditorialCollection): Restaurant[] {
  const visible = CATALOG.filter(isDiscoverable);
  if (c.restaurantIds) return c.restaurantIds.map((id) => visible.find((r) => r.id === id)).filter((r): r is Restaurant => !!r);
  const t = today();
  if (c.rule === 'newest') return visible.filter((r) => r.publishedAt && r.publishedAt >= addDays(t, -60)).sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  if (c.rule === 'late_night') {
    return visible.filter(
      (r) => r.operating === 'operating' && r.hours && hoursConfidence(r.hours, t) === 'confirmed' && isOpenAt(r.hours, t, 25 * 60),
    );
  }
  return [];
}

export function showCollectionOnMap(c: EditorialCollection) {
  const list = collectionRestaurants(c);
  const bbox = bboxOf(list.map((r) => r.location));
  if (!bbox) return;
  const area = scaleBBox(bbox, 1.25);
  store.set({ tab: 'explore', pages: [] });
  runSearch({
    filters: { ...EMPTY_FILTERS, collection: { id: c.id, title: c.title, restaurantIds: list.map((r) => r.id) } },
    interpretation: undefined,
    query: '',
    area,
    areaLabel: c.title,
    origin: store.get().location.position ?? mapCenter(area),
    originIsUser: !!store.get().location.position,
    camera: { bbox: area, nonce: Date.now() },
    selectedId: undefined,
    sheet: 'half',
  });
}

export function showArticleOnMap(articleId: string) {
  const a = ARTICLES.find((x) => x.id === articleId);
  if (!a) return;
  showCollectionOnMap({ id: a.id, title: a.title, kicker: a.kicker, intro: '', criteria: [], restaurantIds: a.restaurantIds, hue: a.hue });
}

export { COLLECTIONS, ARTICLES };

// ─── Banc d'essai ───────────────────────────────────────────────────────────

export function setEnv(patch: Partial<Env>) {
  const env = { ...store.get().env, ...patch };
  store.set({ env });
  const { fixedTime: _t, fixedLabel: _l, ...persist } = env;
  storage.write('env', persist);
  if ('fixedTime' in patch || 'network' in patch) runSearch();
}

/** Prochaine occurrence d'un jour et d'une heure à Paris (« samedi 00:30 »). */
export function nextParisTime(weekday: number, time: string): number {
  const t = today();
  for (let i = 0; i < 8; i++) {
    const d = addDays(t, i);
    const day = new Date(`${d}T12:00:00Z`).getUTCDay() || 7;
    if (day === weekday) {
      const at = zonedInstant(d, time, 'Europe/Paris');
      if (at.getTime() > Date.now() - 60_000 || i > 0) return at.getTime();
    }
  }
  return Date.now();
}

export function finishOnboarding() {
  store.set({ onboarded: true });
  storage.write('onboarded', true);
}

export function resetDemo() {
  storage.clear();
  location.hash = '';
  location.reload();
}
