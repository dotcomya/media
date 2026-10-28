// Coque de l'application : quatre onglets, pages empilées, feuilles modales.

import { useEffect, useRef, useState } from 'preact/hooks';
import { localClock } from '../domain/hours';
import { Icon, type IconName } from '../ui/Icon';
import { ArticlePage, CollectionPage, Collections } from './collections/Collections';
import { Explore } from './explore/Explore';
import { CityPicker, FiltersSheet } from './explore/Filters';
import { SearchScreen } from './explore/SearchScreen';
import { Loyalty } from './loyalty/Loyalty';
import { AccountSheet, ContributeSheet, DeletionSheet, HalalHelpSheet, PrivacySheet, RouteSheet, WhySheet } from './overlays';
import { Lab } from './profile/Lab';
import { Profile } from './profile/Profile';
import { LinkPage, RestaurantPage } from './restaurant/RestaurantPage';
import { useStore } from './store';
import { now, openPage, restaurantById, runSearch, setTab, store, track, type Tab } from './state';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'explore', label: 'Explorer', icon: 'map' },
  { id: 'collections', label: 'Collections', icon: 'stack' },
  { id: 'loyalty', label: 'Avantages', icon: 'gift' },
  { id: 'profile', label: 'Profil', icon: 'user' },
];

// Thème posé par l'hébergeur (artefact) : à respecter en mode « système ».
const HOST_THEME = document.documentElement.dataset.theme;

function useDark(theme: 'system' | 'light' | 'dark') {
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined;
  const read = () => {
    const attr = document.documentElement.dataset.theme;
    return attr ? attr === 'dark' : !!mq?.matches;
  };
  const [sys, setSys] = useState(read);
  useEffect(() => {
    const on = () => setSys(read());
    mq?.addEventListener('change', on);
    const mo = new MutationObserver(on);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq?.removeEventListener('change', on);
      mo.disconnect();
    };
  }, []);
  return theme === 'system' ? sys : theme === 'dark';
}

