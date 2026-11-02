// Carte de résultat (liste) et carte du carrousel : même hiérarchie
// d'information — décider (nom, cuisine, ouvert, distance), se rassurer
// (niveau halal, prix), sans jamais afficher ce qu'on ne sait pas.

import { formatDistance } from '../../domain/geo';
import { PRICE_LEVELS, cuisine } from '../../domain/taxonomy';
import type { Ranked } from '../../domain/ranking';
import { Icon } from '../../ui/Icon';
import { Illustration, OpenLabel, TrustBadge, hueOf } from '../../ui/bits';
import { useStore } from '../store';
import { openRestaurant, store, toggleFavorite } from '../state';

function kicker(r: Ranked) {
  const c = r.restaurant.cuisines.slice(0, 2).map((id) => cuisine(id)?.label).filter(Boolean).join(' · ');
  const where = r.restaurant.address.neighbourhood ?? r.restaurant.address.district;
  return `${c} — ${where}`;
}

export function distanceText(r: Ranked, originIsUser: boolean): string | undefined {
  if (r.distance === undefined) return undefined;
  return originIsUser ? formatDistance(r.distance) : `${formatDistance(r.distance)} du centre`;
}

export function FavButton({ id, size = 'sm' }: { id: string; size?: 'sm' | 'lg' }) {
  const on = useStore(store, (s) => s.favorites.includes(id));
  return (
    <button
      type="button"
      class={size === 'lg' ? `square-btn${on ? ' is-on' : ''}` : `icon-btn fav`}
      style={size === 'sm' && on ? { color: 'var(--braise)' } : undefined}
      aria-pressed={on}
      aria-label={on ? 'Retirer des favoris' : 'Enregistrer'}
      onClick={(e) => {
        e.stopPropagation();
        const el = e.currentTarget as HTMLElement;
        el.classList.remove('heart-burst');
        void el.offsetWidth;
        if (!on) el.classList.add('heart-burst');
        toggleFavorite(id);
      }}
    >
      <Icon name="heart" filled={on} size={size === 'lg' ? 22 : 21} />
    </button>
  );
}

interface RowProps {
  item: Ranked;
  originIsUser: boolean;
  selected?: boolean;
  position: number;
  source: 'list' | 'collection' | 'favorites';
}

export function ResultRow({ item, originIsUser, selected, source }: RowProps) {
  const r = item.restaurant;
  const dist = distanceText(item, originIsUser);
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        class={`result${selected ? ' is-selected' : ''}`}
        style={{ '--seed-h': hueOf(r) }}
        data-id={r.id}
        onClick={(e) => openRestaurant(r.id, source, (e.currentTarget as HTMLElement).querySelector('.thumb')?.getBoundingClientRect())}
        onKeyDown={(e) => e.key === 'Enter' && openRestaurant(r.id, source)}
        aria-label={`${r.name}, ${kicker(item)}`}
      >
        <div class="thumb">
          <Illustration media={r.media[0]} hue={hueOf(r)} width={96} height={112} />
        </div>
        <div class="info">
          {item.sponsored && (
            <span class="sponsored-tag">
              <Icon name="info" size={12} /> Sponsorisé
            </span>
          )}
          <span class="kicker">{kicker(item)}</span>
          <h3>{r.name}</h3>
          <div class="meta">
            <OpenLabel status={item.open} short />
            {dist && <span class="tnum">{dist}</span>}
            {r.price && <span>{PRICE_LEVELS[r.price.level].symbol}</span>}
          </div>
          <TrustBadge status={item.halal} />
        </div>
        <FavButton id={r.id} />
      </div>
    </li>
  );
}

interface PeekProps {
  item: Ranked;
  originIsUser: boolean;
  current: boolean;
}

export function PeekCard({ item, originIsUser, current }: PeekProps) {
  const r = item.restaurant;
  const dist = distanceText(item, originIsUser);
  return (
    <div
      role="button"
      tabIndex={0}
      class={`peek${current ? ' is-current' : ''}`}
      style={{ '--seed-h': hueOf(r) }}
      data-id={r.id}
      onClick={(e) => openRestaurant(r.id, 'carousel', (e.currentTarget as HTMLElement).querySelector('.thumb')?.getBoundingClientRect())}
      onKeyDown={(e) => e.key === 'Enter' && openRestaurant(r.id, 'carousel')}
      aria-label={`Ouvrir ${r.name}`}
    >
      <div class="thumb">
        <Illustration media={r.media[0]} hue={hueOf(r)} width={104} height={124} />
      </div>
      <div class="info">
        {item.sponsored && <span class="sponsored-tag">Sponsorisé</span>}
        <span class="kicker" style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--tint-ink)' }}>
          {cuisine(r.cuisines[0])?.label} — {r.address.neighbourhood ?? r.address.district}
        </span>
        <h3>{r.name}</h3>
        <div class="meta" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: '0.8125rem', color: 'var(--ink-2)' }}>
          <OpenLabel status={item.open} short />
          {dist && <span class="tnum">{dist}</span>}
          {r.price && <span>{PRICE_LEVELS[r.price.level].symbol}</span>}
        </div>
        <TrustBadge status={item.halal} />
      </div>
      <div style={{ position: 'absolute', top: 6, right: 4 }}>
        <FavButton id={r.id} />
      </div>
    </div>
  );
}
