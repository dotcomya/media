// Explorer : la carte d'abord. Recherche en haut, puces de filtres rapides,
// feuille de résultats en bas, carrousel synchronisé avec le marqueur choisi.

import { forwardRef } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { activeFilterKeys, filterLabel } from '../../domain/filters';
import { CERTIFIERS } from '../../data/demo';
import { cuisine, occasion, PRICE_LEVELS } from '../../domain/taxonomy';
import type { BBox } from '../../domain/types';
import { Icon } from '../../ui/Icon';
import { Chip } from '../../ui/bits';
import { vibrate } from '../haptics';
import { useStore } from '../store';
import {
  clearFilters,
  dropFilter,
  finishOnboarding,
  openOverlay,
  recenter,
  requestLocation,
  searchAroundMe,
  searchVisibleArea,
  setFilters,
  store,
  toast,
  track,
} from '../state';
import { MapView } from './MapView';
import { PeekCard } from './ResultRow';
import { ResultsSheet } from './ResultsSheet';

export function Explore({ height, dark }: { height: number; dark: boolean }) {
  const response = useStore(store, (s) => s.response);
  const selectedId = useStore(store, (s) => s.selectedId);
  const camera = useStore(store, (s) => s.camera);
  const area = useStore(store, (s) => s.area);
  const location = useStore(store, (s) => s.location);
  const areaDirty = useStore(store, (s) => s.areaDirty);
  const onboarded = useStore(store, (s) => s.onboarded);
  const offline = useStore(store, (s) => s.env.network === 'offline');
  const sheet = useStore(store, (s) => s.sheet);

  const root = useRef<HTMLDivElement>(null);
  const topbar = useRef<HTMLDivElement>(null);
  const [padTop, setPadTop] = useState(150);
  const [padBottom, setPadBottom] = useState(Math.round(height * 0.47));
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const pendingBBox = useRef<BBox | undefined>(undefined);

  useEffect(() => {
    if (!topbar.current) return;
    const ro = new ResizeObserver(() => setPadTop((topbar.current?.getBoundingClientRect().height ?? 140) + 4));
    ro.observe(topbar.current);
    return () => ro.disconnect();
  }, []);

  const onVisible = (px: number, settled: boolean) => {
    root.current?.style.setProperty('--sheet-visible', `${px}px`);
    if (settled) setPadBottom(Math.round(px));
  };

  const carouselOpen = !!selectedId && response.results.some((r) => r.restaurant.id === selectedId);

  return (
    <div ref={root} style={{ position: 'absolute', inset: 0 }}>
      {mapState === 'failed' ? (
        <div class="map-fallback" role="status">
          <div>
            <Icon name="map" size={36} />
            <p style={{ fontWeight: 700, color: 'var(--ink)', margin: '8px 0 4px' }}>Carte indisponible pour le moment</p>
            <p style={{ margin: 0 }}>La liste des adresses reste à jour juste en dessous.</p>
          </div>
        </div>
      ) : (
        <MapView
          results={response.results}
          selectedId={selectedId}
          user={location.status === 'granted' && location.position ? { position: location.position, simulated: location.simulated } : undefined}
          camera={camera}
          initialArea={area}
          padTop={padTop}
          padBottom={carouselOpen ? 190 : padBottom}
          dark={dark}
          onSelect={(id) => {
            store.set({ selectedId: id });
            if (id) vibrate(8);
          }}
          onUserMove={(bbox) => {
            pendingBBox.current = bbox;
            store.set({ areaDirty: true });
          }}
          onStatus={(st) => {
            setMapState(st);
            if (st === 'failed') store.set({ sheet: 'full' });
          }}
        />
      )}

      <TopBar ref={topbar} onSearchArea={() => pendingBBox.current && searchVisibleArea(pendingBBox.current)} areaDirty={areaDirty} offline={offline} />

      <div
        class="fabs"
        style={{
          bottom: carouselOpen ? 'calc(var(--tabbar-h) + var(--sab) + 172px)' : 'calc(var(--sheet-visible, 50%) + 12px)',
          opacity: sheet === 'full' && !carouselOpen ? 0 : 1,
          pointerEvents: sheet === 'full' && !carouselOpen ? 'none' : 'auto',
        }}
      >
        <button type="button" class={`fab${location.status === 'granted' ? ' is-active' : ''}`} onClick={recenter} aria-label={location.status === 'granted' ? 'Me recentrer' : 'Utiliser ma position'}>
          <Icon name={location.status === 'locating' ? 'refresh' : 'arrow'} filled={location.status === 'granted'} />
        </button>
      </div>

      {!carouselOpen && sheet !== 'full' && response.results.length > 2 && (
        <SurpriseButton />
      )}

      <ResultsSheet height={height} hidden={carouselOpen} onVisible={onVisible} />

      {carouselOpen && <Carousel />}

      {!onboarded && <Prime />}
    </div>
  );
}

