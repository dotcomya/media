// Feuille de résultats à trois hauteurs : réduite, mi-hauteur, plein écran.
//
// Elle se manipule au doigt (ressort, vitesse du geste conservée), ne masque
// jamais la carte sans retour possible, et garde sa hauteur quand on ouvre
// puis referme une fiche. En plein écran, le contenu défile ; la poignée et
// l'en-tête restent le moyen de la redescendre (ou le bouton « Carte »).

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { activeFilterKeys, filterLabel } from '../../domain/filters';
import { SORT_LABELS, type SortKey } from '../../domain/ranking';
import { CERTIFIERS } from '../../data/demo';
import { Icon } from '../../ui/Icon';
import { animateSpring, prefersReducedMotion } from '../spring';
import { useStore } from '../store';
import {
  clearFilters,
  dropFilter,
  expandArea,
  openOverlay,
  runSearch,
  store,
  track,
  type SheetSnap,
} from '../state';
import { ResultRow } from './ResultRow';

interface Props {
  height: number;
  hidden: boolean;
  onVisible: (px: number, settled: boolean) => void;
}

const TABBAR = 62;

export function snapHeights(h: number, sab: number, sat: number): Record<SheetSnap, number> {
  return {
    peek: TABBAR + sab + 118,
    half: Math.round(h * 0.47),
    full: h - sat - 6,
  };
}

