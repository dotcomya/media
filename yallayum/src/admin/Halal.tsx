// Vérification halal : files de travail, preuves datées, décisions motivées.
//
// Le badge public n'est jamais saisi : il se recalcule à partir des preuves.
// Ici, on ajoute, valide, rejette ou révoque des preuves ; le contrôle
// quotidien constate les expirations, les trace et ouvre une revérification.

import { useMemo, useState } from 'preact/hooks';
import { formatDate, formatIn } from '../domain/format';
import { claimValidUntil, deriveHalalStatus, isClaimActive, METHOD_LABELS, SCOPE_LABELS, TRUST_LEVELS } from '../domain/halal';
import { addDays, daysBetween } from '../domain/hours';
import { isDiscoverable } from '../domain/publication';
import { can } from '../domain/rbac';
import type { EvidenceMethod, HalalClaim, HalalClaimKind, HalalScope } from '../domain/types';
import { Icon } from '../ui/Icon';
import { TrustBadge } from '../ui/bits';
import { HALAL_QUEUES } from './metrics';
import {
  auditEntry,
  commit,
  data,
  go,
  nowIso,
  restaurant,
  todayIso,
  toast,
  ui,
  updateRestaurant,
  type AdminRestaurant,
  type ReviewTask,
} from './model';
import { Denied, Empty, Field, PageHead, Pill, ReasonDialog, Section, useActor, useData, useUi } from './ui';
import type { Actor } from '../domain/rbac';

type Queue = 'expired' | 'expiring' | 'unconfirmed' | 'review' | 'all';

const KIND_LABELS: Record<HalalClaimKind, string> = {
  certification: 'Certification d’un organisme',
  team_verification: 'Vérification de l’équipe',
  establishment_declaration: 'Déclaration du restaurant',
};

const STATUS_PILL: Record<HalalClaim['reviewStatus'], [Parameters<typeof Pill>[0]['tone'], string, string]> = {
  pending: ['info', '◐', 'En attente'],
  approved: ['ok', '●', 'Validée'],
  rejected: ['bad', '✕', 'Rejetée'],
  revoked: ['bad', '⊘', 'Révoquée'],
};

function inReview(r: AdminRestaurant, tasks: ReviewTask[]): boolean {
  return r.halalClaims.some((c) => c.reviewStatus === 'pending' || c.underReview) || tasks.some((t) => t.restaurantId === r.id && t.status === 'open');
}

/** Contrôle quotidien : constate les preuves arrivées à échéance. Idempotent. */
export function runDailyCheck(actor: Actor): { created: number; known: number } {
  const d = data.get();
  const today = todayIso();
  const tasks = [...d.tasks];
  const entries = [];
  let known = 0;
  // Une fiche fermée ou retirée n'a pas besoin de revérification.
  for (const r of d.restaurants.filter(isDiscoverable)) {
    for (const c of r.halalClaims) {
      if (c.reviewStatus !== 'approved') continue;
      const until = claimValidUntil(c);
      if (!until) continue;
      let reason: ReviewTask['reason'] | undefined;
      if (until < today) reason = c.kind === 'certification' ? 'certification_expired' : 'evidence_expired';
      else if (daysBetween(today, until) <= 60) reason = 'expiring_soon';
      if (!reason) continue;
      if (tasks.some((t) => t.claimId === c.id && t.reason === reason)) {
        known++;
        continue;
      }
      tasks.push({ id: `task-${c.id}-${reason}`, restaurantId: r.id, claimId: c.id, reason, createdAt: nowIso(), status: 'open' });
      if (reason !== 'expiring_soon') {
        const before = deriveHalalStatus(r.halalClaims, until, d.certifiers).level;
        const after = deriveHalalStatus(r.halalClaims, today, d.certifiers).level;
        entries.push(
          auditEntry(actor, 'halal.expired', 'halal_claim', c.id, {
            reason: `${KIND_LABELS[c.kind]} échue le ${formatDate(until)} (${r.name})`,
            before: { niveau: TRUST_LEVELS[before].label },
            after: { niveau: TRUST_LEVELS[after].label },
          }),
        );
      }
    }
  }
  const created = tasks.length - d.tasks.length;
  entries.push(auditEntry(actor, 'halal.daily_check', 'halal_claim', '*', { reason: `${created} nouvelle(s) tâche(s), ${known} déjà connue(s)` }));
  commit({ tasks, lastDailyCheck: nowIso() }, entries);
  return { created, known };
}