// ─── Barre du haut ──────────────────────────────────────────────────────────

const TopBar = forwardRef<HTMLDivElement, { onSearchArea: () => void; areaDirty: boolean; offline: boolean }>(function TopBar(
  { onSearchArea, areaDirty, offline },
  ref,
) {
  const interpretation = useStore(store, (s) => s.interpretation);
  const filters = useStore(store, (s) => s.filters);
  const location = useStore(store, (s) => s.location);
  const originIsUser = useStore(store, (s) => s.originIsUser);
  const query = useStore(store, (s) => s.query);
  const keys = activeFilterKeys(filters);

  const cuisineLabel = filters.cuisines.length ? (filters.cuisines.length === 1 ? cuisine(filters.cuisines[0])?.label : `Cuisines · ${filters.cuisines.length}`) : 'Cuisine';
  const occasionLabel = filters.occasions.length ? (filters.occasions.length === 1 ? occasion(filters.occasions[0])?.label : `Envies · ${filters.occasions.length}`) : 'Envie';
  const priceLabel = filters.priceMax ? `Jusqu'à ${PRICE_LEVELS[filters.priceMax].symbol}` : 'Budget';
  const halalLabel = filters.halalMin !== 'any' ? filterLabel('halalMin', filters, CERTIFIERS) : 'Info halal';

  return (
    <div class="topbar" ref={ref}>
      <div class="search-capsule">
        <span class="brand-dot" aria-hidden="true">
          <Icon name="search" />
        </span>
        <button type="button" class="search-trigger" onClick={() => openOverlay({ kind: 'search' })} aria-label={query ? `Recherche : ${query}. Modifier` : 'Rechercher une ville, une cuisine, une envie'}>
          {interpretation && interpretation.chips.length ? (
            <span class="understood">
              {interpretation.chips.map((c) => (
                <span class="u-chip" key={c.kind + c.label}>
                  {c.label}
                </span>
              ))}
            </span>
          ) : (
            <span class="placeholder">Une ville, une cuisine, une envie…</span>
          )}
        </button>
        {query && (
          <button type="button" class="icon-btn" onClick={clearFilters} aria-label="Effacer la recherche">
            <Icon name="close" />
          </button>
        )}
        <button type="button" class="icon-btn" onClick={() => openOverlay({ kind: 'filters' })} aria-label={`Filtres${keys.length ? ` (${keys.length} actifs)` : ''}`}>
          <Icon name="sliders" />
          {keys.length > 0 && <span class="count">{keys.length}</span>}
        </button>
      </div>

      <div class="chips-row" role="toolbar" aria-label="Filtres rapides">
        {filters.collection && (
          <Chip pressed onClick={() => dropFilter('collection')} label={`Retirer la collection ${filters.collection.title}`}>
            {filters.collection.title}
            <Icon name="close" />
          </Chip>
        )}
        <Chip
          icon="arrow"
          pressed={originIsUser}
          onClick={searchAroundMe}
        >
          Autour de moi
        </Chip>
        <Chip pressed={filters.openNow} onClick={() => setFilters({ ...filters, openNow: !filters.openNow }, 'openNow')}>
          Ouvert maintenant
        </Chip>
        <Chip pressed={filters.cuisines.length > 0} onClick={() => openOverlay({ kind: 'filters', focus: 'cuisines' })}>
          {cuisineLabel}
          <Icon name="down" />
        </Chip>
        <Chip pressed={filters.occasions.length > 0} onClick={() => openOverlay({ kind: 'filters', focus: 'occasions' })}>
          {occasionLabel}
          <Icon name="down" />
        </Chip>
        <Chip pressed={!!filters.priceMax} onClick={() => openOverlay({ kind: 'filters', focus: 'price' })}>
          {priceLabel}
          <Icon name="down" />
        </Chip>
        <Chip pressed={filters.halalMin !== 'any'} onClick={() => openOverlay({ kind: 'filters', focus: 'halal' })}>
          {halalLabel}
          <Icon name="down" />
        </Chip>
        <Chip icon="sliders" onClick={() => openOverlay({ kind: 'filters' })}>
          Plus de filtres
        </Chip>
      </div>

      {offline && (
        <div class="status-banner" role="status">
          <Icon name="wifiOff" />
          Hors ligne · résultats en cache, peut-être anciens
        </div>
      )}
      {!offline && location.status === 'denied' && (
        <div class="status-banner" role="status" style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}>
          <Icon name="info" />
          Position non partagée · zone choisie à la main
        </div>
      )}
      {areaDirty && (
        <button type="button" class="area-pill" onClick={onSearchArea}>
          <Icon name="refresh" />
          Rechercher dans cette zone
        </button>
      )}
    </div>
  );
});

// ─── Carrousel de la sélection ──────────────────────────────────────────────

