// Espace restaurateur : ses établissements, ses statistiques agrégées, ses
// demandes de modification. Il ne publie rien ; ce qui touche au halal passe
// par un vérificateur.

import { useState } from 'preact/hooks';
import { formatAgo } from '../domain/format';
import { CONTRIBUTION_STATUS_LABELS, type Contribution, type ContributionKind } from '../domain/moderation';
import { can } from '../domain/rbac';
import { Icon } from '../ui/Icon';
import { Illustration, OpenLabel, TrustBadge, hueOf } from '../ui/bits';
import { openStatus } from '../domain/hours';
import { auditEntry, commit, data, go, halalOf, nowIso, todayIso, toast } from './model';
import { Field, PageHead, Pill, PublicationPill, Section, useActor, useData } from './ui';

type RequestField = 'description' | 'contact.phone' | 'contact.website' | 'hours.text' | 'price.text' | 'halal';

const REQUEST_FIELDS: { id: RequestField; label: string; kind: ContributionKind }[] = [
  { id: 'description', label: 'Description', kind: 'other' },
  { id: 'contact.phone', label: 'Téléphone', kind: 'contact' },
  { id: 'contact.website', label: 'Site', kind: 'contact' },
  { id: 'hours.text', label: 'Horaires', kind: 'hours' },
  { id: 'price.text', label: 'Prix', kind: 'other' },
  { id: 'halal', label: 'Information halal (certificat, fournisseurs)', kind: 'halal_info' },
];

