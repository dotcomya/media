// Modération des contributions. Aucune contribution ne touche une fiche
// publiée : acceptée, elle devient une proposition ; appliquée, elle rejoint
// le brouillon de modifications de la fiche, publié ensuite par un rôle
// autorisé. Ce qui touche au halal ouvre une revérification, jamais un badge.

import { useState } from 'preact/hooks';
import { formatAgo } from '../domain/format';
import {
  acceptContribution,
  CONTRIBUTION_LABELS,
  CONTRIBUTION_STATUS_LABELS,
  CONTRIBUTION_TRANSITIONS,
  isHalalRelated,
  ModerationError,
  moveContribution,
  validateSubmission,
  type Contribution,
  type ContributionStatus,
} from '../domain/moderation';
import { can } from '../domain/rbac';
import { cuisine } from '../domain/taxonomy';
import { Icon } from '../ui/Icon';
import { display, PendingBanner } from './Editor';
import {
  auditEntry,
  commit,
  data,
  getPath,
  go,
  nowIso,
  restaurant,
  toast,
  todayIso,
  ui,
  type AdminRestaurant,
  type ProposalRecord,
} from './model';
import { Empty, PageHead, Pill, ReasonDialog, useActor, useData, useUi } from './ui';

/** Chemins qu'une proposition peut modifier directement (après publication). */
const APPLICABLE = new Set(['contact.phone', 'contact.website', 'contact.instagram', 'operating', 'name', 'description', 'address.street']);

const STATUS_TONE: Record<ContributionStatus, [Parameters<typeof Pill>[0]['tone'], string]> = {
  received: ['info', '◌'],
  in_review: ['warn', '◐'],
  needs_info: ['warn', '?'],
  accepted: ['ok', '●'],
  rejected: ['muted', '✕'],
  duplicate: ['muted', '='],
};

const FILTERS: { id: 'open' | ContributionStatus | 'all'; label: string }[] = [
  { id: 'open', label: 'À traiter' },
  { id: 'accepted', label: 'Acceptées' },
  { id: 'rejected', label: 'Rejetées' },
  { id: 'duplicate', label: 'Doublons' },
  { id: 'all', label: 'Toutes' },
];

function parseAddress(raw: string) {
  const m = raw.match(/^(.*?),?\s*(\d{5})\s+(.*)$/);
  return m ? { street: m[1].trim(), postcode: m[2], city: m[3].trim() } : { street: raw, postcode: '', city: '' };
}

