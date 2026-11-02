// Collections : sélections éditoriales et articles, tous reliés à des fiches
// réelles du catalogue et à la carte (« Voir sur la carte »).

import { useState } from 'preact/hooks';
import { CERTIFIERS } from '../../data/demo';
import { deriveHalalStatus } from '../../domain/halal';
import { localClock, openStatus } from '../../domain/hours';
import { cuisine } from '../../domain/taxonomy';
import { Icon } from '../../ui/Icon';
import { Illustration, OpenLabel, TrustBadge, hueOf } from '../../ui/bits';
import { vibrate } from '../haptics';
import { useStore } from '../store';
import {
  ARTICLES,
  COLLECTIONS,
  closePage,
  collectionRestaurants,
  now,
  openPage,
  openRestaurant,
  showArticleOnMap,
  showCollectionOnMap,
  store,
  track,
} from '../state';

function greeting(): string {
  const { minutes } = localClock(now(), 'Europe/Paris');
  const h = Math.floor(minutes / 60);
  if (h < 5) return 'Encore debout ?';
  if (h < 11) return 'Bonjour';
  if (h < 14) return 'C’est l’heure du déj';
  if (h < 18) return 'Bon après-midi';
  if (h < 22) return 'Bonsoir';
  return 'Fringale de nuit ?';
}

