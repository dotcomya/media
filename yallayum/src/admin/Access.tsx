// Accès : matrice des rôles, comptes de l'équipe, demandes RGPD.

import { useState } from 'preact/hooks';
import { planAccountDeletion } from '../domain/privacy';
import { can, ROLE_LABELS, ROLE_PERMISSIONS, type Permission, type Role } from '../domain/rbac';
import { Icon } from '../ui/Icon';
import { auditEntry, commit, data, toast, type PrivacyRequest } from './model';
import { Dialog, Field, PageHead, Pill, Section, fmtDateTime, useActor, useData } from './ui';

const PERMISSION_LABELS: Record<Permission, string> = {
  'restaurant.read': 'Lire les fiches',
  'restaurant.edit': 'Modifier les fiches',
  'restaurant.publish': 'Publier, suspendre, archiver',
  'restaurant.propose_change': 'Proposer une modification',
  'halal.review': 'Valider l’information halal',
  'halal.evidence.read': 'Lire les pièces justificatives',
  'contribution.moderate': 'Modérer les contributions',
  'content.edit': 'Modifier les contenus',
  'content.publish': 'Programmer les contenus',
  'import.run': 'Lancer un import',
  'loyalty.read': 'Lire la fidélité',
  'loyalty.adjust': 'Annuler, régler le programme',
  'stats.read': 'Lire les statistiques',
  'user.manage': 'Gérer les comptes',
  'audit.read': 'Lire le journal d’audit',
  'privacy.requests': 'Traiter les demandes RGPD',
};

const SENSITIVE: Permission[] = ['restaurant.publish', 'halal.review', 'halal.evidence.read', 'loyalty.adjust', 'user.manage', 'import.run', 'privacy.requests'];
const ROLES: Role[] = ['super_admin', 'editor', 'verifier', 'support', 'restaurateur'];