/** Statistiques de démonstration, déterministes, par établissement et par semaine. */
function demoStats(restaurantId: string, week: number) {
  let h = 2166136261;
  for (const ch of `${restaurantId}-${week}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const impressions = 900 + (h % 700);
  const opened = Math.round(impressions * (0.11 + ((h >> 8) % 7) / 100));
  const routes = Math.round(opened * (0.22 + ((h >> 12) % 9) / 100));
  const calls = Math.round(opened * (0.04 + ((h >> 16) % 4) / 100));
  return { impressions, opened, routes, calls };
}

export function OwnerHome() {
  const actor = useActor();
  const restaurants = useData((d) => d.restaurants.filter((r) => actor.restaurantIds?.includes(r.id)));
  const contributions = useData((d) => d.contributions.filter((c) => c.userId === actor.id));
  const [requestFor, setRequestFor] = useState<string | undefined>();

  return (
    <div class="a-page">
      <PageHead title="Mes établissements" eyebrow="Espace restaurateur · Smash Club" />
      <div class="notice info">
        <Icon name="shield" />
        <span>Tu consultes et proposes ; l’équipe vérifie avant toute publication. L’information halal n’est modifiée qu’après contrôle d’un vérificateur.</span>
      </div>
      <div class="owner-cards">
        {restaurants.map((r) => (
          <article key={r.id} class="owner-card" style={{ '--seed-h': hueOf(r) }}>
            <div class="oc-img">
              <Illustration media={r.media[0]} hue={hueOf(r)} width={320} height={120} />
            </div>
            <div class="oc-body">
              <strong class="oc-title">{r.name}</strong>
              <span class="sub">
                {r.address.street}, {r.address.city}
              </span>
              <div class="a-actions wrap">
                <PublicationPill status={r.publication} />
                <OpenLabel status={openStatus(r, new Date())} short />
                <TrustBadge status={halalOf(r)} />
              </div>
              <div class="a-actions wrap">
                <button type="button" class="btn btn-primary btn-sm" onClick={() => setRequestFor(r.id)}>
                  <Icon name="edit" /> Demander une modification
                </button>
                <button type="button" class="btn btn-ghost btn-sm" onClick={() => go('editor', { editingId: r.id })}>
                  Voir la fiche
                </button>
              </div>
              {requestFor === r.id && <RequestForm restaurantId={r.id} onDone={() => setRequestFor(undefined)} />}
            </div>
          </article>
        ))}
      </div>

      <Section title="Mes demandes" sub="Suivi du traitement par l’équipe.">
        {contributions.length === 0 ? (
          <p class="sub">Aucune demande pour l’instant.</p>
        ) : (
          <ul class="pick-list">
            {contributions.map((c) => (
              <li key={c.id}>
                <div class="pick static">
                  <span class="grow">
                    <strong>{data.get().restaurants.find((r) => r.id === c.restaurantId)?.name}</strong>
                    <span class="sub">
                      {Object.keys(c.payload).join(', ')} · {formatAgo(c.createdAt.slice(0, 10), todayIso())}
                    </span>
                  </span>
                  <Pill tone={c.status === 'accepted' ? 'ok' : c.status === 'rejected' ? 'muted' : 'info'} glyph={c.status === 'accepted' ? '●' : c.status === 'rejected' ? '✕' : '◐'}>
                    {CONTRIBUTION_STATUS_LABELS[c.status]}
                  </Pill>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function RequestForm({ restaurantId, onDone }: { restaurantId: string; onDone: () => void }) {
  const actor = useActor();
  const [field, setField] = useState<RequestField>('contact.phone');
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');
  const def = REQUEST_FIELDS.find((f) => f.id === field)!;
  const send = () => {
    if (!can(actor, 'restaurant.propose_change', { restaurantId })) return toast('Tu ne peux proposer des changements que pour tes établissements.', 'bad');
    if (!value.trim()) return toast('Indique la nouvelle valeur.', 'bad');
    const at = nowIso();
    const c: Contribution = {
      id: `k-owner-${Date.now().toString(36)}`,
      kind: def.kind,
      restaurantId,
      payload: { [field]: value.trim() },
      halalSource: field === 'halal' ? value.trim() : undefined,
      message: message.trim() || undefined,
      status: 'received',
      createdAt: at,
      userId: actor.id,
      history: [{ at, status: 'received', actorId: actor.id, note: 'Demande du restaurateur' }],
    };
    commit({ contributions: [c, ...data.get().contributions] }, auditEntry(actor, 'contribution.owner_request', 'contribution', c.id, { after: c.payload }));
    toast('Demande envoyée à l’équipe.', 'ok');
    onDone();
  };
  return (
    <div class="add-evidence">
      <Field label="Information à corriger">
        <select id="o-field" class="input" value={field} onChange={(e) => setField((e.currentTarget as HTMLSelectElement).value as RequestField)}>
          {REQUEST_FIELDS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Nouvelle valeur" help={field === 'halal' ? 'Organisme, n° de certificat, date de fin : un vérificateur te demandera la pièce.' : undefined}>
        <input id="o-value" class="input" value={value} onInput={(e) => setValue((e.currentTarget as HTMLInputElement).value)} />
      </Field>
      <Field label="Message (facultatif)">
        <textarea id="o-msg" class="input" rows={2} value={message} onInput={(e) => setMessage((e.currentTarget as HTMLTextAreaElement).value)} />
      </Field>
      <div class="a-actions">
        <button type="button" class="btn btn-secondary btn-sm" onClick={onDone}>
          Annuler
        </button>
        <button type="button" class="btn btn-primary btn-sm" onClick={send}>
          Envoyer
        </button>
      </div>
    </div>
  );
}

export function OwnerStats() {
  const actor = useActor();
  const restaurants = useData((d) => d.restaurants.filter((r) => actor.restaurantIds?.includes(r.id)));
  const weeks = [3, 2, 1, 0];
  return (
    <div class="a-page">
      <PageHead title="Statistiques" eyebrow="Agrégées par semaine · aucune donnée personnelle" />
      <div class="notice">
        <Icon name="beaker" />
        <span>
          <strong>Exemple :</strong> valeurs de démonstration. Définitions — affichage : carte visible au moins une seconde ; fiche ouverte ; itinéraire : ouverture d’une app de navigation (ne prouve pas la visite) ; appel : toucher du numéro.
        </span>
      </div>
      {restaurants.map((r) => {
        const rows = weeks.map((w) => ({ w, ...demoStats(r.id, w) }));
        const max = Math.max(...rows.map((x) => x.opened));
        return (
          <Section key={r.id} title={r.name} sub={can(actor, 'stats.read', { restaurantId: r.id }) ? 'Quatre dernières semaines' : undefined}>
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr>
                    <th>Semaine</th>
                    <th class="num">Affichages</th>
                    <th class="num">Fiches ouvertes</th>
                    <th>Tendance</th>
                    <th class="num">Itinéraires</th>
                    <th class="num">Appels</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x) => (
                    <tr key={x.w}>
                      <td>{x.w === 0 ? 'Cette semaine' : `Il y a ${x.w} sem.`}</td>
                      <td class="num tnum">{x.impressions.toLocaleString('fr-FR')}</td>
                      <td class="num tnum">{x.opened}</td>
                      <td>
                        <span class="bar-track inline" aria-hidden="true">
                          <span style={{ width: `${(x.opened / max) * 100}%` }} />
                        </span>
                      </td>
                      <td class="num tnum">{x.routes}</td>
                      <td class="num tnum">{x.calls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        );
      })}
    </div>
  );
}