export function Collections() {
  useStore(store, (s) => s.env.fixedTime);
  const [spin, setSpin] = useState(0);
  const clock = localClock(now(), 'Europe/Paris');
  const time = `${String(Math.floor(clock.minutes / 60)).padStart(2, '0')}:${String(clock.minutes % 60).padStart(2, '0')}`;

  const surprise = () => {
    const pool = COLLECTIONS.flatMap(collectionRestaurants).filter((r) => openStatus(r, now()).state === 'open');
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setSpin((n) => n + 1);
    vibrate([8, 40, 8, 40, 20]);
    if (pick) setTimeout(() => openRestaurant(pick.id, 'collection'), 420);
  };

  return (
    <div class="screen" aria-label="Collections">
      <header class="screen-head">
        <span class="eyebrow tnum">
          {greeting()} · {time} à Paris
        </span>
        <h1>Collections</h1>
      </header>

      <button type="button" class="surprise-card" onClick={surprise}>
        <span key={spin} class={spin ? 'dice-spin' : undefined} style={{ display: 'grid' }}>
          <Icon name="dice" />
        </span>
        <span>
          <strong>Surprends-moi</strong>
          <span>Une adresse ouverte, tirée parmi les sélections de la rédaction.</span>
        </span>
      </button>

      <div class="section-title">
        <h2>Sélections</h2>
      </div>
      <div class="hscroll" style={{ margin: 0, padding: '2px 20px 8px' }}>
        {COLLECTIONS.map((c) => {
          const list = collectionRestaurants(c);
          if (list.length === 0) return null;
          return (
            <button key={c.id} type="button" class="coll-card" style={{ '--seed-h': c.hue }} onClick={() => openPage({ kind: 'collection', id: c.id })}>
              <div class="mosaic" aria-hidden="true">
                {list.slice(0, 3).map((r) => (
                  <div key={r.id}>
                    <Illustration media={r.media[0]} hue={hueOf(r)} width={150} height={150} tag={false} />
                  </div>
                ))}
              </div>
              <div class="shade" />
              <div class="txt">
                <span class="kick">{c.kicker}</span>
                <h3>{c.title}</h3>
                <span class="n">
                  {list.length} adresse{list.length > 1 ? 's' : ''} · illustrations
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div class="section-title">
        <h2>À lire</h2>
      </div>
      {ARTICLES.map((a) => {
        const first = a.restaurantIds.map((id) => collectionRestaurants({ id: 'x', title: '', kicker: '', intro: '', criteria: [], restaurantIds: [id], hue: 0 })[0]).find(Boolean);
        return (
          <button key={a.id} type="button" class="article-row" style={{ '--seed-h': a.hue }} onClick={() => openPage({ kind: 'article', id: a.id })}>
            <div class="thumb">{first && <Illustration media={first.media[1] ?? first.media[0]} hue={a.hue} width={76} height={76} tag={false} />}</div>
            <div>
              <div class="kick">{a.kicker}</div>
              <h3>{a.title}</h3>
              <div style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', marginTop: 2 }}>
                {a.readMinutes} min · {a.restaurantIds.length} adresse{a.restaurantIds.length > 1 ? 's' : ''}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function CollectionPage({ id }: { id: string }) {
  const c = COLLECTIONS.find((x) => x.id === id);
  if (!c) return null;
  const list = collectionRestaurants(c);
  const t = localClock(now(), 'Europe/Paris').date;
  return (
    <div class="page" style={{ '--seed-h': c.hue }} role="dialog" aria-label={c.title}>
      <div class="page-top is-solid">
        <button type="button" class="round-btn" onClick={closePage} aria-label="Retour">
          <Icon name="back" />
        </button>
        <span class="title" style={{ opacity: 1 }}>
          {c.title}
        </span>
        <button
          type="button"
          class="round-btn"
          aria-label="Partager la collection"
          onClick={() => {
            track('share_clicked', { collection_id: c.id, target: 'collection' });
            navigator.clipboard?.writeText(`https://yallayum.app/c/${c.id}`).catch(() => {});
          }}
        >
          <Icon name="share" />
        </button>
      </div>
      <div class="page-scroll" style={{ paddingTop: 'calc(var(--sat) + 64px)', paddingBottom: 120 }}>
        <div class="pad stack" style={{ gap: 14 }}>
          <span class="fiche-kicker">{c.kicker}</span>
          <h1 class="fiche-title" style={{ marginTop: -6 }}>
            {c.title}
          </h1>
          <p class="lede">{c.intro}</p>
          <div class="criteria">
            <strong>Critères de la sélection</strong>
            {c.criteria.map((x) => (
              <span key={x}>· {x}</span>
            ))}
            <span>· Aucune adresse n’a payé pour y figurer.</span>
          </div>
        </div>
        <ul class="results" style={{ marginTop: 14 }}>
          {list.map((r) => (
            <li key={r.id}>
              <button type="button" class="result" style={{ '--seed-h': hueOf(r) }} onClick={(e) => openRestaurant(r.id, 'collection', (e.currentTarget as HTMLElement).querySelector('.thumb')?.getBoundingClientRect())}>
                <div class="thumb">
                  <Illustration media={r.media[0]} hue={hueOf(r)} width={96} height={112} />
                </div>
                <div class="info">
                  <span class="kicker">
                    {cuisine(r.cuisines[0])?.label} — {r.address.neighbourhood ?? r.address.district}
                  </span>
                  <h3>{r.name}</h3>
                  <div class="meta">
                    <OpenLabel status={openStatus(r, now())} short />
                  </div>
                  <TrustBadge status={deriveHalalStatus(r.halalClaims, t, CERTIFIERS)} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div class="action-bar">
        <button type="button" class="btn btn-tint btn-block" onClick={() => showCollectionOnMap(c)}>
          <Icon name="map" /> Voir les {list.length} sur la carte
        </button>
      </div>
    </div>
  );
}

export function ArticlePage({ id }: { id: string }) {
  const a = ARTICLES.find((x) => x.id === id);
  if (!a) return null;
  const list = a.restaurantIds.map((rid) => collectionRestaurants({ id: 'x', title: '', kicker: '', intro: '', criteria: [], restaurantIds: [rid], hue: 0 })[0]).filter(Boolean);
  const hero = list[0];
  return (
    <div class="page" style={{ '--seed-h': a.hue }} role="dialog" aria-label={a.title}>
      <div class="page-top">
        <button type="button" class="round-btn" onClick={closePage} aria-label="Retour">
          <Icon name="back" />
        </button>
      </div>
      <div class="page-scroll">
        <div class="hero" style={{ height: 260 }}>{hero && <Illustration media={hero.media[1] ?? hero.media[0]} hue={a.hue} width={393} height={260} />}</div>
        <div class="sheet-body-card">
          <div>
            <div class="fiche-kicker">
              {a.kicker} · {a.readMinutes} min
            </div>
            <h1 class="fiche-title">{a.title}</h1>
          </div>
          {a.body.map((p) => (
            <p key={p} class="lede" style={{ fontSize: '1rem' }}>
              {p}
            </p>
          ))}
          <section class="section">
            <h2>Les adresses</h2>
            <div class="rows">
              {list.map((r) => (
                <button key={r.id} type="button" class="row" onClick={() => openRestaurant(r.id, 'collection')}>
                  <Icon name={cuisine(r.cuisines[0])?.icon ?? 'plate'} />
                  <span class="grow">
                    {r.name}
                    <span class="small">{r.address.neighbourhood ?? r.address.district}</span>
                  </span>
                  <Icon name="chevron" class="chev" />
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
      <div class="action-bar">
        <button type="button" class="btn btn-tint btn-block" onClick={() => showArticleOnMap(a.id)}>
          <Icon name="map" /> Voir sur la carte
        </button>
      </div>
    </div>
  );
}
