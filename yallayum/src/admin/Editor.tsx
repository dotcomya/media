// Éditeur de fiche : saisie complète, aperçu mobile, transitions de
// publication, brouillon de modifications issu des contributions, et
// verrouillage optimiste — deux personnes qui modifient la même fiche ne
// s'écrasent jamais en silence.

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { saveVersioned, VersionConflictError, type MergeResult } from '../domain/concurrency';
import { formatDate } from '../domain/format';
import { distanceMeters, inBBox } from '../domain/geo';
import { deriveHalalStatus, halalHeadline } from '../domain/halal';
import { openStatus, parseTime } from '../domain/hours';
import { allowedTransitions, isDiscoverable, OPERATING_LABELS, PUBLICATION_LABELS, transition, TransitionError, TRANSITIONS } from '../domain/publication';
import { can } from '../domain/rbac';
import { AMENITIES, CUISINE_FAMILIES, CUISINES, OCCASIONS, PRICE_LEVELS, cuisine } from '../domain/taxonomy';
import { normalize } from '../domain/text';
import type { BBox, HoursSource, OperatingStatus, PriceLevel, PublicationStatus, Restaurant, SpecialDay, Weekday, WeeklyRange } from '../domain/types';
import { Icon } from '../ui/Icon';
import { Illustration, OpenLabel, TrustBadge, hueOf } from '../ui/bits';
import { actorLabel, auditEntry, data, getPath, go, nowIso, restaurant, setPath, toast, todayIso, updateRestaurant, type AdminRestaurant } from './model';
import { Dialog, Field, HoursPill, OperatingPill, PageHead, PublicationPill, ReasonDialog, useActor, useData, useUi } from './ui';

/** Champs éditables, comparés un à un lors d'une fusion. */
const FIELDS = [
  'name',
  'slug',
  'description',
  'address',
  'location',
  'operating',
  'temporarilyClosedUntil',
  'successorId',
  'cuisines',
  'occasions',
  'amenities',
  'alcohol',
  'price',
  'contact',
  'hours',
  'media',
] as const satisfies readonly (keyof Restaurant)[];

type FieldKey = (typeof FIELDS)[number];

const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'Nom',
  slug: 'Adresse web',
  description: 'Description',
  address: 'Adresse',
  location: 'Coordonnées',
  operating: 'Situation',
  temporarilyClosedUntil: 'Réouverture prévue',
  successorId: 'Nouvelle adresse',
  cuisines: 'Cuisines',
  occasions: 'Envies',
  amenities: 'Équipements',
  alcohol: 'Alcool',
  price: 'Prix',
  contact: 'Contact',
  hours: 'Horaires',
  media: 'Médias',
};

const FRANCE: BBox = [-5.3, 41.3, 9.7, 51.2];
const DEMO_AREA: BBox = [2.2, 48.79, 2.49, 48.95];

const TRANSITION_LABELS: Record<PublicationStatus, string> = {
  draft: 'Repasser en brouillon',
  in_review: 'Envoyer en relecture',
  published: 'Publier',
  suspended: 'Suspendre',
  archived: 'Archiver',
};

const DAY_LABELS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const HOURS_SOURCES: Record<HoursSource, string> = {
  restaurant: 'Le restaurant',
  team_visit: 'Visite de l’équipe',
  team_phone: 'Appel de l’équipe',
  website: 'Site du restaurant',
  community: 'Communauté',
  legacy_import: 'Ancienne base',
};

