// Journal d'audit : en ajout seul. Aucune action de cet écran ne modifie
// une entrée ; côté serveur, chaque entrée est chaînée à la précédente par
// une empreinte (voir db/schema.sql).

import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { can } from '../domain/rbac';
import type { AuditEntry } from '../domain/publication';
import { Icon } from '../ui/Icon';
import { actorLabel } from './model';
import { Denied, Empty, PageHead, fmtDateTime, useActor, useData } from './ui';

const ENTITY_LABELS: Record<AuditEntry['entity'], string> = {
  restaurant: 'Fiche',
  halal_claim: 'Preuve halal',
  contribution: 'Contribution',
  loyalty_transaction: 'Fidélité',
  user: 'Utilisateur',
  content: 'Contenu',
};

export function Audit() {
  const audit = useData((d) => d.audit);
  const actor = useActor();
  const [entity, setEntity] = useState<AuditEntry['entity'] | ''>('');
  const [who, setWho] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | undefined>();

  if (!can(actor, 'audit.read')) {
    return (
      <div class="a-page">
        <PageHead title="Journal d’audit" />
        <Denied what="Lecture du journal réservée aux super admins et aux vérificateurs." />
      </div>
    );
  }

  const actors = [...new Set(audit.map((a) => a.actorId))];
  const rows = audit.filter((a) => (!entity || a.entity === entity) && (!who || a.actorId === who) && (!q || `${a.action} ${a.entityId} ${a.reason ?? ''}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div class="a-page">
      <PageHead title="Journal d’audit" eyebrow={`${audit.length} entrées · ajout seul`} />
      <div class="notice info">
        <Icon name="lock" />
        <span>Ni modification ni suppression possibles : une correction s’écrit comme une nouvelle entrée.</span>
      </div>
      <div class="a-filters">
        <label class="search">
          <Icon name="search" size={18} />
          <span class="sr-only">Rechercher dans le journal</span>
          <input id="aq" type="search" placeholder="Action, fiche, motif…" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <select class="input" aria-label="Type" value={entity} onChange={(e) => setEntity((e.currentTarget as HTMLSelectElement).value as AuditEntry['entity'] | '')}>
          <option value="">Tous les types</option>
          {(Object.keys(ENTITY_LABELS) as AuditEntry['entity'][]).map((k) => (
            <option key={k} value={k}>
              {ENTITY_LABELS[k]}
            </option>
          ))}
        </select>
        <select class="input" aria-label="Acteur" value={who} onChange={(e) => setWho((e.currentTarget as HTMLSelectElement).value)}>
          <option value="">Tous les acteurs</option>
          {actors.map((a) => (
            <option key={a} value={a}>
              {actorLabel(a)}
            </option>
          ))}
        </select>
      </div>
      {rows.length === 0 ? (
        <Empty icon="history" title="Aucune entrée" />
      ) : (
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Acteur</th>
                <th>Action</th>
                <th>Objet</th>
                <th>Motif</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((a) => (
                <Fragment key={a.id}>
                  <tr>
                    <td class="tnum">{fmtDateTime(a.at)}</td>
                    <td>{actorLabel(a.actorId)}</td>
                    <td class="mono">{a.action}</td>
                    <td>
                      {ENTITY_LABELS[a.entity]} <span class="muted mono">{a.entityId}</span>
                    </td>
                    <td>{a.reason ?? <span class="muted">—</span>}</td>
                    <td>
                      {(a.before !== undefined || a.after !== undefined) && (
                        <button type="button" class="btn btn-ghost btn-sm" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? undefined : a.id)}>
                          {open === a.id ? 'Masquer' : 'Avant / après'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === a.id && (
                    <tr class="detail-row">
                      <td colSpan={6}>
                        <div class="diff">
                          <div>
                            <strong>Avant</strong>
                            <pre>{JSON.stringify(a.before ?? null, null, 2)}</pre>
                          </div>
                          <div>
                            <strong>Après</strong>
                            <pre>{JSON.stringify(a.after ?? null, null, 2)}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