export function Access() {
  const users = useData((d) => d.users);
  const privacy = useData((d) => d.privacy);
  const actor = useActor();
  const canManage = can(actor, 'user.manage');
  const canPrivacy = can(actor, 'privacy.requests');
  const [inviting, setInviting] = useState(false);
  const [plan, setPlan] = useState<PrivacyRequest | undefined>();

  const revoke = (id: string) => {
    if (!can(actor, 'user.manage')) return toast('Droit insuffisant.', 'bad');
    const u = data.get().users.find((x) => x.id === id)!;
    commit({ users: data.get().users.map((x) => (x.id === id ? { ...x, status: 'revoked' as const } : x)) }, auditEntry(actor, 'user.revoked', 'user', id, { before: { statut: u.status }, after: { statut: 'revoked' } }));
    toast(`Accès de ${u.name} révoqué : sessions fermées.`, 'ok');
  };

  const process = (r: PrivacyRequest) => {
    if (!can(actor, 'privacy.requests')) return toast('Droit insuffisant.', 'bad');
    commit({ privacy: data.get().privacy.map((x) => (x.id === r.id ? { ...x, status: 'done' as const } : x)) }, auditEntry(actor, `privacy.${r.kind}_done`, 'user', r.id, { reason: r.kind === 'deletion' ? 'Plan de suppression appliqué' : 'Export transmis' }));
    setPlan(undefined);
    toast(r.kind === 'deletion' ? 'Suppression traitée selon le plan.' : 'Export préparé et transmis.', 'ok');
  };

  return (
    <div class="a-page">
      <PageHead title="Accès" eyebrow="Rôles, comptes, demandes RGPD" />

      <Section title="Rôles et droits" sub="Vérifiés côté serveur à chaque action. Les droits marqués ◆ exigent une session MFA pour les rôles internes.">
        <div class="table-wrap">
          <table class="data matrix">
            <thead>
              <tr>
                <th>Droit</th>
                {ROLES.map((r) => (
                  <th key={r} class="center">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(PERMISSION_LABELS) as Permission[]).map((p) => (
                <tr key={p}>
                  <td>
                    {PERMISSION_LABELS[p]} {SENSITIVE.includes(p) && <span title="MFA requise" aria-label="MFA requise">◆</span>}
                  </td>
                  {ROLES.map((r) => (
                    <td key={r} class="center">
                      {ROLE_PERMISSIONS[r].includes(p) ? (
                        <span class="yes" aria-label="oui">
                          ✓{r === 'restaurateur' && p !== 'restaurant.read' ? ' (siens)' : ''}
                        </span>
                      ) : (
                        <span class="no" aria-label="non">
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title={`Comptes · ${users.filter((u) => u.status !== 'revoked').length} actifs ou invités`}
        actions={
          canManage ? (
            <button type="button" class="btn btn-primary btn-sm" onClick={() => setInviting(true)}>
              <Icon name="plus" /> Inviter
            </button>
          ) : undefined
        }
      >
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Nom</th>
                <th>E-mail</th>
                <th>Rôle</th>
                <th>MFA</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} class={u.status === 'revoked' ? 'struck' : undefined}>
                  <td>{u.name}</td>
                  <td class="mono">{u.email}</td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td>
                    {u.role === 'restaurateur' ? (
                      <span class="muted">Facultative</span>
                    ) : u.mfa ? (
                      <Pill tone="ok" glyph="●">
                        Active
                      </Pill>
                    ) : (
                      <Pill tone="bad" glyph="!">
                        À activer : droits sensibles bloqués
                      </Pill>
                    )}
                  </td>
                  <td>
                    <Pill tone={u.status === 'active' ? 'ok' : u.status === 'invited' ? 'info' : 'muted'} glyph={u.status === 'active' ? '●' : u.status === 'invited' ? '◌' : '⊘'}>
                      {u.status === 'active' ? 'Actif' : u.status === 'invited' ? 'Invité' : 'Révoqué'}
                    </Pill>
                  </td>
                  <td>
                    {canManage && u.status !== 'revoked' && u.id !== actor.id && (
                      <button type="button" class="btn btn-danger-ghost btn-sm" onClick={() => revoke(u.id)}>
                        Révoquer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Demandes RGPD" sub="Accès, export, suppression : réponse sous un mois.">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Reçue</th>
                <th>Demande</th>
                <th>Personne</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {privacy.map((r) => (
                <tr key={r.id}>
                  <td class="tnum">{fmtDateTime(r.createdAt)}</td>
                  <td>{r.kind === 'export' ? 'Export des données' : 'Suppression du compte'}</td>
                  <td class="mono">{r.email}</td>
                  <td>
                    <Pill tone={r.status === 'done' ? 'ok' : 'warn'} glyph={r.status === 'done' ? '●' : '◐'}>
                      {r.status === 'done' ? 'Traitée' : 'À traiter'}
                    </Pill>
                  </td>
                  <td>
                    {canPrivacy && r.status === 'open' && (
                      <button type="button" class="btn btn-secondary btn-sm" onClick={() => (r.kind === 'deletion' ? setPlan(r) : process(r))}>
                        {r.kind === 'deletion' ? 'Voir le plan' : 'Préparer l’export'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {inviting && <InviteDialog onClose={() => setInviting(false)} />}

      {plan && (
        <Dialog
          title={`Suppression · ${plan.email}`}
          onClose={() => setPlan(undefined)}
          wide
          footer={
            <>
              <button type="button" class="btn btn-secondary btn-sm" onClick={() => setPlan(undefined)}>
                Fermer
              </button>
              <button type="button" class="btn btn-danger btn-sm" onClick={() => process(plan)}>
                Appliquer le plan
              </button>
            </>
          }
        >
          <table class="data compact">
            <tbody>
              {planAccountDeletion({ userId: plan.email, hasFavorites: true, hasCollections: true, searchHistory: 23, contributions: 2, loyaltyCardId: 'card-demo', loyaltyTransactions: 6, openDisputes: 0, devices: 2 }).map((s) => (
                <tr key={s.what}>
                  <td>
                    <Pill tone={s.action === 'delete' ? 'bad' : s.action === 'anonymize' ? 'info' : 'warn'} glyph={s.action === 'delete' ? '✕' : s.action === 'anonymize' ? '◌' : '▢'}>
                      {s.action === 'delete' ? 'Supprimé' : s.action === 'anonymize' ? 'Anonymisé' : `Conservé ${Math.round((s.retainDays ?? 0) / 365)} an(s)`}
                    </Pill>
                  </td>
                  <td>
                    <strong>{s.what}</strong>
                    <div class="sub">{s.why}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="sub">Durées proposées, à valider par le DPO selon le contrat fidélité final.</p>
        </Dialog>
      )}
    </div>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const actor = useActor();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const ok = /\S+@\S+\.\S+/.test(email);
  const invite = () => {
    if (!can(actor, 'user.manage')) return toast('Droit insuffisant.', 'bad');
    const id = `u-${Date.now().toString(36)}`;
    commit(
      { users: [...data.get().users, { id, name: email.split('@')[0], email, role, mfa: false, status: 'invited' }] },
      auditEntry(actor, 'user.invited', 'user', id, { after: { email, role } }),
    );
    toast(`Invitation envoyée à ${email} (simulation). MFA à configurer à la première connexion.`, 'ok');
    onClose();
  };
  return (
    <Dialog
      title="Inviter une personne"
      onClose={onClose}
      footer={
        <>
          <button type="button" class="btn btn-secondary btn-sm" onClick={onClose}>
            Annuler
          </button>
          <button type="button" class="btn btn-primary btn-sm" disabled={!ok} onClick={invite}>
            Envoyer l’invitation
          </button>
        </>
      }
    >
      <Field label="E-mail">
        <input id="inv-email" class="input" type="email" value={email} onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} />
      </Field>
      <Field label="Rôle">
        <select id="inv-role" class="input" value={role} onChange={(e) => setRole((e.currentTarget as HTMLSelectElement).value as Role)}>
          {ROLES.filter((r) => r !== 'restaurateur').map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </Field>
      <p class="sub">Les restaurateurs ne sont pas invités ici : ils revendiquent leur fiche après preuve de représentation. Dernière action : {fmtDateTime(new Date().toISOString())}.</p>
    </Dialog>
  );
}
