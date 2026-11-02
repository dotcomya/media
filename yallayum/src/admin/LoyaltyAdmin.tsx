// Fidélité : paramètres du programme (provisoires), partenaires,
// transactions, alertes de fraude, annulations motivées.

import { useMemo, useState } from 'preact/hooks';
import { balance, isReversed, reverse, type EarnRule, type LoyaltyProgram, type LoyaltyTx, type ProgramStatus } from '../domain/loyalty';
import { can, visibleTo } from '../domain/rbac';
import { Icon } from '../ui/Icon';
import { auditEntry, commit, data, partnerName, toast, type ScanAttempt } from './model';
import { Denied, Field, PageHead, Pill, ReasonDialog, Section, fmtDateTime, useActor, useData } from './ui';

const STATUS_LABELS: Record<ProgramStatus, string> = { disabled: 'Désactivé', pilot: 'Pilote', live: 'En service' };
const OUTCOME_LABELS: Record<ScanAttempt['outcome'], string> = {
  credited: 'Crédité',
  duplicate: 'Jeton déjà utilisé',
  cooldown: 'Refus : délai entre deux passages',
  expired_token: 'Refus : QR expiré',
  invalid_token: 'Refus : QR invalide',
  daily_cap: 'Refus : plafond du jour',
};

const mask = (cardId: string) => `${cardId.slice(0, 6)}••${cardId.slice(-2)}`;

interface Alert {
  id: string;
  kind: 'burst' | 'cooldown' | 'replay';
  cardId: string;
  partnerIds: string[];
  attempts: ScanAttempt[];
  text: string;
}

/** Alertes : rafales (≥ 4 tentatives en 15 min), refus répétés, jeton rejoué ailleurs. */
export function fraudAlerts(attempts: ScanAttempt[]): Alert[] {
  const byCard = new Map<string, ScanAttempt[]>();
  for (const a of attempts) byCard.set(a.cardId, [...(byCard.get(a.cardId) ?? []), a]);
  const alerts: Alert[] = [];
  for (const [cardId, list] of byCard) {
    const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at));
    for (let i = 0; i < sorted.length; i++) {
      const window = sorted.filter((x) => Date.parse(x.at) >= Date.parse(sorted[i].at) && Date.parse(x.at) - Date.parse(sorted[i].at) <= 15 * 60_000);
      if (window.length >= 4) {
        alerts.push({ id: `burst-${cardId}`, kind: 'burst', cardId, partnerIds: [...new Set(window.map((w) => w.partnerId))], attempts: window, text: `${window.length} présentations en moins de 15 minutes` });
        break;
      }
    }
    const cooldown = sorted.filter((x) => x.outcome === 'cooldown');
    if (cooldown.length >= 2) alerts.push({ id: `cool-${cardId}`, kind: 'cooldown', cardId, partnerIds: [...new Set(cooldown.map((w) => w.partnerId))], attempts: cooldown, text: `${cooldown.length} refus pour délai trop court` });
    const replays = sorted.filter((x) => x.outcome === 'duplicate' || x.outcome === 'invalid_token');
    if (replays.length) alerts.push({ id: `replay-${cardId}`, kind: 'replay', cardId, partnerIds: [...new Set(replays.map((w) => w.partnerId))], attempts: replays, text: `${replays.length} jeton(s) rejoué(s) ou falsifié(s)` });
  }
  return alerts;
}