function pick(r: AdminRestaurant): Record<FieldKey, unknown> {
  return Object.fromEntries(FIELDS.map((f) => [f, r[f]])) as Record<FieldKey, unknown>;
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function slugify(s: string) {
  return normalize(s).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/** Valeur lisible d'un champ, pour les écrans de fusion et de diff. */
export function display(field: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (field === 'cuisines' && Array.isArray(value)) return value.map((c) => cuisine(c)?.label ?? c).join(', ');
  if (field === 'operating') return OPERATING_LABELS[value as OperatingStatus] ?? String(value);
  if (field === 'address' && typeof value === 'object') {
    const a = value as Restaurant['address'];
    return `${a.street}, ${a.postcode} ${a.city}`;
  }
  if (field === 'location' && typeof value === 'object') {
    const l = value as Restaurant['location'];
    return `${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}`;
  }
  if (field === 'hours' && typeof value === 'object') {
    const h = value as Restaurant['hours'];
    return h ? `${h.weekly.length} plages, ${h.special.length} exception(s)` : '—';
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface Errors {
  name?: string;
  slug?: string;
  location?: string;
  price?: string;
  hours?: string;
}

function validate(r: AdminRestaurant, all: AdminRestaurant[]): { errors: Errors; warnings: string[] } {
  const errors: Errors = {};
  const warnings: string[] = [];
  if (!r.name.trim()) errors.name = 'Le nom est obligatoire.';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.slug)) errors.slug = 'Lettres minuscules, chiffres et tirets uniquement.';
  else if (all.some((x) => x.id !== r.id && (x.slug === r.slug || x.previousSlugs?.includes(r.slug)))) errors.slug = 'Adresse web déjà utilisée par une autre fiche.';
  const { lat, lng } = r.location;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) errors.location = 'Coordonnées invalides.';
  else if (!inBBox(r.location, FRANCE)) {
    errors.location = inBBox({ lat: lng, lng: lat }, FRANCE) ? 'Hors de France : latitude et longitude semblent inversées.' : 'Hors de France métropolitaine : vérifie les coordonnées.';
  } else if (!inBBox(r.location, DEMO_AREA)) warnings.push('Point hors de la zone couverte par la carte de démonstration.');
  if (r.price?.min !== undefined && r.price?.max !== undefined && r.price.min > r.price.max) errors.price = 'Le prix minimum dépasse le maximum.';
  const bad = r.hours?.weekly.find((w) => !/^\d\d:\d\d$/.test(w.opens) || !/^\d\d:\d\d$/.test(w.closes));
  if (bad) errors.hours = `Horaire invalide le ${DAY_LABELS[bad.day].toLowerCase()} (format HH:MM).`;
  if (r.description.length < 60) warnings.push('Description courte (moins de 60 caractères) : la fiche compte comme incomplète.');
  if (r.operating === 'moved' && !r.successorId) warnings.push('« A déménagé » sans nouvelle fiche liée : le lien profond affichera la fermeture.');
  const near = all.find((x) => x.id !== r.id && x.publication !== 'archived' && distanceMeters(x.location, r.location) < 50 && normalize(x.name).includes(normalize(r.name).split(' ').slice(-1)[0] ?? ''));
  if (near) warnings.push(`Doublon possible : « ${near.name} » à moins de 50 m.`);
  return { errors, warnings };
}

export function Editor() {
  const id = useUi((u) => u.editingId);
  const stored = useData((d) => d.restaurants.find((r) => r.id === id));
  const all = useData((d) => d.restaurants);
  const actor = useActor();
  const [base, setBase] = useState<AdminRestaurant | undefined>(stored && structuredClone(stored));
  const [mine, setMine] = useState<AdminRestaurant | undefined>(stored && structuredClone(stored));
  const [conflict, setConflict] = useState<{ merge: MergeResult<AdminRestaurant>; current: AdminRestaurant } | undefined>();
  const [pendingTransition, setPendingTransition] = useState<PublicationStatus | undefined>();

  const dirty = !!(mine && base && !same(pick(mine), pick(base)));

  // Fiche changée ailleurs pendant qu'on la regarde sans modification locale : on suit.
  useEffect(() => {
    if (!stored) return;
    if (!mine || mine.id !== stored.id || !dirty) {
      setBase(structuredClone(stored));
      setMine(structuredClone(stored));
    }
  }, [stored?.id, stored?.version]);

  if (!stored || !mine || !base) {
    return (
      <div class="a-page">
        <PageHead title="Fiche introuvable" />
        <button type="button" class="btn btn-secondary btn-sm" onClick={() => go('restaurants')}>
          Retour à la liste
        </button>
      </div>
    );
  }

  const canEdit = can(actor, 'restaurant.edit', { restaurantId: stored.id });
  const { errors, warnings } = validate(mine, all);
  const hasErrors = Object.keys(errors).length > 0;
  const set = <K extends keyof AdminRestaurant>(k: K, v: AdminRestaurant[K]) => setMine((m) => (m ? { ...m, [k]: v } : m));
  const setIn = (path: string, v: unknown) => setMine((m) => (m ? setPath(m, path, v) : m));

  const save = () => {
    if (!can(actor, 'restaurant.edit', { restaurantId: stored.id })) return toast('Droit insuffisant pour modifier cette fiche.', 'bad');
    if (hasErrors) return toast('Corrige les erreurs avant d’enregistrer.', 'bad');
    const current = restaurant(stored.id)!;
    try {
      const next = withSlugHistory(saveVersioned(current, base, mine, [...FIELDS]), current);
      persist(next, current, 'restaurant.update');
    } catch (e) {
      if (e instanceof VersionConflictError) setConflict({ merge: (e as VersionConflictError<AdminRestaurant>).merge, current: e.current as AdminRestaurant });
      else throw e;
    }
  };

  const persist = (next: AdminRestaurant, before: AdminRestaurant, action: string, reason?: string) => {
    const changed = FIELDS.filter((f) => !same(before[f], next[f]));
    const saved: AdminRestaurant = { ...next, updatedAt: todayIso() };
    updateRestaurant(saved, auditEntry(actor, action, 'restaurant', saved.id, {
      reason,
      before: Object.fromEntries(changed.map((f) => [f, before[f]])),
      after: Object.fromEntries(changed.map((f) => [f, saved[f]])),
    }));
    setBase(structuredClone(saved));
    setMine(structuredClone(saved));
    toast(changed.length ? `Enregistré (version ${saved.version}).` : 'Aucun changement.', 'ok');
  };

  const simulateConcurrent = () => {
    const current = restaurant(stored.id)!;
    const other = { id: 'u-karim-onglet-2', role: 'editor' as const, mfa: true };
    const next: AdminRestaurant = {
      ...current,
      description: `${current.description} Terrasse chauffée depuis octobre.`,
      contact: { ...current.contact, phone: '01 99 00 55 31' },
      version: current.version + 1,
      updatedAt: todayIso(),
    };
    updateRestaurant(
      next,
      auditEntry(other, 'restaurant.update', 'restaurant', current.id, {
        reason: 'Modification simulée depuis un autre poste',
        before: { description: current.description, contact: current.contact },
        after: { description: next.description, contact: next.contact },
      }),
    );
    toast('Karim vient de modifier cette fiche (description et téléphone). Enregistre pour voir la fusion.');
  };

  const doTransition = (to: PublicationStatus, reason?: string) => {
    const current = restaurant(stored.id)!;
    try {
      const { restaurant: next, audit } = transition(current, to, actor, nowIso(), reason);
      updateRestaurant(next as AdminRestaurant, audit);
      toast(`${PUBLICATION_LABELS[current.publication]} → ${PUBLICATION_LABELS[to]}.`, 'ok');
    } catch (e) {
      if (e instanceof TransitionError) toast(e.message, 'bad');
      else throw e;
    }
    setPendingTransition(undefined);
  };

  const transitions = allowedTransitions(stored, actor);
  const halal = deriveHalalStatus(mine.halalClaims, todayIso(), data.get().certifiers);
  const hue = hueOf(mine);

  return (
    <div class="a-page editor">
      <PageHead title={mine.name || 'Sans nom'} eyebrow={`Fiche ${stored.id} · version ${stored.version}`}>
        <PublicationPill status={stored.publication} />
        <OperatingPill status={stored.operating} />
        <HoursPill r={stored} />
      </PageHead>

      <div class="editor-bar">
        <button type="button" class="btn btn-ghost btn-sm" onClick={() => go('restaurants')}>
          <Icon name="back" /> Liste
        </button>
        <span class="grow" />
        {canEdit && (
          <button type="button" class="btn btn-secondary btn-sm" onClick={simulateConcurrent} title="Démonstration du verrouillage optimiste">
            <Icon name="user" /> Simuler une modification concurrente
          </button>
        )}
        {transitions.map((to) => {
          const rule = TRANSITIONS[stored.publication].find((t) => t.to === to)!;
          return (
            <button
              key={to}
              type="button"
              class={`btn btn-sm ${to === 'published' ? 'btn-primary' : to === 'suspended' || to === 'archived' ? 'btn-danger-ghost' : 'btn-secondary'}`}
              disabled={dirty}
              title={dirty ? 'Enregistre tes modifications d’abord' : undefined}
              onClick={() => (rule.reasonRequired ? setPendingTransition(to) : doTransition(to))}
            >
              {TRANSITION_LABELS[to]}
            </button>
          );
        })}
        {canEdit && (
          <button type="button" class="btn btn-primary btn-sm" disabled={!dirty || hasErrors} onClick={save}>
            <Icon name="check" /> Enregistrer
          </button>
        )}
      </div>

      {!canEdit && (
        <div class="notice">
          <Icon name="lock" />
          <span>
            Lecture seule pour ton rôle.
            {actor.role === 'restaurateur' && (
              <>
                {' '}
                Pour corriger une information, <button type="button" class="link" onClick={() => go('owner')}>fais une demande de modification</button> : l’équipe la vérifie avant publication.
              </>
            )}
          </span>
        </div>
      )}

      {stored.pending && stored.pending.length > 0 && <PendingBanner r={stored} />}

      {dirty && (
        <div class="notice info" role="status">
          <Icon name="edit" />
          <span>
            Modifications non enregistrées : {FIELDS.filter((f) => !same(mine[f], base[f])).map((f) => FIELD_LABELS[f]).join(', ')}.
          </span>
          <button type="button" class="btn btn-ghost btn-sm" onClick={() => setMine(structuredClone(base))}>
            Annuler
          </button>
        </div>
      )}

      <div class="editor-grid">
        <fieldset class="editor-form" disabled={!canEdit}>
          <Block title="Identité">
            <Field label="Nom" error={errors.name}>
              <input id="f-name" class="input" value={mine.name} onInput={(e) => set('name', (e.currentTarget as HTMLInputElement).value)} />
            </Field>
            <Field label="Adresse web" help={`yallayum.app/r/${mine.slug}`} error={errors.slug}>
              <div class="inline">
                <input id="f-slug" class="input" value={mine.slug} onInput={(e) => set('slug', (e.currentTarget as HTMLInputElement).value)} />
                <button type="button" class="btn btn-secondary btn-sm" onClick={() => set('slug', slugify(mine.name))}>
                  Depuis le nom
                </button>
              </div>
            </Field>
            {mine.previousSlugs?.length ? <p class="sub">Anciennes adresses redirigées : {mine.previousSlugs.join(', ')}</p> : null}
            <Field label="Description" help={`${mine.description.length} caractères · utile, distinctive, vérifiable (60 à 280 conseillés)`} wide>
              <textarea id="f-desc" class="input" rows={4} value={mine.description} onInput={(e) => set('description', (e.currentTarget as HTMLTextAreaElement).value)} />
            </Field>
          </Block>

          <Block title="Adresse et position">
            <div class="cols-2">
              <Field label="Rue">
                <input id="f-street" class="input" value={mine.address.street} onInput={(e) => setIn('address.street', (e.currentTarget as HTMLInputElement).value)} />
              </Field>
              <Field label="Code postal">
                <input id="f-cp" class="input" inputMode="numeric" value={mine.address.postcode} onInput={(e) => setIn('address.postcode', (e.currentTarget as HTMLInputElement).value)} />
              </Field>
              <Field label="Ville">
                <input id="f-city" class="input" value={mine.address.city} onInput={(e) => setIn('address.city', (e.currentTarget as HTMLInputElement).value)} />
              </Field>
              <Field label="Arrondissement ou commune affichée">
                <input id="f-district" class="input" value={mine.address.district} onInput={(e) => setIn('address.district', (e.currentTarget as HTMLInputElement).value)} />
              </Field>
              <Field label="Quartier">
                <input id="f-neigh" class="input" value={mine.address.neighbourhood ?? ''} onInput={(e) => setIn('address.neighbourhood', (e.currentTarget as HTMLInputElement).value || undefined)} />
              </Field>
              <div />
              <Field label="Latitude" error={errors.location}>
                <input id="f-lat" class="input tnum" inputMode="decimal" value={String(mine.location.lat)} onInput={(e) => setIn('location.lat', Number((e.currentTarget as HTMLInputElement).value.replace(',', '.')))} />
              </Field>
              <Field label="Longitude">
                <input id="f-lng" class="input tnum" inputMode="decimal" value={String(mine.location.lng)} onInput={(e) => setIn('location.lng', Number((e.currentTarget as HTMLInputElement).value.replace(',', '.')))} />
              </Field>
            </div>
            <p class="sub">En production, l’adresse est géocodée par la Base Adresse Nationale ; un écart de plus de 75 m avec ces coordonnées est signalé.</p>
          </Block>

          <Block title="Situation">
            <div class="cols-2">
              <Field label="Situation de l’établissement">
                <select id="f-op" class="input" value={mine.operating} onChange={(e) => set('operating', (e.currentTarget as HTMLSelectElement).value as OperatingStatus)}>
                  {(Object.keys(OPERATING_LABELS) as OperatingStatus[]).map((o) => (
                    <option key={o} value={o}>
                      {OPERATING_LABELS[o]}
                    </option>
                  ))}
                </select>
              </Field>
              {mine.operating === 'temporarily_closed' && (
                <Field label="Réouverture prévue">
                  <input id="f-reopen" class="input" type="date" value={mine.temporarilyClosedUntil ?? ''} onInput={(e) => set('temporarilyClosedUntil', (e.currentTarget as HTMLInputElement).value || undefined)} />
                </Field>
              )}
              {mine.operating === 'moved' && (
                <Field label="Nouvelle fiche">
                  <select id="f-succ" class="input" value={mine.successorId ?? ''} onChange={(e) => set('successorId', (e.currentTarget as HTMLSelectElement).value || undefined)}>
                    <option value="">—</option>
                    {all
                      .filter((x) => x.id !== mine.id && isDiscoverable(x))
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
            </div>
            {mine.operating === 'permanently_closed' && (
              <p class="sub">Une fiche fermée définitivement sort de la carte et de la recherche ; son lien explique la fermeture et propose des adresses proches.</p>
            )}
          </Block>

          <Block title="Cuisines">
            {CUISINE_FAMILIES.map((fam) => (
              <div key={fam.id} class="chip-group">
                <span class="chip-group-label">{fam.label}</span>
                <div class="wrap-chips">
                  {CUISINES.filter((c) => c.family === fam.id).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      class="chip flat"
                      aria-pressed={mine.cuisines.includes(c.id)}
                      onClick={() => set('cuisines', mine.cuisines.includes(c.id) ? mine.cuisines.filter((x) => x !== c.id) : [...mine.cuisines, c.id])}
                    >
                      {c.parent ? '· ' : ''}
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p class="sub">La première cuisine donne l’icône et la couleur de la fiche.</p>
          </Block>

          <Block title="Envies" sub="Posées par la rédaction : 2 = caractéristique du lieu, 1 = convient.">
            <div class="occasion-grid">
              {OCCASIONS.map((o) => {
                const cur = mine.occasions.find((x) => x.id === o.id)?.strength ?? 0;
                return (
                  <div key={o.id} class="occasion-row">
                    <span>{o.label}</span>
                    <div class="seg small" role="group" aria-label={`Force pour ${o.label}`}>
                      {[0, 1, 2].map((v) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={cur === v}
                          onClick={() =>
                            set('occasions', v === 0 ? mine.occasions.filter((x) => x.id !== o.id) : [...mine.occasions.filter((x) => x.id !== o.id), { id: o.id, strength: v as 1 | 2 }])
                          }
                        >
                          {v === 0 ? 'Non' : v}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Block>

          <Block title="Équipements et alcool" sub="Cocher seulement ce qui est confirmé : une case vide se lit « non confirmé ».">
            <div class="wrap-chips">
              {AMENITIES.map((a) => (
                <button key={a.id} type="button" class="chip flat" aria-pressed={mine.amenities.includes(a.id)} onClick={() => set('amenities', mine.amenities.includes(a.id) ? mine.amenities.filter((x) => x !== a.id) : [...mine.amenities, a.id])}>
                  {a.label}
                </button>
              ))}
            </div>
            <Field label="Alcool">
              <select id="f-alcohol" class="input" value={mine.alcohol} onChange={(e) => set('alcohol', (e.currentTarget as HTMLSelectElement).value as Restaurant['alcohol'])}>
                <option value="not_served">Non servi (confirmé)</option>
                <option value="served">Servi</option>
                <option value="unknown">Non renseigné</option>
              </select>
            </Field>
          </Block>

          <Block title="Prix" sub="Par personne. Une fourchette n’est saisie que si elle a été observée (menu, visite).">
            <div class="seg" role="group" aria-label="Niveau de prix">
              <button type="button" aria-pressed={!mine.price} onClick={() => set('price', undefined)}>
                Inconnu
              </button>
              {([1, 2, 3, 4] as PriceLevel[]).map((p) => (
                <button key={p} type="button" aria-pressed={mine.price?.level === p} onClick={() => set('price', { ...(mine.price ?? {}), level: p })}>
                  {PRICE_LEVELS[p].symbol}
                </button>
              ))}
            </div>
            {mine.price && (
              <div class="cols-3">
                <Field label="Min (€)" error={errors.price}>
                  <input id="f-pmin" class="input tnum" inputMode="numeric" value={mine.price.min ?? ''} onInput={(e) => setIn('price.min', numOrUndef((e.currentTarget as HTMLInputElement).value))} />
                </Field>
                <Field label="Max (€)">
                  <input id="f-pmax" class="input tnum" inputMode="numeric" value={mine.price.max ?? ''} onInput={(e) => setIn('price.max', numOrUndef((e.currentTarget as HTMLInputElement).value))} />
                </Field>
                <Field label="Observé le">
                  <input id="f-pobs" class="input" type="date" value={mine.price.observedAt ?? ''} onInput={(e) => setIn('price.observedAt', (e.currentTarget as HTMLInputElement).value || undefined)} />
                </Field>
              </div>
            )}
          </Block>

          <Block title="Contact">
            <div class="cols-2">
              <Field label="Téléphone">
                <input id="f-phone" class="input tnum" value={mine.contact.phone ?? ''} onInput={(e) => setIn('contact.phone', (e.currentTarget as HTMLInputElement).value || undefined)} />
              </Field>
              <Field label="Site">
                <input id="f-site" class="input" value={mine.contact.website ?? ''} onInput={(e) => setIn('contact.website', (e.currentTarget as HTMLInputElement).value || undefined)} />
              </Field>
              <Field label="Instagram">
                <input id="f-insta" class="input" value={mine.contact.instagram ?? ''} onInput={(e) => setIn('contact.instagram', (e.currentTarget as HTMLInputElement).value || undefined)} />
              </Field>
              <Field label="Réservation (lien)">
                <input id="f-book" class="input" value={mine.contact.bookingUrl ?? ''} onInput={(e) => setIn('contact.bookingUrl', (e.currentTarget as HTMLInputElement).value || undefined)} />
              </Field>
              <Field label="Menu (lien)">
                <input id="f-menu" class="input" value={mine.contact.menuUrl ?? ''} onInput={(e) => setIn('contact.menuUrl', (e.currentTarget as HTMLInputElement).value || undefined)} />
              </Field>
              <Field label="Menu consulté le">
                <input id="f-menud" class="input" type="date" value={mine.contact.menuCheckedAt ?? ''} onInput={(e) => setIn('contact.menuCheckedAt', (e.currentTarget as HTMLInputElement).value || undefined)} />
              </Field>
            </div>
          </Block>

          <HoursEditor r={mine} onChange={(hours) => set('hours', hours)} error={errors.hours} />

          <Block title="Médias" sub="Aucune image générée ne doit passer pour la photo d’un lieu réel.">
            <div class="table-wrap">
              <table class="data compact">
                <thead>
                  <tr>
                    <th>Visuel</th>
                    <th>Nature</th>
                    <th>Crédit</th>
                    <th>Licence</th>
                    <th>Droits</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.media.map((m, i) => (
                    <tr key={m.id}>
                      <td>
                        <div class="media-thumb">
                          <Illustration media={m} hue={hue} width={56} height={40} tag={false} />
                        </div>
                      </td>
                      <td>{m.kind === 'photo' ? 'Photo' : 'Illustration générique'}</td>
                      <td>
                        <input class="input slim" aria-label="Crédit" value={m.credit ?? ''} onInput={(e) => setIn(`media.${i}.credit`, (e.currentTarget as HTMLInputElement).value || undefined)} />
                      </td>
                      <td>
                        <input class="input slim" aria-label="Licence" value={m.license ?? ''} onInput={(e) => setIn(`media.${i}.license`, (e.currentTarget as HTMLInputElement).value || undefined)} />
                      </td>
                      <td>
                        {m.kind === 'illustration' ? (
                          <span class="pill pill-muted">
                            <span class="glyph">▢</span>Visuel générique
                          </span>
                        ) : m.license ? (
                          <span class="pill pill-ok">
                            <span class="glyph">●</span>Acquis
                          </span>
                        ) : (
                          <span class="pill pill-warn">
                            <span class="glyph">◐</span>À vérifier
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>
        </fieldset>

        <aside class="editor-side">
          <div class="phone-preview" style={{ '--seed-h': hue }} aria-label="Aperçu mobile">
            <div class="pp-hero">
              <Illustration media={mine.media[0]} hue={hue} width={248} height={140} />
            </div>
            <div class="pp-body">
              <span class="pp-kicker">
                {mine.cuisines.map((c) => cuisine(c)?.label).filter(Boolean).slice(0, 2).join(' · ')} — {mine.address.neighbourhood ?? mine.address.district}
              </span>
              <strong class="pp-title">{mine.name || 'Sans nom'}</strong>
              <OpenLabel status={openStatus(mine, new Date())} />
              <span class="pp-meta">{mine.price ? PRICE_LEVELS[mine.price.level].symbol : 'Prix non renseigné'}</span>
              <TrustBadge status={halal} />
            </div>
          </div>
          <div class={`notice ${isDiscoverable(mine) ? 'info' : ''}`}>
            <Icon name={isDiscoverable(mine) ? 'eye' : 'lock'} />
            <span>{isDiscoverable(mine) ? 'Visible dans l’app une fois enregistrée.' : 'Invisible dans l’app : ' + (mine.publication !== 'published' ? PUBLICATION_LABELS[mine.publication].toLowerCase() : OPERATING_LABELS[mine.operating].toLowerCase()) + '.'}</span>
          </div>
          <div class="side-box">
            <h3>Information halal</h3>
            <TrustBadge status={halal} large />
            <p class="sub">{halalHeadline(halal)}{halal.validUntil ? ` · jusqu’au ${formatDate(halal.validUntil)}` : ''}</p>
            <button type="button" class="btn btn-secondary btn-sm" onClick={() => go('halal', { halalId: stored.id })}>
              <Icon name="shield" /> Preuves et vérification
            </button>
          </div>
          {(warnings.length > 0 || hasErrors) && (
            <div class="side-box">
              <h3>Contrôles</h3>
              <ul class="checks">
                {Object.values(errors).map((e) => (
                  <li key={e} class="bad">
                    ✕ {e}
                  </li>
                ))}
                {warnings.map((w) => (
                  <li key={w} class="warn">
                    ! {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {conflict && (
        <ConflictDialog
          mine={mine}
          conflict={conflict}
          onClose={() => setConflict(undefined)}
          onResolve={(final) => {
            const current = restaurant(stored.id)!;
            const next = withSlugHistory(saveVersioned(current, current, final, [...FIELDS]), current);
            persist(next, current, 'restaurant.update', 'Fusion après modification concurrente');
            setConflict(undefined);
          }}
        />
      )}

      {pendingTransition && (
        <ReasonDialog
          title={`${TRANSITION_LABELS[pendingTransition]} « ${stored.name} »`}
          confirm={TRANSITION_LABELS[pendingTransition]}
          danger={pendingTransition === 'suspended' || pendingTransition === 'archived'}
          onClose={() => setPendingTransition(undefined)}
          onConfirm={(reason) => doTransition(pendingTransition, reason)}
        >
          <p class="sub">
            {pendingTransition === 'suspended' && 'La fiche disparaît de l’app immédiatement ; son lien affiche « fiche indisponible ».'}
            {pendingTransition === 'archived' && 'La fiche est retirée durablement ; elle reste restaurable en brouillon.'}
            {pendingTransition === 'draft' && 'La fiche repasse en brouillon, invisible du public.'}
            {pendingTransition === 'published' && 'La fiche redevient visible du public.'}
          </p>
        </ReasonDialog>
      )}
    </div>
  );
}

function numOrUndef(v: string): number | undefined {
  const n = Number(v.replace(',', '.'));
  return v.trim() && Number.isFinite(n) ? n : undefined;
}

/** Une adresse web changée garde l'ancienne en redirection. */
function withSlugHistory(next: AdminRestaurant, before: AdminRestaurant): AdminRestaurant {
  if (next.slug === before.slug) return next;
  const prev = new Set([...(before.previousSlugs ?? []), before.slug]);
  prev.delete(next.slug);
  return { ...next, previousSlugs: [...prev] };
}

function Block({ title, sub, children }: { title: string; sub?: string; children: ComponentChildren }) {
  return (
    <section class="block">
      <h2>{title}</h2>
      {sub && <p class="sub">{sub}</p>}
      <div class="block-body">{children}</div>
    </section>
  );
}

function HoursEditor({ r, onChange, error }: { r: AdminRestaurant; onChange: (h: AdminRestaurant['hours']) => void; error?: string }) {
  const h = r.hours ?? { weekly: [], special: [], source: 'team_phone' as HoursSource };
  const upd = (patch: Partial<NonNullable<AdminRestaurant['hours']>>) => onChange({ ...h, ...patch });
  const setRange = (idx: number, patch: Partial<WeeklyRange>) => upd({ weekly: h.weekly.map((w, i) => (i === idx ? { ...w, ...patch } : w)) });
  const sorted = h.weekly.map((w, i) => ({ w, i }));
  return (
    <Block title="Horaires" sub="Heure locale. Une fermeture avant l’ouverture traverse minuit (18:00 → 02:00 couvre la nuit).">
      {!r.hours && <p class="sub">Aucun horaire : la fiche sort du filtre « Ouvert maintenant » (groupe « non confirmés »).</p>}
      <div class="hours-edit">
        {([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((day) => {
          const ranges = sorted.filter(({ w }) => w.day === day);
          return (
            <div key={day} class="hours-day">
              <span class="day">{DAY_LABELS[day]}</span>
              <div class="ranges">
                {ranges.length === 0 && <span class="muted">Fermé</span>}
                {ranges.map(({ w, i }) => (
                  <span key={i} class="range">
                    <input class="input slim tnum" aria-label={`${DAY_LABELS[day]} ouverture`} value={w.opens} onInput={(e) => setRange(i, { opens: (e.currentTarget as HTMLInputElement).value })} />
                    →
                    <input class="input slim tnum" aria-label={`${DAY_LABELS[day]} fermeture`} value={w.closes} onInput={(e) => setRange(i, { closes: (e.currentTarget as HTMLInputElement).value })} />
                    {/^\d\d:\d\d$/.test(w.opens) && /^\d\d:\d\d$/.test(w.closes) && parseTime(w.closes) <= parseTime(w.opens) && <span class="mini-flag">lendemain</span>}
                    <button type="button" class="icon-btn small" aria-label="Retirer la plage" onClick={() => upd({ weekly: h.weekly.filter((_, j) => j !== i) })}>
                      <Icon name="close" size={16} />
                    </button>
                  </span>
                ))}
              </div>
              <button type="button" class="btn btn-ghost btn-sm" onClick={() => upd({ weekly: [...h.weekly, { day, opens: '12:00', closes: '14:30' }] })}>
                <Icon name="plus" /> Plage
              </button>
            </div>
          );
        })}
      </div>
      {error && <span class="error-text">{error}</span>}
      <div class="cols-2">
        <Field label="Confirmés le">
          <input id="f-hver" class="input" type="date" value={h.verifiedAt ?? ''} onInput={(e) => upd({ verifiedAt: (e.currentTarget as HTMLInputElement).value || undefined })} />
        </Field>
        <Field label="Source">
          <select id="f-hsrc" class="input" value={h.source} onChange={(e) => upd({ source: (e.currentTarget as HTMLSelectElement).value as HoursSource })}>
            {(Object.keys(HOURS_SOURCES) as HoursSource[]).map((s) => (
              <option key={s} value={s}>
                {HOURS_SOURCES[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <h3 class="mini-title">Exceptions datées</h3>
      {h.special.map((s, i) => (
        <div key={i} class="special-row">
          <input class="input slim" type="date" aria-label="Date" value={s.date} onInput={(e) => upd({ special: h.special.map((x, j) => (j === i ? { ...x, date: (e.currentTarget as HTMLInputElement).value } : x)) })} />
          <input class="input slim" aria-label="Libellé" placeholder="Jour férié, congés…" value={s.label ?? ''} onInput={(e) => upd({ special: h.special.map((x, j) => (j === i ? { ...x, label: (e.currentTarget as HTMLInputElement).value } : x)) })} />
          <label class="check">
            <input type="checkbox" checked={s.closed} onChange={(e) => upd({ special: h.special.map((x, j) => (j === i ? { ...x, closed: (e.currentTarget as HTMLInputElement).checked } : x)) })} /> Fermé
          </label>
          <button type="button" class="icon-btn small" aria-label="Retirer l’exception" onClick={() => upd({ special: h.special.filter((_, j) => j !== i) })}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
      <button type="button" class="btn btn-ghost btn-sm" onClick={() => upd({ special: [...h.special, { date: todayIso(), closed: true, label: 'Fermeture exceptionnelle' } as SpecialDay] })}>
        <Icon name="plus" /> Exception
      </button>
    </Block>
  );
}

function ConflictDialog({
  mine,
  conflict,
  onClose,
  onResolve,
}: {
  mine: AdminRestaurant;
  conflict: { merge: MergeResult<AdminRestaurant>; current: AdminRestaurant };
  onClose: () => void;
  onResolve: (final: AdminRestaurant) => void;
}) {
  const { merge, current } = conflict;
  const [choice, setChoice] = useState<Record<string, 'mine' | 'theirs'>>(() => Object.fromEntries(merge.conflicts.map((f) => [f, 'mine'])));
  const lastAudit = useData((d) => d.audit.find((a) => a.entityId === current.id && a.action === 'restaurant.update'));
  const final = useMemo(() => {
    let out = { ...merge.merged };
    for (const f of merge.conflicts) out = { ...out, [f]: choice[f as string] === 'mine' ? mine[f] : current[f] };
    return out as AdminRestaurant;
  }, [choice]);
  return (
    <Dialog
      title="Cette fiche a été modifiée pendant que tu l’éditais"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" class="btn btn-secondary btn-sm" onClick={onClose}>
            Revenir à l’édition
          </button>
          <button type="button" class="btn btn-primary btn-sm" onClick={() => onResolve(final)}>
            Enregistrer la fusion
          </button>
        </>
      }
    >
      <p class="sub">
        Version {current.version} enregistrée {lastAudit ? `par ${actorLabel(lastAudit.actorId)} le ${new Date(lastAudit.at).toLocaleString('fr-FR')}` : 'entre-temps'}. Rien n’a été écrasé.
      </p>
      {merge.theirs.length > 0 && (
        <div class="notice info">
          <Icon name="check" />
          <span>Repris automatiquement de l’autre modification : {merge.theirs.map((f) => FIELD_LABELS[f as FieldKey] ?? String(f)).join(', ')}.</span>
        </div>
      )}
      {merge.conflicts.length === 0 ? (
        <p>Vos changements portent sur des champs différents : la fusion garde les deux.</p>
      ) : (
        merge.conflicts.map((f) => (
          <fieldset key={String(f)} class="merge-field">
            <legend>{FIELD_LABELS[f as FieldKey] ?? String(f)}</legend>
            <label class={`merge-opt${choice[f as string] === 'theirs' ? ' on' : ''}`}>
              <input type="radio" name={`m-${String(f)}`} checked={choice[f as string] === 'theirs'} onChange={() => setChoice({ ...choice, [f as string]: 'theirs' })} />
              <span>
                <strong>Version enregistrée</strong>
                <span class="val">{display(String(f), current[f])}</span>
              </span>
            </label>
            <label class={`merge-opt${choice[f as string] === 'mine' ? ' on' : ''}`}>
              <input type="radio" name={`m-${String(f)}`} checked={choice[f as string] === 'mine'} onChange={() => setChoice({ ...choice, [f as string]: 'mine' })} />
              <span>
                <strong>Ta version</strong>
                <span class="val">{display(String(f), mine[f])}</span>
              </span>
            </label>
          </fieldset>
        ))
      )}
    </Dialog>
  );
}

// ─── Brouillon de modifications issu des contributions ──────────────────────

export function PendingBanner({ r }: { r: AdminRestaurant }) {
  const actor = useActor();
  const pending = r.pending ?? [];
  const canPublish = (requires: string) => can(actor, requires === 'halal.review' ? 'halal.review' : 'restaurant.publish', { restaurantId: r.id });
  const publish = () => {
    const current = restaurant(r.id)!;
    const allowed = (current.pending ?? []).filter((p) => canPublish(p.requires));
    if (!allowed.length) return toast('Droit insuffisant pour publier ces modifications.', 'bad');
    let next: AdminRestaurant = { ...current };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const p of allowed) {
      for (const [path, value] of Object.entries(p.changes)) {
        before[path] = getPath(current, path);
        after[path] = value;
        next = setPath(next, path, value);
      }
    }
    next = { ...next, pending: (current.pending ?? []).filter((p) => !allowed.includes(p)), version: current.version + 1, updatedAt: todayIso() };
    if (!next.pending?.length) delete next.pending;
    updateRestaurant(next, auditEntry(actor, 'restaurant.pending_published', 'restaurant', r.id, { reason: `Contributions ${allowed.map((p) => p.contributionId).join(', ')}`, before, after }));
    toast('Modifications publiées.', 'ok');
  };
  const discard = (p: (typeof pending)[number]) => {
    if (!can(actor, 'restaurant.edit', { restaurantId: r.id })) return toast('Droit insuffisant.', 'bad');
    const current = restaurant(r.id)!;
    const rest = (current.pending ?? []).filter((x) => x.proposalId !== p.proposalId);
    updateRestaurant({ ...current, pending: rest.length ? rest : undefined, version: current.version + 1 }, auditEntry(actor, 'restaurant.pending_discarded', 'restaurant', r.id, { reason: `Proposition ${p.proposalId} écartée`, before: p.changes }));
  };
  return (
    <div class="pending-banner" role="region" aria-label="Modifications non publiées">
      <div class="pb-head">
        <Icon name="edit" />
        <strong>Modifications non publiées</strong>
        <span class="sub">Issues de contributions acceptées. Le public voit toujours la version actuelle.</span>
      </div>
      <table class="data compact">
        <tbody>
          {pending.flatMap((p) =>
            Object.entries(p.changes).map(([path, value]) => (
              <tr key={p.proposalId + path}>
                <td class="muted">{path}</td>
                <td>
                  <del>{display(path.split('.')[0], getPath(r, path))}</del>
                </td>
                <td>
                  <ins>{display(path.split('.')[0], value)}</ins>
                </td>
                <td class="muted">{p.requires === 'halal.review' ? 'Vérificateur' : 'Éditeur'}</td>
                <td>
                  <button type="button" class="btn btn-ghost btn-sm" onClick={() => discard(p)}>
                    Écarter
                  </button>
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      <button type="button" class="btn btn-primary btn-sm" disabled={!pending.some((p) => canPublish(p.requires))} onClick={publish}>
        Publier les modifications
      </button>
    </div>
  );
}