const TASK_LABELS: Record<ReviewTask['reason'], string> = {
  certification_expired: 'Certificat échu',
  evidence_expired: 'Preuve échue',
  expiring_soon: 'Échéance proche',
  no_evidence: 'Sans preuve',
  report: 'Signalement',
};

export function Halal() {
  const restaurants = useData((d) => d.restaurants);
  const tasks = useData((d) => d.tasks);
  const selectedId = useUi((u) => u.halalId);
  const actor = useActor();
  const [queue, setQueue] = useState<Queue>(selectedId ? 'all' : 'expired');
  const today = todayIso();
  const canReview = can(actor, 'halal.review');

  const queues: Record<Queue, { label: string; list: AdminRestaurant[] }> = useMemo(() => {
    const published = restaurants.filter((r) => r.publication === 'published');
    return {
      expired: { label: 'Expirées', list: published.filter((r) => HALAL_QUEUES.expired.test(r, today)) },
      expiring: { label: 'Échéance < 60 j', list: published.filter((r) => HALAL_QUEUES.expiring.test(r, today)) },
      unconfirmed: { label: 'Sans preuve', list: published.filter((r) => HALAL_QUEUES.unconfirmed.test(r, today)) },
      review: { label: 'En vérification', list: restaurants.filter((r) => inReview(r, tasks)) },
      all: { label: 'Toutes', list: restaurants },
    };
  }, [restaurants, tasks]);

  const selected = selectedId ? restaurants.find((r) => r.id === selectedId) : undefined;
  const openTasks = tasks.filter((t) => t.status === 'open');

  return (
    <div class="a-page">
      <PageHead title="Vérification halal" eyebrow="Preuves, échéances, décisions">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          disabled={!canReview}
          title={canReview ? undefined : 'Réservé aux vérificateurs, en session MFA'}
          onClick={() => {
            if (!can(actor, 'halal.review')) return toast('Réservé aux vérificateurs en session MFA.', 'bad');
            const { created, known } = runDailyCheck(actor);
            toast(created ? `${created} nouvelle(s) tâche(s) de revérification ouverte(s).` : `Aucune nouvelle échéance (${known} déjà connue(s)).`, 'ok');
          }}
        >
          <Icon name="refresh" /> Lancer le contrôle quotidien
        </button>
      </PageHead>

      {!canReview && <Denied what="Consultation seule : valider ou rejeter une preuve exige le rôle Vérificateur (ou Super admin) en session MFA." />}

      <div class="tabs" role="tablist">
        {(Object.keys(queues) as Queue[]).map((q) => (
          <button key={q} type="button" role="tab" aria-selected={queue === q} class="tab-btn" onClick={() => setQueue(q)}>
            {queues[q].label} <span class="count tnum">{queues[q].list.length}</span>
          </button>
        ))}
      </div>

      <div class="split">
        <div class="split-list">
          {queues[queue].list.length === 0 ? (
            <Empty title="File vide" text="Rien à traiter ici." />
          ) : (
            <ul class="pick-list">
              {queues[queue].list.map((r) => {
                const s = deriveHalalStatus(r.halalClaims, today, data.get().certifiers);
                return (
                  <li key={r.id}>
                    <button type="button" class={`pick${r.id === selectedId ? ' on' : ''}`} onClick={() => ui.set({ halalId: r.id })}>
                      <span class="grow">
                        <strong>{r.name}</strong>
                        <span class="sub">
                          {s.validUntil ? `Valable ${formatIn(s.validUntil, today)}` : s.expiredCertification ? `Certificat échu le ${formatDate(s.expiredCertification.validUntil!)}` : 'Aucune preuve en cours'}
                        </span>
                      </span>
                      <TrustBadge status={s} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {openTasks.length > 0 && (
            <Section title={`Tâches ouvertes · ${openTasks.length}`}>
              <ul class="pick-list">
                {openTasks.slice(0, 12).map((t) => (
                  <li key={t.id}>
                    <div class="pick static">
                      <span class="grow">
                        <strong>{restaurant(t.restaurantId)?.name}</strong>
                        <span class="sub">{TASK_LABELS[t.reason]}</span>
                      </span>
                      <button type="button" class="btn btn-ghost btn-sm" onClick={() => ui.set({ halalId: t.restaurantId })}>
                        Ouvrir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {openTasks.length > 12 && <p class="sub">+ {openTasks.length - 12} autres.</p>}
            </Section>
          )}
        </div>
        <div class="split-detail">{selected ? <ClaimsPanel r={selected} /> : <Empty icon="shield" title="Choisis une fiche" text="Son historique de preuves et les décisions possibles s’affichent ici." />}</div>
      </div>
    </div>
  );
}

function ClaimsPanel({ r }: { r: AdminRestaurant }) {
  const actor = useActor();
  const evidence = useData((d) => d.evidence.filter((e) => e.restaurantId === r.id));
  const certifiers = useData((d) => d.certifiers);
  const tasks = useData((d) => d.tasks.filter((t) => t.restaurantId === r.id && t.status === 'open'));
  const [decision, setDecision] = useState<{ claim: HalalClaim; to: 'approved' | 'rejected' | 'revoked' | 'review' } | undefined>();
  const [adding, setAdding] = useState(false);
  const today = todayIso();
  const status = deriveHalalStatus(r.halalClaims, today, certifiers);
  const canReview = can(actor, 'halal.review');
  const canSeeDocs = can(actor, 'halal.evidence.read');

  const decide = (claim: HalalClaim, to: 'approved' | 'rejected' | 'revoked' | 'review', reason: string) => {
    if (!can(actor, 'halal.review')) return toast('Droit insuffisant.', 'bad');
    const current = restaurant(r.id)!;
    const beforeLevel = deriveHalalStatus(current.halalClaims, today, certifiers).level;
    const claims = current.halalClaims.map((c) =>
      c.id !== claim.id ? c : to === 'review' ? { ...c, underReview: !c.underReview } : { ...c, reviewStatus: to, reviewedAt: today, underReview: false },
    );
    const afterLevel = deriveHalalStatus(claims, today, certifiers).level;
    updateRestaurant(
      { ...current, halalClaims: claims, version: current.version + 1, updatedAt: today },
      auditEntry(actor, to === 'review' ? 'halal.under_review' : `halal.${to}`, 'halal_claim', claim.id, {
        reason,
        before: { statut: claim.reviewStatus, niveau: TRUST_LEVELS[beforeLevel].label },
        after: { statut: to === 'review' ? (claim.underReview ? 'vérification close' : 'en vérification') : to, niveau: TRUST_LEVELS[afterLevel].label },
      }),
    );
    // Une décision sur la preuve concernée clôt ses tâches ouvertes.
    if (to !== 'review') commit({ tasks: data.get().tasks.map((t) => (t.claimId === claim.id && t.status === 'open' ? { ...t, status: 'done' } : t)) }, []);
    setDecision(undefined);
    toast(`Décision enregistrée. Badge : ${TRUST_LEVELS[afterLevel].label}.`, 'ok');
  };

  return (
    <div class="claims-panel">
      <header class="cp-head">
        <div>
          <span class="eyebrow">{r.address.neighbourhood ?? r.address.district}</span>
          <h2>{r.name}</h2>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" onClick={() => go('editor', { editingId: r.id })}>
          <Icon name="edit" /> Fiche
        </button>
      </header>
      <div class="cp-status">
        <TrustBadge status={status} large />
        <span class="sub">
          {status.claim ? `${KIND_LABELS[status.claim.kind]} · ${SCOPE_LABELS[status.claim.scope]}` : 'Aucune preuve en cours de validité'}
          {status.validUntil ? ` · jusqu’au ${formatDate(status.validUntil)}` : ''}
        </span>
      </div>
      {status.expiredCertification && status.level !== 'certified' && (
        <div class="notice bad">
          <Icon name="info" />
          <span>Certificat échu le {formatDate(status.expiredCertification.validUntil!)} : le badge « Certifié » a été retiré automatiquement ce jour-là.</span>
        </div>
      )}
      {tasks.length > 0 && (
        <div class="notice">
          <Icon name="clock" />
          <span>{tasks.map((t) => TASK_LABELS[t.reason]).join(' · ')} — tâche ouverte par le contrôle quotidien.</span>
        </div>
      )}

      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Nature</th>
              <th>Périmètre</th>
              <th>Source</th>
              <th>Preuve du</th>
              <th>Fin</th>
              <th>Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {r.halalClaims.length === 0 && (
              <tr>
                <td colSpan={7} class="muted">
                  Aucune preuve : la fiche affiche « Info halal à confirmer ».
                </td>
              </tr>
            )}
            {[...r.halalClaims]
              .sort((a, b) => b.evidenceDate.localeCompare(a.evidenceDate))
              .map((c) => {
                const until = claimValidUntil(c);
                const active = isClaimActive(c, today);
                const [tone, glyph, label] = STATUS_PILL[c.reviewStatus];
                const docs = evidence.filter((e) => e.claimId === c.id);
                return (
                  <tr key={c.id}>
                    <td>
                      {KIND_LABELS[c.kind]}
                      {c.certifierId && <div class="sub">{certifiers.find((x) => x.id === c.certifierId)?.name} {c.certificateRef ? `· n° ${c.certificateRef}` : ''}</div>}
                      {canSeeDocs && docs.map((d) => (
                        <div key={d.sha256} class="sub mono" title={`SHA-256 ${d.sha256}`}>
                          <Icon name="lock" size={12} /> {d.fileName} · {d.sha256.slice(0, 12)}…
                        </div>
                      ))}
                    </td>
                    <td>
                      {SCOPE_LABELS[c.scope]}
                      {c.scopeNote && <div class="sub">{c.scopeNote}</div>}
                    </td>
                    <td>{METHOD_LABELS[c.method]}</td>
                    <td class="tnum">{formatDate(c.evidenceDate)}</td>
                    <td class="tnum">{until ? formatDate(until) : '—'}</td>
                    <td>
                      <Pill tone={tone} glyph={glyph}>
                        {label}
                      </Pill>
                      {c.reviewStatus === 'approved' && (
                        <div class="sub">{active ? 'En cours' : until && until < today ? 'Échue' : 'Pas encore active'}</div>
                      )}
                      {c.underReview && <div class="sub">En vérification</div>}
                    </td>
                    <td class="actions-cell">
                      {canReview && c.reviewStatus === 'pending' && (
                        <>
                          <button type="button" class="btn btn-primary btn-sm" onClick={() => setDecision({ claim: c, to: 'approved' })}>
                            Valider
                          </button>
                          <button type="button" class="btn btn-danger-ghost btn-sm" onClick={() => setDecision({ claim: c, to: 'rejected' })}>
                            Rejeter
                          </button>
                        </>
                      )}
                      {canReview && c.reviewStatus === 'approved' && (
                        <>
                          <button type="button" class="btn btn-ghost btn-sm" onClick={() => setDecision({ claim: c, to: 'review' })}>
                            {c.underReview ? 'Clore la vérif.' : 'Mettre en vérif.'}
                          </button>
                          <button type="button" class="btn btn-danger-ghost btn-sm" onClick={() => setDecision({ claim: c, to: 'revoked' })}>
                            Révoquer
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {canReview ? (
        adding ? (
          <AddEvidence r={r} onDone={() => setAdding(false)} />
        ) : (
          <button type="button" class="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Ajouter une preuve
          </button>
        )
      ) : null}

      {decision && (
        <ReasonDialog
          title={
            decision.to === 'approved'
              ? 'Valider la preuve'
              : decision.to === 'rejected'
                ? 'Rejeter la preuve'
                : decision.to === 'revoked'
                  ? 'Révoquer la preuve'
                  : decision.claim.underReview
                    ? 'Clore la vérification'
                    : 'Mettre en vérification'
          }
          confirm="Confirmer"
          danger={decision.to === 'rejected' || decision.to === 'revoked'}
          label={decision.to === 'approved' ? 'Ce qui a été contrôlé' : 'Motif'}
          onClose={() => setDecision(undefined)}
          onConfirm={(reason) => decide(decision.claim, decision.to, reason)}
        >
          <p class="sub">
            {decision.to === 'approved' && 'La preuve comptera dès aujourd’hui dans le niveau affiché.'}
            {decision.to === 'revoked' && 'La preuve cesse immédiatement de compter ; le badge est recalculé.'}
            {decision.to === 'review' && !decision.claim.underReview && 'La fiche affiche « Vérification en cours », sans accusation ni détail public.'}
          </p>
        </ReasonDialog>
      )}
    </div>
  );
}

async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function AddEvidence({ r, onDone }: { r: AdminRestaurant; onDone: () => void }) {
  const actor = useActor();
  const certifiers = useData((d) => d.certifiers);
  const today = todayIso();
  const [kind, setKind] = useState<HalalClaimKind>('team_verification');
  const [scope, setScope] = useState<HalalScope>('whole_menu');
  const [scopeNote, setScopeNote] = useState('');
  const [method, setMethod] = useState<EvidenceMethod>('supplier_documents');
  const [certifierId, setCertifierId] = useState(certifiers[0]?.id ?? '');
  const [ref, setRef] = useState('');
  const [evidenceDate, setEvidenceDate] = useState(today);
  const [validUntil, setValidUntil] = useState(addDays(today, 365));
  const [approve, setApprove] = useState(true);
  const [doc, setDoc] = useState<{ name: string; sha: string; size: number } | undefined>();
  const [hashing, setHashing] = useState(false);

  const errors: string[] = [];
  if (evidenceDate > today) errors.push('La date de preuve ne peut pas être dans le futur.');
  if (kind === 'certification') {
    if (!certifierId) errors.push('Choisis l’organisme.');
    if (!validUntil) errors.push('Une certification exige une date de fin.');
    else if (validUntil <= evidenceDate) errors.push('La date de fin doit suivre la date de preuve.');
  }
  if (approve && !doc && method !== 'on_site_visit' && method !== 'phone') errors.push('Joins la pièce contrôlée pour valider (sinon, enregistre en attente).');

  const submit = () => {
    if (!can(actor, 'halal.review')) return toast('Droit insuffisant.', 'bad');
    if (errors.length) return;
    const current = restaurant(r.id)!;
    const claim: HalalClaim = {
      id: `hc-${Date.now().toString(36)}`,
      kind,
      scope,
      scopeNote: scopeNote || undefined,
      certifierId: kind === 'certification' ? certifierId : undefined,
      certificateRef: kind === 'certification' && ref ? ref : undefined,
      method: kind === 'certification' ? 'certificate_check' : method,
      evidenceDate,
      validUntil: kind === 'certification' ? validUntil : undefined,
      reviewStatus: approve ? 'approved' : 'pending',
      reviewedAt: approve ? today : undefined,
    };
    const claims = [...current.halalClaims, claim];
    const before = deriveHalalStatus(current.halalClaims, today, certifiers).level;
    const after = deriveHalalStatus(claims, today, certifiers).level;
    updateRestaurant(
      { ...current, halalClaims: claims, version: current.version + 1, updatedAt: today },
      auditEntry(actor, approve ? 'halal.claim_added_approved' : 'halal.claim_added', 'halal_claim', claim.id, {
        reason: `${KIND_LABELS[kind]} pour ${current.name}`,
        before: { niveau: TRUST_LEVELS[before].label },
        after: { niveau: TRUST_LEVELS[after].label, piece: doc ? `${doc.name} (sha256 ${doc.sha.slice(0, 16)}…)` : 'aucune' },
      }),
    );
    if (doc) {
      commit(
        { evidence: [...data.get().evidence, { claimId: claim.id, restaurantId: r.id, fileName: doc.name, sha256: doc.sha, size: doc.size, uploadedAt: nowIso(), uploadedBy: actor.id }] },
        [],
      );
    }
    toast(`Preuve enregistrée. Badge : ${TRUST_LEVELS[after].label}.`, 'ok');
    onDone();
  };

  return (
    <div class="add-evidence">
      <h3>Nouvelle preuve</h3>
      <div class="cols-2">
        <Field label="Nature">
          <select id="ev-kind" class="input" value={kind} onChange={(e) => setKind((e.currentTarget as HTMLSelectElement).value as HalalClaimKind)}>
            {(Object.keys(KIND_LABELS) as HalalClaimKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Périmètre">
          <select id="ev-scope" class="input" value={scope} onChange={(e) => setScope((e.currentTarget as HTMLSelectElement).value as HalalScope)}>
            {(Object.keys(SCOPE_LABELS) as HalalScope[]).map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        {kind === 'certification' ? (
          <>
            <Field label="Organisme">
              <select id="ev-cert" class="input" value={certifierId} onChange={(e) => setCertifierId((e.currentTarget as HTMLSelectElement).value)}>
                {certifiers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="N° de certificat">
              <input id="ev-ref" class="input" value={ref} onInput={(e) => setRef((e.currentTarget as HTMLInputElement).value)} />
            </Field>
          </>
        ) : (
          <Field label="Méthode">
            <select id="ev-method" class="input" value={method} onChange={(e) => setMethod((e.currentTarget as HTMLSelectElement).value as EvidenceMethod)}>
              {(['supplier_documents', 'on_site_visit', 'phone', 'email'] as EvidenceMethod[]).map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Précision publique du périmètre" help="Ex. « Toutes les viandes ; poisson à la carte »">
          <input id="ev-note" class="input" value={scopeNote} onInput={(e) => setScopeNote((e.currentTarget as HTMLInputElement).value)} />
        </Field>
        <Field label="Date de la preuve">
          <input id="ev-date" class="input" type="date" value={evidenceDate} max={today} onInput={(e) => setEvidenceDate((e.currentTarget as HTMLInputElement).value)} />
        </Field>
        {kind === 'certification' ? (
          <Field label="Fin de validité du certificat">
            <input id="ev-until" class="input" type="date" value={validUntil} onInput={(e) => setValidUntil((e.currentTarget as HTMLInputElement).value)} />
          </Field>
        ) : (
          <p class="sub">Valable 12 mois à partir de la date de preuve (paramètre).</p>
        )}
      </div>
      <Field label="Pièce justificative" help="Stockée en privé : seuls le nom et l’empreinte SHA-256 apparaissent ici. Jamais publiée.">
        <input
          id="ev-file"
          type="file"
          class="input"
          onChange={async (e) => {
            const f = (e.currentTarget as HTMLInputElement).files?.[0];
            if (!f) return setDoc(undefined);
            setHashing(true);
            try {
              setDoc({ name: f.name, sha: await sha256(f), size: f.size });
            } finally {
              setHashing(false);
            }
          }}
        />
      </Field>
      {hashing && <p class="sub">Calcul de l’empreinte…</p>}
      {doc && (
        <p class="sub mono">
          <Icon name="lock" size={12} /> {doc.name} · {doc.size < 1024 ? `${doc.size} o` : `${Math.round(doc.size / 1024)} Ko`} · SHA-256 {doc.sha.slice(0, 24)}… · stockée en privé
        </p>
      )}
      <label class="check">
        <input type="checkbox" checked={approve} onChange={(e) => setApprove((e.currentTarget as HTMLInputElement).checked)} /> J’ai contrôlé cette preuve : la valider maintenant
      </label>
      {errors.length > 0 && (
        <ul class="checks" role="alert">
          {errors.map((e) => (
            <li key={e} class="bad">
              ✕ {e}
            </li>
          ))}
        </ul>
      )}
      <div class="a-actions">
        <button type="button" class="btn btn-secondary btn-sm" onClick={onDone}>
          Annuler
        </button>
        <button type="button" class="btn btn-primary btn-sm" disabled={errors.length > 0 || hashing} onClick={submit}>
          {approve ? 'Enregistrer et valider' : 'Enregistrer en attente'}
        </button>
      </div>
    </div>
  );
}
