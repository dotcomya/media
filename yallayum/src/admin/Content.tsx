// Contenus : collections éditoriales. Une collection ne peut lier que des
// fiches visibles du public ; si une fiche liée sort de la découverte
// (fermeture, suspension), elle est signalée et n'est plus affichée.

import { useState } from 'preact/hooks';
import { isDiscoverable } from '../domain/publication';
import { can } from '../domain/rbac';
import { normalize } from '../domain/text';
import { Icon } from '../ui/Icon';
import { Illustration, hueOf } from '../ui/bits';
import { auditEntry, commit, data, restaurant, todayIso, toast, type AdminCollection } from './model';
import { Field, PageHead, Pill, useActor, useData } from './ui';

export function Content() {
  const collections = useData((d) => [...d.collections].sort((a, b) => a.order - b.order));
  const actor = useActor();
  const [editing, setEditing] = useState<string | undefined>(collections[0]?.id);
  const canEdit = can(actor, 'content.edit');
  const today = todayIso();

  const move = (id: string, dir: -1 | 1) => {
    if (!can(actor, 'content.edit')) return;
    const list = [...collections];
    const i = list.findIndex((c) => c.id === id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    commit(
      { collections: list.map((c, k) => ({ ...c, order: k })) },
      auditEntry(actor, 'content.reorder', 'content', id, { after: { ordre: list.map((c) => c.title) } }),
    );
  };

  const current = collections.find((c) => c.id === editing);

  return (
    <div class="a-page">
      <PageHead title="Contenus" eyebrow="Collections éditoriales de l’onglet Collections" />
      {!canEdit && (
        <div class="notice">
          <Icon name="lock" />
          <span>Consultation seule pour ton rôle.</span>
        </div>
      )}
      <div class="split">
        <div class="split-list">
          <ol class="pick-list ordered">
            {collections.map((c, i) => {
              const broken = (c.restaurantIds ?? []).filter((id) => {
                const r = restaurant(id);
                return !r || !isDiscoverable(r);
              });
              const status = c.scheduledAt && c.scheduledAt > today ? 'scheduled' : 'live';
              return (
                <li key={c.id}>
                  <div class={`pick${c.id === editing ? ' on' : ''}`}>
                    <button type="button" class="grow pick-main" onClick={() => setEditing(c.id)}>
                      <strong>
                        {i + 1}. {c.title}
                      </strong>
                      <span class="sub">
                        {c.rule ? 'Règle calculée' : `${c.restaurantIds?.length ?? 0} adresses`}
                        {broken.length ? ` · ${broken.length} non visible(s)` : ''}
                      </span>
                    </button>
                    <Pill tone={status === 'live' ? 'ok' : 'info'} glyph={status === 'live' ? '●' : '◷'}>
                      {status === 'live' ? 'En ligne' : `Le ${c.scheduledAt!.split('-').reverse().join('/')}`}
                    </Pill>
                    {canEdit && (
                      <span class="updown">
                        <button type="button" class="icon-btn small" aria-label={`Monter ${c.title}`} disabled={i === 0} onClick={() => move(c.id, -1)}>
                          <Icon name="down" size={16} class="flip" />
                        </button>
                        <button type="button" class="icon-btn small" aria-label={`Descendre ${c.title}`} disabled={i === collections.length - 1} onClick={() => move(c.id, 1)}>
                          <Icon name="down" size={16} />
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <div class="split-detail">{current && <CollectionEditor key={current.id} c={current} canEdit={canEdit} />}</div>
      </div>
    </div>
  );
}

function CollectionEditor({ c, canEdit }: { c: AdminCollection; canEdit: boolean }) {
  const actor = useActor();
  const restaurants = useData((d) => d.restaurants);
  const [draft, setDraft] = useState<AdminCollection>(structuredClone(c));
  const [q, setQ] = useState('');
  const visible = restaurants.filter(isDiscoverable);
  const linked = draft.restaurantIds ?? [];
  const broken = linked.filter((id) => {
    const r = restaurant(id);
    return !r || !isDiscoverable(r);
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(c);

  const save = () => {
    if (!can(actor, 'content.edit')) return toast('Droit insuffisant.', 'bad');
    if (!draft.title.trim()) return toast('Le titre est obligatoire.', 'bad');
    // Garde-fou : on ne lie jamais une adresse non publiée.
    const clean = { ...draft, restaurantIds: draft.restaurantIds?.filter((id) => visible.some((r) => r.id === id)) };
    commit(
      { collections: data.get().collections.map((x) => (x.id === c.id ? clean : x)) },
      auditEntry(actor, 'content.update', 'content', c.id, { before: { titre: c.title, adresses: c.restaurantIds, programmation: c.scheduledAt }, after: { titre: clean.title, adresses: clean.restaurantIds, programmation: clean.scheduledAt } }),
    );
    setDraft(clean);
    toast('Collection enregistrée.', 'ok');
  };

  const first = linked.map((id) => restaurant(id)).find((r) => r && isDiscoverable(r));

  return (
    <div class="claims-panel">
      <div class="coll-preview" style={{ '--seed-h': draft.hue }} aria-label="Aperçu mobile">
        {first && (
          <div class="cp-img">
            <Illustration media={first.media[0]} hue={hueOf(first)} width={300} height={120} tag={false} />
          </div>
        )}
        <div class="cp-txt">
          <span class="kick">{draft.kicker}</span>
          <strong>{draft.title}</strong>
          <span>{draft.rule ? 'Liste calculée' : `${linked.length - broken.length} adresses`}</span>
        </div>
      </div>
      <fieldset class="editor-form" disabled={!canEdit}>
        <div class="cols-2">
          <Field label="Titre">
            <input id="c-title" class="input" value={draft.title} onInput={(e) => setDraft({ ...draft, title: (e.currentTarget as HTMLInputElement).value })} />
          </Field>
          <Field label="Chapeau">
            <input id="c-kicker" class="input" value={draft.kicker} onInput={(e) => setDraft({ ...draft, kicker: (e.currentTarget as HTMLInputElement).value })} />
          </Field>
        </div>
        <Field label="Introduction">
          <textarea id="c-intro" class="input" rows={3} value={draft.intro} onInput={(e) => setDraft({ ...draft, intro: (e.currentTarget as HTMLTextAreaElement).value })} />
        </Field>
        <Field label="Critères affichés" help="Un critère par ligne. Ils sont montrés tels quels aux utilisateurs.">
          <textarea id="c-criteria" class="input" rows={3} value={draft.criteria.join('\n')} onInput={(e) => setDraft({ ...draft, criteria: (e.currentTarget as HTMLTextAreaElement).value.split('\n').filter((l) => l.trim()) })} />
        </Field>
        <Field label="Mise en ligne" help="Vide = en ligne dès l’enregistrement.">
          <input id="c-date" class="input" type="date" value={draft.scheduledAt ?? ''} onInput={(e) => setDraft({ ...draft, scheduledAt: (e.currentTarget as HTMLInputElement).value || undefined })} />
        </Field>
        {draft.rule ? (
          <p class="sub">Collection calculée ({draft.rule === 'newest' ? 'publiées depuis moins de 60 jours' : 'ouvertes à 1 h, horaires confirmés'}) : la liste suit le catalogue.</p>
        ) : (
          <>
            <h3 class="mini-title">Adresses liées</h3>
            {broken.length > 0 && (
              <div class="notice">
                <Icon name="info" />
                <span>{broken.length} adresse(s) liée(s) ne sont plus visibles du public : elles ne s’affichent plus et seront retirées à l’enregistrement.</span>
              </div>
            )}
            <ul class="linked">
              {linked.map((id) => {
                const r = restaurant(id);
                return (
                  <li key={id} class={r && isDiscoverable(r) ? undefined : 'broken'}>
                    {r?.name ?? id}
                    <button type="button" class="icon-btn small" aria-label={`Retirer ${r?.name ?? id}`} onClick={() => setDraft({ ...draft, restaurantIds: linked.filter((x) => x !== id) })}>
                      <Icon name="close" size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <label class="field">
              Ajouter une adresse publiée
              <input id="c-search" class="input" placeholder="Nom…" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
            </label>
            {q.length > 1 && (
              <ul class="linked add">
                {visible
                  .filter((r) => !linked.includes(r.id) && normalize(r.name).includes(normalize(q)))
                  .slice(0, 6)
                  .map((r) => (
                    <li key={r.id}>
                      {r.name}
                      <button type="button" class="btn btn-ghost btn-sm" onClick={() => (setDraft({ ...draft, restaurantIds: [...linked, r.id] }), setQ(''))}>
                        <Icon name="plus" /> Ajouter
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}
        <div class="a-actions">
          <button type="button" class="btn btn-secondary btn-sm" disabled={!dirty} onClick={() => setDraft(structuredClone(c))}>
            Annuler
          </button>
          <button type="button" class="btn btn-primary btn-sm" disabled={!dirty && broken.length === 0} onClick={save}>
            Enregistrer
          </button>
        </div>
      </fieldset>
    </div>
  );
}
