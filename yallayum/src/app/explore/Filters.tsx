// Filtres complets : taxonomie hiérarchique, envies, budget, ouverture,
// niveau de preuve halal, organisme, services. Le bouton annonce le nombre
// réel de résultats avant de valider.

import { Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CERTIFIERS } from '../../data/demo';
import { activeFilterKeys, EMPTY_FILTERS, halalFilterLabel, type Filters } from '../../domain/filters';
import { TRUST_LEVELS, type HalalFilterLevel } from '../../domain/halal';
import { search } from '../../domain/search';
import { AMENITIES, CUISINE_FAMILIES, CUISINES, OCCASIONS, PRICE_LEVELS } from '../../domain/taxonomy';
import type { PriceLevel } from '../../domain/types';
import { Icon } from '../../ui/Icon';
import { Chip, Modal, Switch } from '../../ui/bits';
import { useStore } from '../store';
import { CATALOG, choosePlace, closeOverlay, now, openOverlay, setFilters, store, track } from '../state';
import { PLACES } from '../../domain/places';

type Focus = 'cuisines' | 'occasions' | 'price' | 'halal' | undefined;

export function FiltersSheet({ focus }: { focus: Focus }) {
  const current = useStore(store, (s) => s.filters);
  const [f, setF] = useState<Filters>(current);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    body.current?.querySelector(`[data-section="${focus}"]`)?.scrollIntoView({ block: 'start' });
  }, []);

  // Compte réel, recalculé à chaque changement : jamais d'estimation.
  const count = useMemo(() => {
    const s = store.get();
    return search(
      CATALOG,
      { area: s.area, origin: s.origin, originIsUser: s.originIsUser, text: s.interpretation?.text ?? '', dishTerms: s.interpretation?.dishTerms ?? [], filters: f, sort: s.sort, now: now() },
      CERTIFIERS,
    ).results.length;
  }, [f]);

  const toggle = (key: 'cuisines' | 'occasions' | 'amenities' | 'certifiers', id: string) =>
    setF((x) => ({ ...x, [key]: x[key].includes(id) ? x[key].filter((v) => v !== id) : [...x[key], id] }));

  const apply = () => {
    const changed = activeFilterKeys(f).find((k) => !activeFilterKeys(current).includes(k)) ?? activeFilterKeys(current).find((k) => !activeFilterKeys(f).includes(k));
    setFilters(f, changed);
    closeOverlay();
  };

  return (
    <Modal
      title="Filtres"
      onClose={closeOverlay}
      full
      footer={
        <>
          <button type="button" class="btn btn-secondary" onClick={() => setF({ ...EMPTY_FILTERS, collection: f.collection })}>
            Tout effacer
          </button>
          <button type="button" class="btn btn-primary" style={{ flex: 1 }} onClick={apply}>
            {count === 0 ? 'Aucun résultat' : `Voir ${count} adresse${count > 1 ? 's' : ''}`}
          </button>
        </>
      }
    >
      <div ref={body} style={{ display: 'grid', gap: 22 }}>
        <section class="field-group">
          <h3>Maintenant</h3>
          <div class="switch-row">
            <span class="grow">
              Ouvert maintenant
              <span class="small">Horaires confirmés seulement ; les autres sont regroupés à part.</span>
            </span>
            <Switch checked={f.openNow} onChange={(v) => setF({ ...f, openNow: v })} label="Ouvert maintenant" />
          </div>
          <div class="wrap-chips" style={{ marginTop: 8 }}>
            {['22:00', '23:00', '00:00', '01:00'].map((t) => (
              <Chip key={t} flat pressed={f.openAt === t} onClick={() => setF({ ...f, openAt: f.openAt === t ? undefined : t })}>
                Ouvert à {t === '00:00' ? 'minuit' : `${Number(t.slice(0, 2))} h`}
              </Chip>
            ))}
          </div>
        </section>

        <section class="field-group" data-section="cuisines">
          <h3>Cuisine</h3>
          <div style={{ display: 'grid', gap: 14 }}>
            {CUISINE_FAMILIES.map((fam) => (
              <div key={fam.id}>
                <div style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', marginBottom: 6 }}>{fam.label}</div>
                <div class="wrap-chips">
                  {CUISINES.filter((c) => c.family === fam.id && !c.parent).map((c) => {
                    const children = CUISINES.filter((x) => x.parent === c.id);
                    return (
                      <Fragment key={c.id}>
                        <Chip flat pressed={f.cuisines.includes(c.id)} onClick={() => toggle('cuisines', c.id)}>
                          {c.label}
                          {children.length > 0 && <span style={{ opacity: 0.6, fontWeight: 500 }}> · tout</span>}
                        </Chip>
                        {children.map((ch) => (
                          <Chip key={ch.id} flat pressed={f.cuisines.includes(ch.id) || f.cuisines.includes(c.id)} onClick={() => toggle('cuisines', ch.id)}>
                            {ch.label}
                          </Chip>
                        ))}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section class="field-group" data-section="occasions">
          <h3>Envie</h3>
          <div class="wrap-chips">
            {OCCASIONS.map((o) => (
              <Chip key={o.id} flat pressed={f.occasions.includes(o.id)} onClick={() => toggle('occasions', o.id)}>
                {o.label}
              </Chip>
            ))}
          </div>
          <p class="hint" style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', margin: '8px 0 0' }}>
            Posées par la rédaction après visite ou échange, jamais déduites automatiquement.
          </p>
        </section>

        <section class="field-group" data-section="price">
          <h3>Budget par personne</h3>
          <div class="seg" role="group" aria-label="Budget maximal">
            <button type="button" aria-pressed={!f.priceMax} onClick={() => setF({ ...f, priceMax: undefined })}>
              Tous
            </button>
            {([1, 2, 3, 4] as PriceLevel[]).map((p) => (
              <button key={p} type="button" aria-pressed={f.priceMax === p} onClick={() => setF({ ...f, priceMax: p })} aria-label={`Jusqu'à ${PRICE_LEVELS[p].range}`}>
                {PRICE_LEVELS[p].symbol}
              </button>
            ))}
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', margin: '8px 0 0' }}>
            {f.priceMax ? `Jusqu'à ${PRICE_LEVELS[f.priceMax].range}. Les adresses sans prix connu sont écartées.` : '€ moins de 15 € · €€ 15–30 € · €€€ 30–50 € · €€€€ plus de 50 €'}
          </p>
        </section>

        <section class="field-group" data-section="halal">
          <h3>Information halal</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {(['any', 'declared', 'team_verified', 'certified'] as HalalFilterLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                class="row"
                style={{ borderRadius: 14, background: f.halalMin === lvl ? 'var(--lagon-soft)' : 'var(--surface-2)' }}
                aria-pressed={f.halalMin === lvl}
                onClick={() => setF({ ...f, halalMin: lvl })}
              >
                <span class="grow">
                  <strong>{halalFilterLabel(lvl)}</strong>
                  <span class="small">
                    {lvl === 'any'
                      ? 'Toutes les adresses, chacune avec son niveau de preuve affiché.'
                      : lvl === 'certified'
                        ? TRUST_LEVELS.certified.explanation
                        : lvl === 'team_verified'
                          ? 'Certifié par un organisme, ou justificatifs contrôlés par l’équipe.'
                          : 'Exclut les adresses dont l’info halal reste à confirmer.'}
                  </span>
                </span>
                {f.halalMin === lvl && <Icon name="check" />}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: '0.8125rem', color: 'var(--ink-3)' }}>Organisme de certification</div>
          <div class="wrap-chips" style={{ marginTop: 6 }}>
            {CERTIFIERS.map((c) => (
              <Chip key={c.id} flat pressed={f.certifiers.includes(c.id)} onClick={() => toggle('certifiers', c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
          <div class="switch-row" style={{ marginTop: 8 }}>
            <span class="grow">
              Sans alcool servi
              <span class="small">Seulement si l’établissement l’a confirmé.</span>
            </span>
            <Switch checked={f.alcoholFree} onChange={(v) => setF({ ...f, alcoholFree: v })} label="Sans alcool servi" />
          </div>
          <button type="button" class="link-btn" style={{ background: 'var(--surface-2)', marginTop: 4 }} onClick={() => openOverlay({ kind: 'halal-help' })}>
            <Icon name="info" /> Comment on vérifie
          </button>
        </section>

        <section class="field-group">
          <h3>Pratique</h3>
          <div class="wrap-chips">
            {AMENITIES.map((a) => (
              <Chip key={a.id} flat pressed={f.amenities.includes(a.id)} onClick={() => toggle('amenities', a.id)}>
                {a.label}
              </Chip>
            ))}
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', margin: '8px 0 0' }}>Une case non cochée sur une fiche veut dire « non confirmé », pas « absent ».</p>
        </section>

        <section class="field-group">
          <h3>Distance</h3>
          <div class="seg" role="group" aria-label="Rayon maximal">
            {[undefined, 500, 1000, 2000, 5000].map((r) => (
              <button key={String(r)} type="button" aria-pressed={f.radius === r} onClick={() => setF({ ...f, radius: r })}>
                {r ? (r < 1000 ? `${r} m` : `${r / 1000} km`) : 'Zone'}
              </button>
            ))}
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', margin: '8px 0 0' }}>À vol d’oiseau depuis ta position (ou le centre de la zone). Le filtre par temps de trajet viendra avec le service d’itinéraires.</p>
        </section>
      </div>
    </Modal>
  );
}

export function CityPicker() {
  const [q, setQ] = useState('');
  const cities = PLACES.filter((p) => p.kind === 'city');
  const shown = q ? PLACES.filter((p) => (p.name + ' ' + p.context).toLowerCase().includes(q.toLowerCase())).slice(0, 12) : cities;
  return (
    <Modal title="Choisir une ville ou un quartier" onClose={closeOverlay} full>
      <label class="field">
        <span class="sr-only">Ville ou quartier</span>
        <input class="input" placeholder="Paris 11e, Saint-Denis, Lyon…" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} autoFocus />
      </label>
      <div class="rows">
        {shown.map((p) => {
          const demo = Math.abs(p.center.lat - 48.86) < 0.15 && Math.abs(p.center.lng - 2.35) < 0.2;
          return (
            <button
              key={p.id}
              type="button"
              class="row"
              onClick={() => {
                choosePlace(p);
                track('location_permission_result', { result: 'city_chosen' });
                closeOverlay();
              }}
            >
              <Icon name="pin" />
              <span class="grow">
                {p.name}
                <span class="small">
                  {p.context}
                  {!demo && ' · hors zone de démonstration'}
                </span>
              </span>
              <Icon name="chevron" class="chev" />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