export function Contributions() {
  const contributions = useData((d) => d.contributions);
  const proposals = useData((d) => d.proposals);
  const selectedId = useUi((u) => u.contributionId);
  const actor = useActor();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('open');
  const canModerate = can(actor, 'contribution.moderate');

  const list = contributions
    .filter((c) => (filter === 'all' ? true : filter === 'open' ? ['received', 'in_review', 'needs_info'].includes(c.status) : c.status === filter))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selected = contributions.find((c) => c.id === selectedId);
  const pendingProposals = proposals.filter((p) => p.status === 'pending');

  return (
    <div class="a-page">
      <PageHead title="Contributions" eyebrow="Propositions et signalements des utilisateurs" />
      {!canModerate && (
        <div class="notice">
          <Icon name="lock" />
          <span>Consultation seule pour ton rôle.</span>
        </div>
      )}

      {pendingProposals.length > 0 && (
        <div class="notice info">
          <Icon name="edit" />
          <span>
            {pendingProposals.length} proposition{pendingProposals.length > 1 ? 's' : ''} acceptée{pendingProposals.length > 1 ? 's' : ''} à appliquer au brouillon de la fiche.
          </span>
        </div>
      )}

      <div class="tabs" role="tablist">
        {FILTERS.map((f) => {
          const n = f.id === 'all' ? contributions.length : f.id === 'open' ? contributions.filter((c) => ['received', 'in_review', 'needs_info'].includes(c.status)).length : contributions.filter((c) => c.status === f.id).length;
          return (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} class="tab-btn" onClick={() => setFilter(f.id)}>
              {f.label} <span class="count tnum">{n}</span>
            </button>
          );
        })}
      </div>

      <div class="split">
        <div class="split-list">
          {list.length === 0 ? (
            <Empty title="Rien ici" text="Les contributions envoyées depuis l’application arrivent dans cette file." />
          ) : (
            <ul class="pick-list">
              {list.map((c) => {
                const [tone, glyph] = STATUS_TONE[c.status];
                const target = c.restaurantId ? restaurant(c.restaurantId)?.name : String(c.payload.name ?? 'Nouvelle adresse');
                return (
                  <li key={c.id}>
                    <button type="button" class={`pick${c.id === selectedId ? ' on' : ''}`} onClick={() => ui.set({ contributionId: c.id })}>
                      <span class="grow">
                        <strong>
                          {CONTRIBUTION_LABELS[c.kind]} · {target}
                        </strong>
                        <span class="sub">
                          {formatAgo(c.createdAt.slice(0, 10), todayIso())} · {c.userId ? 'compte' : 'invité'}
                          {isHalalRelated(c) ? ' · halal' : ''}
                        </span>
                      </span>
                      <Pill tone={tone} glyph={glyph}>
                        {CONTRIBUTION_STATUS_LABELS[c.status]}
                      </Pill>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div class="split-detail">{selected ? <Detail c={selected} proposal={proposals.find((p) => p.contributionId === selected.id)} /> : <Empty icon="flag" title="Choisis une contribution" />}</div>
      </div>
    </div>
  );
}

function Detail({ c, proposal }: { c: Contribution; proposal?: ProposalRecord }) {
  const actor = useActor();
  const [ask, setAsk] = useState<ContributionStatus | undefined>();
  const r = c.restaurantId ? restaurant(c.restaurantId) : undefined;
  const spam = validateSubmission(c);
  const canModerate = can(actor, 'contribution.moderate');
  const next = CONTRIBUTION_TRANSITIONS[c.status];

  const save = (updated: Contribution, action: string, reason?: string, extra: Partial<Parameters<typeof commit>[0]> = {}) => {
    commit(
      { contributions: data.get().contributions.map((x) => (x.id === updated.id ? updated : x)), ...extra },
      auditEntry(actor, action, 'contribution', c.id, { reason, before: { statut: c.status }, after: { statut: updated.status } }),
    );
  };

  const move = (to: ContributionStatus, note?: string) => {
    try {
      if (to === 'accepted') {
        const { contribution, proposal: p } = acceptContribution(c, actor, nowIso());
        save(contribution, 'contribution.accepted', note, { proposals: [...data.get().proposals, { ...p, createdAt: nowIso() }] });
        toast('Acceptée : une proposition attend d’être appliquée au brouillon.', 'ok');
      } else {
        const from = c.status === 'received' && to !== 'in_review' && !CONTRIBUTION_TRANSITIONS.received.includes(to) ? moveContribution(c, 'in_review', actor, nowIso()) : c;
        save(moveContribution(from, to, actor, nowIso(), note), `contribution.${to}`, note);
        toast(`Statut : ${CONTRIBUTION_STATUS_LABELS[to]}.`, 'ok');
      }
    } catch (e) {
      if (e instanceof ModerationError) toast(e.message, 'bad');
      else throw e;
    }
    setAsk(undefined);
  };

  const apply = (p: ProposalRecord) => {
    const scope = { restaurantId: p.restaurantId };
    if (!can(actor, p.requires, scope)) return toast(p.requires === 'halal.review' ? 'À appliquer par un vérificateur (session MFA).' : 'Droit insuffisant.', 'bad');
    const d = data.get();
    const proposals = d.proposals.map((x) => (x.id === p.id ? { ...x, status: 'applied' as const } : x));

    if (c.kind === 'new_restaurant') {
      // Nouvelle adresse : un brouillon à compléter et géocoder, jamais publié d'office.
      const addr = parseAddress(String(c.payload.address ?? ''));
      const cuisineId = cuisine(String(c.payload.cuisine ?? ''))?.id;
      const draft: AdminRestaurant = {
        id: `draft-${c.id}`,
        slug: String(c.payload.name ?? 'nouvelle-adresse').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        name: String(c.payload.name ?? 'Nouvelle adresse'),
        description: `Proposée par la communauté. ${c.message ?? ''} À compléter et à géocoder (BAN) avant relecture.`.trim(),
        publication: 'draft',
        operating: 'operating',
        location: { lat: 48.8566, lng: 2.3522 },
        address: { ...addr, district: addr.city, country: 'FR' },
        timezone: 'Europe/Paris',
        cuisines: cuisineId ? [cuisineId] : [],
        occasions: [],
        amenities: [],
        alcohol: 'unknown',
        contact: {},
        media: [],
        halalClaims: [],
        editorialPick: false,
        updatedAt: todayIso(),
        version: 1,
      };
      commit(
        { restaurants: [...d.restaurants, draft], proposals, tasks: c.halalSource ? [...d.tasks, { id: `task-${c.id}`, restaurantId: draft.id, reason: 'report', createdAt: nowIso(), status: 'open' }] : d.tasks },
        auditEntry(actor, 'restaurant.created_from_contribution', 'restaurant', draft.id, { reason: `Contribution ${c.id}`, after: { name: draft.name, publication: 'draft' } }),
      );
      toast('Brouillon créé : à géocoder et compléter avant relecture.', 'ok');
      return;
    }

    if (!r) return;
    if (p.requires === 'halal.review') {
      // Une information halal de la communauté déclenche une revérification, rien d'autre.
      commit(
        { proposals, tasks: [...d.tasks, { id: `task-${c.id}`, restaurantId: r.id, reason: 'report', createdAt: nowIso(), status: 'open' }] },
        auditEntry(actor, 'halal.review_opened', 'halal_claim', r.id, { reason: `Signalement ${c.id} : ${String(c.payload.halal ?? c.halalSource ?? '')}` }),
      );
      toast('Revérification ouverte dans « Vérification halal ».', 'ok');
      return;
    }

    const changes = Object.fromEntries(Object.entries(c.payload).filter(([k]) => APPLICABLE.has(k)));
    if (Object.keys(changes).length === 0) {
      commit({ proposals }, auditEntry(actor, 'proposal.manual', 'contribution', c.id, { reason: 'Information à reprendre à la main dans l’éditeur' }));
      toast('Rien d’automatique : reprends l’information dans l’éditeur.', 'ok');
      go('editor', { editingId: r.id });
      return;
    }
    const current = restaurant(r.id)!;
    const pending = [...(current.pending ?? []), { proposalId: p.id, contributionId: c.id, changes, requires: p.requires, appliedAt: nowIso(), appliedBy: actor.id }];
    commit(
      { proposals, restaurants: d.restaurants.map((x) => (x.id === r.id ? { ...current, pending, version: current.version + 1 } : x)) },
      auditEntry(actor, 'proposal.applied_to_draft', 'restaurant', r.id, { reason: `Contribution ${c.id}`, after: changes }),
    );
    toast('Ajouté au brouillon de modifications de la fiche.', 'ok');
  };

  const payloadRows = Object.entries(c.payload);

  return (
    <div class="claims-panel">
      <header class="cp-head">
        <div>
          <span class="eyebrow">
            {CONTRIBUTION_LABELS[c.kind]} · reçue le {new Date(c.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
          <h2>{r?.name ?? String(c.payload.name ?? 'Nouvelle adresse')}</h2>
        </div>
        {r && (
          <button type="button" class="btn btn-ghost btn-sm" onClick={() => go('editor', { editingId: r.id })}>
            <Icon name="edit" /> Fiche
          </button>
        )}
      </header>

      {spam.length > 0 && (
        <div class="notice bad">
          <Icon name="flag" />
          <span>Contrôle automatique : {spam.join(' ')}</span>
        </div>
      )}
      {c.message && <blockquote class="quote">{c.message}</blockquote>}
      {c.halalSource && (
        <p class="sub">
          Source halal annoncée : <strong>{c.halalSource}</strong>
        </p>
      )}

      {payloadRows.length > 0 && (
        <div class="table-wrap">
          <table class="data compact">
            <thead>
              <tr>
                <th>Champ</th>
                <th>Actuel</th>
                <th>Proposé</th>
              </tr>
            </thead>
            <tbody>
              {payloadRows.map(([path, value]) => (
                <tr key={path}>
                  <td class="muted">
                    {path}
                    {!APPLICABLE.has(path) && <div class="sub">à reprendre à la main</div>}
                  </td>
                  <td>{r ? display(path.split('.')[0], getPath(r, path)) : '—'}</td>
                  <td>
                    <ins>{display(path.split('.')[0], value)}</ins>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ol class="timeline">
        {c.history.map((h, i) => (
          <li key={i}>
            <strong>{CONTRIBUTION_STATUS_LABELS[h.status]}</strong> · {new Date(h.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
            {h.actorId ? ` · ${h.actorId}` : ''}
            {h.note ? ` — ${h.note}` : ''}
          </li>
        ))}
      </ol>

      {canModerate && next.length > 0 && (
        <div class="a-actions wrap">
          {c.status === 'received' && (
            <button type="button" class="btn btn-secondary btn-sm" onClick={() => move('in_review')}>
              Prendre en charge
            </button>
          )}
          {next.includes('needs_info') && (
            <button type="button" class="btn btn-secondary btn-sm" onClick={() => setAsk('needs_info')}>
              Demander des précisions
            </button>
          )}
          {c.status === 'needs_info' && (
            <button type="button" class="btn btn-secondary btn-sm" onClick={() => move('in_review')}>
              Reprendre l’examen
            </button>
          )}
          {(next.includes('accepted') || c.status === 'received') && (
            <button type="button" class="btn btn-primary btn-sm" onClick={() => move('accepted')}>
              Accepter
            </button>
          )}
          {next.includes('duplicate') && (
            <button type="button" class="btn btn-ghost btn-sm" onClick={() => move('duplicate', 'Déjà signalé')}>
              Doublon
            </button>
          )}
          {next.includes('rejected') && (
            <button type="button" class="btn btn-danger-ghost btn-sm" onClick={() => setAsk('rejected')}>
              Rejeter
            </button>
          )}
        </div>
      )}

      {proposal && (
        <div class={`proposal ${proposal.status}`}>
          <strong>Proposition {proposal.status === 'pending' ? 'en attente' : 'appliquée'}</strong>
          <span class="sub">
            {proposal.requires === 'halal.review' ? 'Touche à l’information halal : un vérificateur ouvre une revérification.' : 'S’applique au brouillon de modifications ; la publication reste une décision distincte.'}
          </span>
          {proposal.status === 'pending' && (
            <button type="button" class="btn btn-primary btn-sm" disabled={!can(actor, proposal.requires, { restaurantId: proposal.restaurantId })} onClick={() => apply(proposal)}>
              {c.kind === 'new_restaurant' ? 'Créer le brouillon' : proposal.requires === 'halal.review' ? 'Ouvrir une revérification' : 'Appliquer au brouillon'}
            </button>
          )}
        </div>
      )}

      {r?.pending?.length ? <PendingBanner r={r} /> : null}

      {ask && (
        <ReasonDialog
          title={ask === 'rejected' ? 'Rejeter la contribution' : 'Demander des précisions'}
          label={ask === 'rejected' ? 'Motif (gardé en interne)' : 'Question posée au contributeur'}
          confirm={ask === 'rejected' ? 'Rejeter' : 'Envoyer'}
          danger={ask === 'rejected'}
          onClose={() => setAsk(undefined)}
          onConfirm={(note) => move(ask, note)}
        />
      )}
    </div>
  );
}