function Carousel() {
  const response = useStore(store, (s) => s.response);
  const selectedId = useStore(store, (s) => s.selectedId);
  const originIsUser = useStore(store, (s) => s.originIsUser);
  const strip = useRef<HTMLDivElement>(null);
  const fromScroll = useRef(false);
  const seen = useRef(new Set<string>());

  // Impression : la carte reste au centre une seconde, comptée une fois par ouverture du carrousel.
  useEffect(() => {
    if (!selectedId || seen.current.has(selectedId)) return;
    const t = setTimeout(() => {
      seen.current.add(selectedId);
      const i = response.results.findIndex((r) => r.restaurant.id === selectedId);
      track('restaurant_impression', { restaurant_id: selectedId, position: i + 1, sponsored: response.results[i]?.sponsored ?? false, source: 'carousel' });
    }, 1000);
    return () => clearTimeout(t);
  }, [selectedId]);

  // Le marqueur choisi sur la carte amène sa carte au centre.
  useEffect(() => {
    if (fromScroll.current) {
      fromScroll.current = false;
      return;
    }
    const el = strip.current?.querySelector<HTMLElement>(`[data-id="${selectedId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedId]);

  // Faire défiler les cartes change la sélection (et donc le marqueur).
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    let t = 0;
    const onScroll = () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        const mid = el.scrollLeft + el.clientWidth / 2;
        let best: HTMLElement | undefined;
        let bestD = Infinity;
        el.querySelectorAll<HTMLElement>('[data-id]').forEach((card) => {
          const c = card.offsetLeft + card.offsetWidth / 2;
          if (Math.abs(c - mid) < bestD) {
            bestD = Math.abs(c - mid);
            best = card;
          }
        });
        const id = best?.dataset.id;
        if (id && id !== store.get().selectedId) {
          fromScroll.current = true;
          store.set({ selectedId: id });
        }
      }, 110);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div class="carousel" ref={strip} style={{ bottom: 'calc(var(--tabbar-h) + var(--sab))' }} aria-label="Adresses, une par carte">
      {response.results.map((item) => (
        <PeekCard key={item.restaurant.id} item={item} originIsUser={originIsUser} current={item.restaurant.id === selectedId} />
      ))}
    </div>
  );
}

// ─── « Surprends-moi » ──────────────────────────────────────────────────────

function SurpriseButton() {
  const [spin, setSpin] = useState(0);
  return (
    <button
      type="button"
      class="surprise-fab"
      style={{ bottom: 'calc(var(--sheet-visible, 50%) + 12px)' }}
      onClick={() => {
        const s = store.get();
        // Une pépite parmi les résultats ouverts, de préférence un coup de cœur peu vu.
        const pool = s.response.results.filter((r) => r.open.state === 'open' && !r.sponsored);
        const picks = pool.filter((r) => r.restaurant.editorialPick && !s.visited.includes(r.restaurant.id));
        const from = picks.length ? picks : pool.length ? pool : s.response.results;
        const pick = from[Math.floor(Math.random() * from.length)];
        setSpin((n) => n + 1);
        vibrate([8, 40, 8, 40, 20]);
        if (!pick) return toast('Rien d’ouvert à proposer dans cette zone.');
        setTimeout(() => {
          store.set({ selectedId: pick.restaurant.id });
          track('restaurant_impression', { restaurant_id: pick.restaurant.id, position: 1, sponsored: false, source: 'map' });
        }, 380);
      }}
      aria-label="Surprends-moi : choisir une adresse ouverte au hasard"
    >
      <span key={spin} class={spin ? 'dice-spin' : undefined} style={{ display: 'grid' }}>
        <Icon name="dice" />
      </span>
      Surprends-moi
    </button>
  );
}

// ─── Premier lancement : la position, au moment utile ───────────────────────

function Prime() {
  return (
    <div class="prime" style={{ bottom: 'calc(var(--tabbar-h) + var(--sab) + 12px)' }} role="dialog" aria-label="Trouver des adresses autour de toi">
      <h2>Les bonnes adresses halal, autour de toi.</h2>
      <p>Ta position sert seulement à trier par distance, quand tu la demandes. Elle n’est ni suivie ni enregistrée. Sans elle, tout fonctionne avec une ville.</p>
      <div class="row-btns">
        <button
          type="button"
          class="btn btn-primary"
          onClick={() => {
            finishOnboarding();
            requestLocation();
          }}
        >
          <Icon name="arrow" /> Utiliser ma position
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          onClick={() => {
            finishOnboarding();
            openOverlay({ kind: 'city' });
          }}
        >
          Choisir une ville
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          onClick={() => {
            finishOnboarding();
            track('location_permission_result', { result: 'dismissed' });
          }}
        >
          Plus tard · explorer Paris
        </button>
      </div>
    </div>
  );
}