export function App() {
  const tab = useStore(store, (s) => s.tab);
  const pages = useStore(store, (s) => s.pages);
  const overlay = useStore(store, (s) => s.overlay);
  const env = useStore(store, (s) => s.env);
  const toastState = useStore(store, (s) => s.toast);
  const dark = useDark(env.theme);
  const device = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(800);
  const [splash, setSplash] = useState(true);

  // Thème, taille du texte, animations : appliqués à la racine.
  useEffect(() => {
    const root = document.documentElement;
    if (env.theme !== 'system') root.dataset.theme = env.theme;
    else if (HOST_THEME) root.dataset.theme = HOST_THEME;
    else delete root.dataset.theme;
    root.style.fontSize = `${16 * env.textScale}px`;
    root.classList.toggle('reduce-motion', env.reducedMotion);
  }, [env.theme, env.textScale, env.reducedMotion]);

  useEffect(() => {
    const el = device.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    runSearch();
    track('app_open', { cold_start: true });
    const t = setTimeout(() => setSplash(false), 1500);
    // Lien profond : #r-<slug>
    const openFromHash = () => {
      const m = location.hash.match(/^#r-([a-z0-9-]+)$/);
      if (m) openPage({ kind: 'link', id: m[1] });
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => {
      clearTimeout(t);
      window.removeEventListener('hashchange', openFromHash);
    };
  }, []);

  // L'adresse reflète la fiche ouverte : copiable, partageable.
  useEffect(() => {
    const top = pages[pages.length - 1];
    const r = top?.kind === 'restaurant' ? restaurantById(top.id) : undefined;
    try {
      const target = r ? `#r-${r.slug}` : '';
      if (location.hash !== target && (r || location.hash.startsWith('#r-'))) history.replaceState(null, '', target || location.pathname + location.search);
    } catch {
      // Cadre qui refuse la modification de l'adresse : sans conséquence.
    }
  }, [pages]);

  const clock = localClock(now(), 'Europe/Paris');
  const time = `${String(Math.floor(clock.minutes / 60)).padStart(2, '0')}:${String(clock.minutes % 60).padStart(2, '0')}`;
  const tabIndex = TABS.findIndex((t) => t.id === tab);

  return (
    <div class="stage">
      <aside class="side-notes" aria-label="À propos du prototype">
        <span class="wordmark">Yalla Yum</span>
        <h1>Le GPS de la restauration halal.</h1>
        <p>Prototype interactif. La carte d’abord : cherche une ville, une cuisine ou une envie, touche un marqueur, ouvre une fiche, pars.</p>
        <p>Chaque adresse affiche un niveau de preuve halal daté : certifié, vérifié, déclaré ou à confirmer. Jamais confondus.</p>
        <p style={{ fontSize: '0.8125rem' }}>Établissements, organismes et numéros fictifs ; rues et quartiers réels. Visuels génératifs signalés comme illustrations.</p>
        <div class="links">
          <a class="btn btn-secondary btn-sm" href={__ARTIFACT__ ? '#admin' : 'admin.html'}>
            Back-office
          </a>
          <button type="button" class="btn btn-secondary btn-sm" onClick={() => store.set({ overlay: { kind: 'lab' } })}>
            Banc d’essai
          </button>
        </div>
      </aside>

      <div class="device" ref={device}>
        <div class="statusbar" aria-hidden="true">
          <span class="tnum">{time}</span>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
              <rect x="0" y="8" width="3" height="4" rx="1" />
              <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
              <rect x="10" y="3" width="3" height="9" rx="1" />
              <rect x="15" y="0" width="3" height="12" rx="1" opacity={env.network === 'offline' ? 0.3 : 1} />
            </svg>
            <svg width="26" height="12" viewBox="0 0 26 12" fill="none" stroke="currentColor">
              <rect x="0.5" y="0.5" width="22" height="11" rx="3.5" opacity="0.5" />
              <rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" stroke="none" />
              <path d="M24.5 4v4" stroke-width="1.5" stroke-linecap="round" opacity="0.5" />
            </svg>
          </span>
        </div>

        <main style={{ position: 'absolute', inset: 0 }}>
          <div hidden={tab !== 'explore'} style={{ position: 'absolute', inset: 0 }}>
            <Explore height={height} dark={dark} />
          </div>
          {tab === 'collections' && <Collections />}
          {tab === 'loyalty' && <Loyalty />}
          {tab === 'profile' && <Profile />}
        </main>

        <nav class="tabbar" aria-label="Navigation principale">
          <span class="tab-blob" style={{ left: `calc(8px + (100% - 16px) / 4 * ${tabIndex} + ((100% - 16px) / 4 - 58px) / 2)` }} aria-hidden="true" />
          {TABS.map((t) => (
            <button key={t.id} type="button" class="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} filled={false} />
              {t.label}
            </button>
          ))}
        </nav>

        {pages.map((p, i) => (
          <div key={`${p.kind}-${p.id}-${i}`} style={{ position: 'absolute', inset: 0, zIndex: 60 + i }}>
            {p.kind === 'restaurant' && <RestaurantPage id={p.id} from={i === pages.length - 1 ? p.from : undefined} />}
            {p.kind === 'collection' && <CollectionPage id={p.id} />}
            {p.kind === 'article' && <ArticlePage id={p.id} />}
            {p.kind === 'link' && <LinkPage slug={p.id} />}
          </div>
        ))}

        {overlay?.kind === 'search' && <SearchScreen />}
        {overlay?.kind === 'filters' && <FiltersSheet focus={overlay.focus} />}
        {overlay?.kind === 'city' && <CityPicker />}
        {overlay?.kind === 'route' && <RouteSheet restaurantId={overlay.restaurantId} />}
        {overlay?.kind === 'why' && <WhySheet restaurantId={overlay.restaurantId} />}
        {overlay?.kind === 'halal-help' && <HalalHelpSheet />}
        {overlay?.kind === 'contribute' && <ContributeSheet restaurantId={overlay.restaurantId} preset={overlay.preset} />}
        {overlay?.kind === 'account' && <AccountSheet reason={overlay.reason} />}
        {overlay?.kind === 'privacy' && <PrivacySheet />}
        {overlay?.kind === 'deletion' && <DeletionSheet />}
        {overlay?.kind === 'lab' && <Lab />}

        {toastState && <Toast key={toastState.nonce} text={toastState.text} action={toastState.action} />}

        {splash && (
          <div class="splash" aria-hidden="true">
            <span class="wordmark">Yalla Yum</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Toast({ text, action }: { text: string; action?: { label: string; run: () => void } }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShown(false), action ? 5200 : 3200);
    return () => clearTimeout(t);
  }, []);
  if (!shown) return null;
  return (
    <div class="toast" role="status">
      <span class="grow">{text}</span>
      {action && (
        <button
          type="button"
          onClick={() => {
            setShown(false);
            action.run();
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