function readInsets(el: HTMLElement | null) {
  if (!el) return { sab: 0, sat: 0 };
  const cs = getComputedStyle(el);
  const px = (v: string) => {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;height:${v}`;
    el.appendChild(probe);
    const out = probe.getBoundingClientRect().height;
    probe.remove();
    return out;
  };
  return { sab: px(cs.getPropertyValue('--sab') || '0px'), sat: px(cs.getPropertyValue('--sat') || '0px') };
}

export function ResultsSheet({ height, hidden, onVisible }: Props) {
  const snap = useStore(store, (s) => s.sheet);
  const response = useStore(store, (s) => s.response);
  const originIsUser = useStore(store, (s) => s.originIsUser);
  const areaLabel = useStore(store, (s) => s.areaLabel);
  const sort = useStore(store, (s) => s.sort);
  const filters = useStore(store, (s) => s.filters);
  const selectedId = useStore(store, (s) => s.selectedId);
  const showUncertain = useStore(store, (s) => s.showUncertain);
  const offline = useStore(store, (s) => s.env.network === 'offline');
  const cachedAt = useStore(store, (s) => s.cachedAt);
  const locationStatus = useStore(store, (s) => s.location.status);

  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const y = useRef(height);
  const stop = useRef<() => void>(() => {});
  const [insets, setInsets] = useState({ sab: 0, sat: 0 });

  useLayoutEffect(() => setInsets(readInsets(panel.current)), [height]);
  const snaps = snapHeights(height, insets.sab, insets.sat);

  const apply = (ty: number, settled: boolean) => {
    y.current = ty;
    if (panel.current) panel.current.style.transform = `translate3d(0, ${ty}px, 0)`;
    onVisible(Math.max(0, height - ty), settled);
  };

  const target = hidden ? height + 20 : height - snaps[snap];

  // Animation vers la hauteur demandée (changement d'état, rotation, carrousel).
  useEffect(() => {
    stop.current();
    stop.current = animateSpring(y.current, target, (v) => apply(v, v === target), {}, prefersReducedMotion());
  }, [target]);

  // Geste : glisser la feuille.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    let startY = 0;
    let startT = 0;
    let dragging = false;
    let moved = false;
    let samples: { t: number; y: number }[] = [];

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const inBody = body.current?.contains(e.target as Node);
      if (store.get().sheet === 'full' && inBody) return;
      startY = e.clientY;
      startT = y.current;
      dragging = true;
      moved = false;
      samples = [{ t: performance.now(), y: e.clientY }];
      stop.current();
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dy) < 6) return;
      if (!moved) {
        moved = true;
        el.setPointerCapture?.(e.pointerId);
      }
      const min = height - snaps.full;
      const max = height - snaps.peek;
      let ty = startT + dy;
      // Résistance élastique au-delà des butées.
      if (ty < min) ty = min - (min - ty) * 0.25;
      if (ty > max) ty = max + (ty - max) * 0.25;
      apply(ty, false);
      samples.push({ t: performance.now(), y: e.clientY });
      if (samples.length > 6) samples.shift();
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      if (!moved) return;
      const a = samples[0];
      const b = samples[samples.length - 1];
      const v = b && a && b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;
      const projected = y.current + v * 0.2;
      const order: SheetSnap[] = ['full', 'half', 'peek'];
      const next = order.reduce((best, s) => (Math.abs(height - snaps[s] - projected) < Math.abs(height - snaps[best] - projected) ? s : best), 'half' as SheetSnap);
      store.set({ sheet: next });
      stop.current();
      const to = height - snaps[next];
      stop.current = animateSpring(y.current, to, (val) => apply(val, val === to), { velocity: v }, prefersReducedMotion());
    };
    // Un glissement n'est pas un toucher : on bloque le clic qui suivrait.
    const click = (e: MouseEvent) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true);
    };
  }, [height, snaps.full, snaps.half, snaps.peek]);

  // Impressions : une carte visible à 50 % pendant une seconde, une fois par réponse.
  useEffect(() => {
    const root = body.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const seen = new Set<string>();
    const timers = new Map<Element, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          if (e.isIntersecting) {
            timers.set(
              el,
              window.setTimeout(() => {
                const id = el.dataset.id;
                if (!id || seen.has(id)) return;
                seen.add(id);
                const i = response.results.findIndex((r) => r.restaurant.id === id);
                track('restaurant_impression', { restaurant_id: id, position: i + 1, sponsored: response.results[i]?.sponsored ?? false, source: 'list' });
              }, 1000),
            );
          } else {
            clearTimeout(timers.get(el));
          }
        }
      },
      { threshold: 0.5 },
    );
    root.querySelectorAll('.result[data-id]').forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      timers.forEach((t) => clearTimeout(t));
    };
  }, [response]);

  const results = response.results;
  const keys = activeFilterKeys(filters);
  const count = results.length;
  const cycleSort = () => {
    const order: SortKey[] = ['relevance', 'distance', 'price', 'newest'];
    const next = order[(order.indexOf(sort) + 1) % order.length];
    runSearch({ sort: next });
  };

  const title =
    count === 0 ? 'Aucune adresse ici' : `${count} adresse${count > 1 ? 's' : ''}`;
  const subtitle = [
    areaLabel,
    !originIsUser && (locationStatus === 'denied' || locationStatus === 'idle') ? 'depuis le centre' : null,
    offline && cachedAt ? `hors ligne · résultats de ${new Date(cachedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div class="bsheet" aria-hidden={hidden}>
      <div ref={panel} class="bsheet-panel" style={{ transform: `translate3d(0, ${height}px, 0)` }} role="region" aria-label="Résultats">
        <div class="bsheet-grab" aria-hidden="true" />
        <div class="bsheet-head">
          <h2 aria-live="polite">
            {title}
            <span class="sub">{subtitle}</span>
          </h2>
          <div class="head-actions">
            {count > 1 && (
              <button type="button" class="select-pill" onClick={cycleSort} aria-label={`Trier par : ${SORT_LABELS[sort]}. Changer`}>
                <Icon name="sliders" size={15} />
                {SORT_LABELS[sort]}
              </button>
            )}
            {snap === 'full' ? (
              <button type="button" class="select-pill" onClick={() => store.set({ sheet: 'half' })}>
                <Icon name="map" size={15} />
                Carte
              </button>
            ) : (
              <button type="button" class="select-pill" onClick={() => store.set({ sheet: 'full' })} aria-label="Afficher la liste en plein écran">
                <Icon name="list" size={15} />
                Liste
              </button>
            )}
          </div>
        </div>
        <div ref={body} class="bsheet-body" style={{ overflowY: snap === 'full' ? 'auto' : 'hidden' }}>
          {keys.length > 0 && (
            <div class="chips-row" style={{ padding: '0 18px 10px', margin: 0 }}>
              {keys.map((k) => (
                <button key={k} type="button" class="chip flat" aria-pressed="true" onClick={() => dropFilter(k)} aria-label={`Retirer le filtre ${filterLabel(k, filters, CERTIFIERS)}`}>
                  {filterLabel(k, filters, CERTIFIERS)}
                  <Icon name="close" />
                </button>
              ))}
              <button type="button" class="chip flat" onClick={clearFilters}>
                Tout effacer
              </button>
            </div>
          )}

          {count === 0 ? (
            <EmptyState />
          ) : (
            <ul class="results" aria-label="Liste des adresses">
              {results.map((item, i) => (
                <ResultRow key={item.restaurant.id + (item.sponsored ? '-sp' : '')} item={item} position={i + 1} originIsUser={originIsUser} selected={item.restaurant.id === selectedId} source="list" />
              ))}
            </ul>
          )}

          {response.uncertain.length > 0 && (
            <>
              <button type="button" class="group-title" style={{ width: '100%' }} onClick={() => store.set({ showUncertain: !showUncertain })} aria-expanded={showUncertain}>
                <Icon name="clock" />
                {response.uncertain.length} adresse{response.uncertain.length > 1 ? 's' : ''} aux horaires non confirmés
                <Icon name={showUncertain ? 'down' : 'chevron'} />
              </button>
              {showUncertain && (
                <ul class="results" aria-label="Horaires non confirmés">
                  {response.uncertain.map((item, i) => (
                    <ResultRow key={item.restaurant.id} item={item} position={i + 1} originIsUser={originIsUser} source="list" />
                  ))}
                </ul>
              )}
            </>
          )}

          {count > 0 && (
            <p class="pad" style={{ fontSize: '0.75rem', color: 'var(--ink-3)', margin: '18px 0 0', lineHeight: 1.5 }}>
              Distances à vol d’oiseau ; le temps de trajet s’affiche dans ton appli de navigation. Les adresses sponsorisées sont signalées et respectent tes filtres.
            </p>
          )}

          <div class="pad" style={{ marginTop: 20 }}>
            <button type="button" class="btn btn-secondary btn-block" onClick={() => openOverlay({ kind: 'contribute', preset: 'new_restaurant' })}>
              <Icon name="plus" /> Proposer une adresse qui manque
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const response = useStore(store, (s) => s.response);
  const filters = useStore(store, (s) => s.filters);
  const d = response.diagnosis;
  if (response.areaEmpty) {
    return (
      <div class="empty">
        <div class="art">
          <Icon name="map" />
        </div>
        <h3>Pas encore d’adresse référencée ici</h3>
        <p>La carte ne montre que des adresses vérifiables. Élargis la zone ou dis-nous laquelle manque.</p>
        <div class="fixes">
          {d?.fixes.filter((f) => f.kind === 'expand').map((f) => (
            <button key="expand" type="button" class="fix" onClick={expandArea}>
              {f.label}
              <span class="n">{f.count} résultat{f.count > 1 ? 's' : ''}</span>
            </button>
          ))}
          <button type="button" class="fix" onClick={() => openOverlay({ kind: 'city' })}>
            Choisir une autre ville <Icon name="chevron" />
          </button>
          <button type="button" class="fix" onClick={() => openOverlay({ kind: 'contribute', preset: 'new_restaurant' })}>
            Suggérer une adresse <Icon name="plus" />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div class="empty">
      <div class="art">
        <Icon name="sliders" />
      </div>
      <h3>{d?.impossible ? 'Cette combinaison n’existe pas encore' : 'Rien ne correspond à tous tes filtres'}</h3>
      <p>
        {d?.impossible
          ? 'Aucune adresse du catalogue ne remplit tous ces critères à la fois. Retire-en un :'
          : 'Il y a des adresses dans cette zone, mais tes filtres les écartent toutes. Une correction suffit :'}
      </p>
      <div class="fixes">
        {d?.fixes.map((f) => (
          <button
            key={f.label}
            type="button"
            class="fix"
            onClick={() => {
              if (f.kind === 'expand') expandArea();
              else if (f.kind === 'show_uncertain') store.set({ showUncertain: true });
              else if (f.key) dropFilter(f.key);
            }}
          >
            {f.label}
            <span class="n">
              {f.count} résultat{f.count > 1 ? 's' : ''}
            </span>
          </button>
        ))}
        {activeFilterKeys(filters).length > 1 && (
          <button type="button" class="fix" onClick={clearFilters}>
            Effacer tous les filtres <Icon name="close" />
          </button>
        )}
      </div>
    </div>
  );
}
