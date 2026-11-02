// Profil : favoris, carnet, contributions, préférences, confidentialité,
// aide. Tout fonctionne en invité ; le compte n'apporte que la synchronisation.

import { CERTIFIERS } from '../../data/demo';
import { formatAgo } from '../../domain/format';
import { deriveHalalStatus } from '../../domain/halal';
import { openStatus } from '../../domain/hours';
import { CONTRIBUTION_LABELS, CONTRIBUTION_STATUS_LABELS } from '../../domain/moderation';
import { cuisine } from '../../domain/taxonomy';
import { Icon } from '../../ui/Icon';
import { Illustration, OpenLabel, TrustBadge, hueOf } from '../../ui/bits';
import { storage, useStore } from '../store';
import { now, openOverlay, openRestaurant, restaurantById, setEnv, store, toast, today } from '../state';

export function Profile() {
  const favorites = useStore(store, (s) => s.favorites);
  const visited = useStore(store, (s) => s.visited);
  const contributions = useStore(store, (s) => s.contributions);
  const account = useStore(store, (s) => s.account);
  const theme = useStore(store, (s) => s.env.theme);
  const navApp = useStore(store, (s) => s.prefs.navApp);
  const t = today();
  const cuisinesTried = new Set(visited.flatMap((id) => restaurantById(id)?.cuisines.slice(0, 1) ?? []));

  return (
    <div class="screen" aria-label="Profil">
      <header class="screen-head">
        <span class="eyebrow">{account ? 'Compte synchronisé' : 'Mode invité'}</span>
        <h1>Profil</h1>
      </header>

      <div class="profile-head">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div class="avatar" aria-hidden="true">
            {account ? account.email[0].toUpperCase() : 'Y'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 750, fontSize: '1.0625rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{account ? account.email : 'Invité'}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--ink-3)' }}>
              {account ? `Membre depuis ${formatAgo(new Date(account.since).toISOString().slice(0, 10), t).replace('il y a ', '')}` : 'Tes favoris restent sur ce téléphone'}
            </div>
          </div>
        </div>
        {!account && (
          <>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--ink-2)' }}>
              Sans compte, tes favoris et ton carnet sont perdus si tu supprimes l’application. Un compte les synchronise ; rien d’autre ne change.
            </p>
            <button type="button" class="btn btn-primary" onClick={() => openOverlay({ kind: 'account', reason: 'Garde tes favoris, ton carnet et ta carte de fidélité sur tous tes appareils.' })}>
              Créer un compte
            </button>
          </>
        )}
        <div class="stats">
          <div class="stat">
            <b>{favorites.length}</b>
            <span>favoris</span>
          </div>
          <div class="stat">
            <b>{visited.length}</b>
            <span>testés</span>
          </div>
          <div class="stat">
            <b>{cuisinesTried.size}</b>
            <span>cuisines</span>
          </div>
        </div>
      </div>

      <section class="list-section" aria-labelledby="p-fav">
        <h2 id="p-fav">Mes adresses</h2>
        {favorites.length === 0 ? (
          <div class="criteria">
            <span>Touche le cœur sur une fiche pour la retrouver ici, même hors ligne.</span>
          </div>
        ) : (
          <ul class="results" style={{ padding: 0 }}>
            {favorites.map((id) => {
              const r = restaurantById(id);
              if (!r) return null;
              return (
                <li key={id}>
                  <button type="button" class="result" style={{ '--seed-h': hueOf(r) }} onClick={(e) => openRestaurant(id, 'favorites', (e.currentTarget as HTMLElement).querySelector('.thumb')?.getBoundingClientRect())}>
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
              );
            })}
          </ul>
        )}
      </section>

      <section class="list-section" aria-labelledby="p-contrib">
        <h2 id="p-contrib">Mes contributions</h2>
        <div class="rows">
          <button type="button" class="row" onClick={() => openOverlay({ kind: 'contribute', preset: 'new_restaurant' })}>
            <Icon name="plus" />
            <span class="grow">
              Proposer un restaurant
              <span class="small">Il sera vérifié avant d’apparaître.</span>
            </span>
            <Icon name="chevron" class="chev" />
          </button>
          {contributions.map((c) => (
            <div key={c.id} class="row">
              <Icon name="flag" />
              <span class="grow">
                {CONTRIBUTION_LABELS[c.kind]}
                {c.restaurantId ? ` · ${restaurantById(c.restaurantId)?.name}` : c.payload.name ? ` · ${String(c.payload.name)}` : ''}
                <span class="small">
                  {CONTRIBUTION_STATUS_LABELS[c.status]} · envoyé {formatAgo(c.createdAt.slice(0, 10), t)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section class="list-section" aria-labelledby="p-prefs">
        <h2 id="p-prefs">Préférences</h2>
        <div class="rows">
          <div class="row">
            <Icon name={theme === 'dark' ? 'moon' : 'sun'} />
            <span class="grow">Apparence</span>
            <div class="seg" role="group" aria-label="Apparence" style={{ minWidth: 190 }}>
              {(['system', 'light', 'dark'] as const).map((v) => (
                <button key={v} type="button" aria-pressed={theme === v} onClick={() => setEnv({ theme: v })}>
                  {v === 'system' ? 'Auto' : v === 'light' ? 'Clair' : 'Sombre'}
                </button>
              ))}
            </div>
          </div>
          <div class="row">
            <Icon name="route" />
            <span class="grow">
              App d’itinéraire
              <span class="small">{navApp ? `${{ apple: 'Plans', google: 'Google Maps', waze: 'Waze', citymapper: 'Citymapper' }[navApp]} · l’itinéraire part en un geste` : 'Demandée à chaque fois'}</span>
            </span>
            {navApp && (
              <button
                type="button"
                class="btn btn-sm btn-secondary"
                onClick={() => {
                  const prefs = { ...store.get().prefs, navApp: undefined };
                  store.set({ prefs });
                  storage.write('prefs', prefs);
                }}
              >
                Oublier
              </button>
            )}
          </div>
          <div class="row">
            <Icon name="globe" />
            <span class="grow">
              Langue
              <span class="small">Français · l’architecture prévoit d’autres langues</span>
            </span>
          </div>
        </div>
      </section>

      <section class="list-section" aria-labelledby="p-privacy">
        <h2 id="p-privacy">Confidentialité</h2>
        <div class="rows">
          <button type="button" class="row" onClick={() => openOverlay({ kind: 'privacy' })}>
            <Icon name="lock" />
            <span class="grow">
              Consentements et données
              <span class="small">Mesure d’audience, historique, position</span>
            </span>
            <Icon name="chevron" class="chev" />
          </button>
          <button
            type="button"
            class="row"
            onClick={async () => {
              const s = store.get();
              const data = JSON.stringify({ favoris: s.favorites, carnet: s.visited, recherches: s.recent, contributions: s.contributions, fidelite: s.loyalty, consentements: s.consent }, null, 2);
              try {
                await navigator.clipboard.writeText(data);
                toast('Export copié (JSON).');
              } catch {
                toast('Copie impossible ici ; l’export est disponible depuis le compte.');
              }
            }}
          >
            <Icon name="copy" />
            <span class="grow">
              Exporter mes données
              <span class="small">Format JSON, portable</span>
            </span>
          </button>
          <button type="button" class="row" onClick={() => openOverlay({ kind: 'deletion' })}>
            <Icon name="trash" />
            <span class="grow" style={{ color: 'var(--bad)' }}>
              Supprimer mes données
            </span>
            <Icon name="chevron" class="chev" />
          </button>
        </div>
      </section>

      <section class="list-section" aria-labelledby="p-help">
        <h2 id="p-help">Aide</h2>
        <div class="rows">
          <button type="button" class="row" onClick={() => openOverlay({ kind: 'halal-help' })}>
            <Icon name="shield" />
            <span class="grow">Comment on vérifie l’information halal</span>
            <Icon name="chevron" class="chev" />
          </button>
          <button type="button" class="row" onClick={() => openOverlay({ kind: 'lab' })}>
            <Icon name="beaker" />
            <span class="grow">
              Banc d’essai du prototype
              <span class="small">Heure, position, réseau, accessibilité, journal d’événements</span>
            </span>
            <Icon name="chevron" class="chev" />
          </button>
          <a class="row" href={__ARTIFACT__ ? '#admin' : 'admin.html'} target={__ARTIFACT__ ? undefined : '_blank'} rel="noopener">
            <Icon name="edit" />
            <span class="grow">
              Back-office (équipe)
              <span class="small">Fiches, vérification, modération, import</span>
            </span>
            <Icon name="chevron" class="chev" />
          </a>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-3)', margin: '12px 4px 0', lineHeight: 1.5 }}>
          Prototype YallaYum. Établissements, organismes et numéros fictifs ; rues et quartiers réels. Carte © OpenMapTiles, données © contributeurs OpenStreetMap.
        </p>
      </section>
    </div>
  );
}