export function LoyaltyAdmin() {
  const actor = useActor();
  const ledger = useData((d) => d.ledger);
  const attempts = useData((d) => d.attempts);
  const partners = useData((d) => d.partners);
  const [reversing, setReversing] = useState<LoyaltyTx | undefined>();

  const canRead = actor.role === 'restaurateur' ? !!actor.partnerIds?.length : can(actor, 'loyalty.read');
  const canAdjust = can(actor, 'loyalty.adjust');
  const visibleTx = visibleTo(actor, ledger, 'loyalty.read').sort((a, b) => b.at.localeCompare(a.at));
  const visibleAttempts = visibleTo(actor, attempts, 'loyalty.read');
  const alerts = useMemo(() => fraudAlerts(visibleAttempts), [attempts, actor.role, actor.mfa]);
  const visiblePartners = partners.filter((p) => actor.role !== 'restaurateur' || actor.partnerIds?.includes(p.id));

  const doReverse = (tx: LoyaltyTx, reason: string) => {
    if (!can(actor, 'loyalty.adjust', { partnerId: tx.partnerId })) return toast('Annulation réservée au rôle autorisé, en session MFA.', 'bad');
    const before = data.get().ledger;
    const after = reverse(before, tx.id, reason, new Date());
    if (after.length === before.length) {
      toast('Déjà annulée : une transaction ne s’annule qu’une fois.', 'bad');
    } else {
      commit({ ledger: after }, auditEntry(actor, 'loyalty.reversal', 'loyalty_transaction', tx.id, { reason, before: { points: tx.points, solde: balance(before, tx.cardId) }, after: { solde: balance(after, tx.cardId) } }));
      toast('Transaction annulée, solde recalculé.', 'ok');
    }
    setReversing(undefined);
  };

  if (!canRead) {
    return (
      <div class="a-page">
        <PageHead title="Fidélité" />
        <Denied what="Les transactions de fidélité sont réservées au support, aux super admins et aux restaurateurs partenaires (pour leurs propres passages)." />
      </div>
    );
  }

  return (
    <div class="a-page">
      <PageHead title="Fidélité" eyebrow={actor.role === 'restaurateur' ? 'Tes passages en caisse' : 'Programme, partenaires, transactions'} />

      {actor.role !== 'restaurateur' && <ProgramForm canEdit={canAdjust} />}

      <div class="a-grid-2">
        <Section title={`Partenaires · ${visiblePartners.length}`} sub="Être partenaire est un accord commercial : sans effet sur le classement ni sur l’information halal.">
          <ul class="pick-list">
            {visiblePartners.map((p) => (
              <li key={p.id}>
                <div class="pick static">
                  <span class="grow">
                    <strong>{p.name}</strong>
                    <span class="sub tnum">{ledger.filter((t) => t.partnerId === p.id && t.kind === 'earn').length} crédits</span>
                  </span>
                  <Pill tone={p.active ? 'ok' : 'muted'} glyph={p.active ? '●' : '‖'}>
                    {p.active ? 'Actif' : 'Suspendu'}
                  </Pill>
                  {canAdjust && (
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      onClick={() =>
                        commit(
                          { partners: data.get().partners.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)) },
                          auditEntry(actor, p.active ? 'loyalty.partner_suspended' : 'loyalty.partner_activated', 'loyalty_transaction', p.id),
                        )
                      }
                    >
                      {p.active ? 'Suspendre' : 'Réactiver'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={`Alertes · ${alerts.length}`} sub="Signaux à examiner, jamais une sanction automatique.">
          {alerts.length === 0 ? (
            <p class="sub">Aucun motif suspect.</p>
          ) : (
            <ul class="alerts">
              {alerts.map((a) => (
                <li key={a.id} class={`alert alert-${a.kind}`}>
                  <span class="glyph" aria-hidden="true">
                    {a.kind === 'burst' ? '⚡' : a.kind === 'replay' ? '↺' : '⏱'}
                  </span>
                  <span class="grow">
                    <strong>
                      Carte {mask(a.cardId)} · {a.text}
                    </strong>
                    <span class="sub">
                      {a.partnerIds.map(partnerName).join(', ')} · {fmtDateTime(a.attempts[0].at)} → {fmtDateTime(a.attempts[a.attempts.length - 1].at)}
                    </span>
                    <span class="sub">{a.attempts.map((x) => OUTCOME_LABELS[x.outcome]).join(' · ')}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title={`Transactions · ${visibleTx.length}`} sub="Grand livre en ajout seul : une annulation est une nouvelle ligne, jamais une suppression.">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Partenaire</th>
                <th>Carte</th>
                <th>Type</th>
                <th class="num">Points</th>
                <th>Clé d’idempotence</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleTx.slice(0, 60).map((t) => {
                const reversed = isReversed(ledger, t.id);
                return (
                  <tr key={t.id} class={reversed ? 'struck' : undefined}>
                    <td class="tnum">{fmtDateTime(t.at)}</td>
                    <td>{t.partnerId === 'yallayum' ? 'YallaYum' : partnerName(t.partnerId)}</td>
                    <td class="mono">{mask(t.cardId)}</td>
                    <td>
                      {t.kind === 'earn' ? 'Crédit' : t.kind === 'redeem' ? 'Échange' : t.kind === 'reversal' ? 'Annulation' : 'Ajustement'}
                      {reversed && <div class="sub">annulée</div>}
                      {t.reason && <div class="sub">{t.reason}</div>}
                    </td>
                    <td class={`num tnum ${t.points < 0 ? 'neg' : 'pos'}`}>
                      {t.points > 0 ? '+' : ''}
                      {t.points}
                    </td>
                    <td class="mono muted" title={t.idempotencyKey}>
                      {t.idempotencyKey.slice(0, 26)}…
                    </td>
                    <td>
                      {canAdjust && t.kind === 'earn' && !reversed && (
                        <button type="button" class="btn btn-danger-ghost btn-sm" onClick={() => setReversing(t)}>
                          Annuler
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visibleTx.length > 60 && <p class="sub">60 dernières lignes affichées.</p>}
      </Section>

      {reversing && (
        <ReasonDialog
          title={`Annuler ${reversing.points} points (${partnerName(reversing.partnerId)})`}
          confirm="Annuler la transaction"
          danger
          onClose={() => setReversing(undefined)}
          onConfirm={(reason) => doReverse(reversing, reason)}
        >
          <p class="sub">Une ligne d’annulation est ajoutée au grand livre ; la transaction d’origine reste visible.</p>
        </ReasonDialog>
      )}
    </div>
  );
}

function ProgramForm({ canEdit }: { canEdit: boolean }) {
  const actor = useActor();
  const program = useData((d) => d.program);
  const [p, setP] = useState<LoyaltyProgram>(structuredClone(program));
  const dirty = JSON.stringify(p) !== JSON.stringify(program);
  const setEarn = (earn: EarnRule) => setP({ ...p, earn });

  const save = () => {
    if (!can(actor, 'loyalty.adjust')) return toast('Droit insuffisant.', 'bad');
    commit({ program: p }, auditEntry(actor, 'loyalty.program_updated', 'loyalty_transaction', 'programme', { before: program, after: p }));
    toast('Paramètres enregistrés (toujours provisoires).', 'ok');
  };

  return (
    <Section
      title="Programme"
      sub="Aucune règle n’est acquise : taux, seuils, financement et durées se décident avec le fondateur et les partenaires."
      actions={
        canEdit ? (
          <button type="button" class="btn btn-primary btn-sm" disabled={!dirty} onClick={save}>
            Enregistrer
          </button>
        ) : undefined
      }
    >
      {p.provisional && (
        <div class="notice">
          <Icon name="beaker" />
          <span>Paramètres provisoires de démonstration, affichés comme tels dans l’app.</span>
        </div>
      )}
      <fieldset class="editor-form" disabled={!canEdit}>
        <div class="cols-4">
          <Field label="Statut">
            <select id="lp-status" class="input" value={p.status} onChange={(e) => setP({ ...p, status: (e.currentTarget as HTMLSelectElement).value as ProgramStatus })}>
              {(Object.keys(STATUS_LABELS) as ProgramStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Règle de gain">
            <select
              id="lp-mode"
              class="input"
              value={p.earn.mode}
              onChange={(e) => setEarn((e.currentTarget as HTMLSelectElement).value === 'per_visit' ? { mode: 'per_visit', points: 10 } : { mode: 'per_amount', pointsPerEuro: 1, minAmountCents: 500 })}
            >
              <option value="per_visit">Par passage</option>
              <option value="per_amount">Selon le montant</option>
            </select>
          </Field>
          {p.earn.mode === 'per_visit' ? (
            <Field label="Points par passage">
              <input id="lp-pts" class="input tnum" type="number" min={1} value={p.earn.points} onInput={(e) => setEarn({ mode: 'per_visit', points: Number((e.currentTarget as HTMLInputElement).value) })} />
            </Field>
          ) : (
            <>
              <Field label="Points par euro">
                <input id="lp-ppe" class="input tnum" type="number" min={0} step="0.1" value={p.earn.pointsPerEuro} onInput={(e) => p.earn.mode === 'per_amount' && setEarn({ ...p.earn, pointsPerEuro: Number((e.currentTarget as HTMLInputElement).value) })} />
              </Field>
              <Field label="Montant minimum (€)">
                <input id="lp-min" class="input tnum" type="number" min={0} value={p.earn.minAmountCents / 100} onInput={(e) => p.earn.mode === 'per_amount' && setEarn({ ...p.earn, minAmountCents: Math.round(Number((e.currentTarget as HTMLInputElement).value) * 100) })} />
              </Field>
            </>
          )}
          <Field label="Délai entre deux crédits (min)">
            <input id="lp-cool" class="input tnum" type="number" min={0} value={p.cooldownMinutes} onInput={(e) => setP({ ...p, cooldownMinutes: Number((e.currentTarget as HTMLInputElement).value) })} />
          </Field>
          <Field label="Plafond par jour et partenaire">
            <input id="lp-cap" class="input tnum" type="number" min={1} value={p.dailyCapPerPartner} onInput={(e) => setP({ ...p, dailyCapPerPartner: Number((e.currentTarget as HTMLInputElement).value) })} />
          </Field>
          <Field label="Durée de vie du QR (s)">
            <input id="lp-step" class="input tnum" type="number" min={10} value={p.qrStepSeconds} onInput={(e) => setP({ ...p, qrStepSeconds: Number((e.currentTarget as HTMLInputElement).value) })} />
          </Field>
        </div>
        <div class="table-wrap">
          <table class="data compact">
            <thead>
              <tr>
                <th>Récompense</th>
                <th class="num">Seuil</th>
                <th>Financée par</th>
                <th class="num">Validité (j)</th>
              </tr>
            </thead>
            <tbody>
              {p.rewards.map((rw, i) => (
                <tr key={rw.id}>
                  <td>
                    <input class="input slim" aria-label="Libellé" value={rw.label} onInput={(e) => setP({ ...p, rewards: p.rewards.map((x, j) => (j === i ? { ...x, label: (e.currentTarget as HTMLInputElement).value } : x)) })} />
                  </td>
                  <td class="num">
                    <input class="input slim tnum" type="number" aria-label="Seuil" value={rw.threshold} onInput={(e) => setP({ ...p, rewards: p.rewards.map((x, j) => (j === i ? { ...x, threshold: Number((e.currentTarget as HTMLInputElement).value) } : x)) })} />
                  </td>
                  <td>
                    <select class="input slim" aria-label="Financement" value={rw.fundedBy} onChange={(e) => setP({ ...p, rewards: p.rewards.map((x, j) => (j === i ? { ...x, fundedBy: (e.currentTarget as HTMLSelectElement).value as typeof rw.fundedBy } : x)) })}>
                      <option value="partner">Le restaurant</option>
                      <option value="yallayum">YallaYum</option>
                      <option value="shared">Partagé</option>
                    </select>
                  </td>
                  <td class="num">
                    <input class="input slim tnum" type="number" aria-label="Validité" value={rw.validityDays} onInput={(e) => setP({ ...p, rewards: p.rewards.map((x, j) => (j === i ? { ...x, validityDays: Number((e.currentTarget as HTMLInputElement).value) } : x)) })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label class="check">
          <input type="checkbox" checked={p.provisional} onChange={(e) => setP({ ...p, provisional: (e.currentTarget as HTMLInputElement).checked })} /> Paramètres provisoires (signalés dans l’app)
        </label>
      </fieldset>
    </Section>
  );
}
