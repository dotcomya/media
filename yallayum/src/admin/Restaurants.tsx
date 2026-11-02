// Liste des établissements : recherche, filtres, tri, export.

import { useMemo, useState } from 'preact/hooks';
import { TRUST_LEVELS, TRUST_ORDER, type TrustLevel } from '../domain/halal';
import { hoursConfidence } from '../domain/hours';
import { OPERATING_LABELS, PUBLICATION_LABELS } from '../domain/publication';
import { normalize } from '../domain/text';
import type { OperatingStatus, PublicationStatus } from '../domain/types';
import { Icon } from '../ui/Icon';
import { TrustBadge } from '../ui/bits';
import { duplicatePairs, matchesPreset } from './metrics';
import { go, halalOf, todayIso, ui, type AdminRestaurant } from './model';
import { CopyBox, Dialog, Empty, HoursPill, OperatingPill, PageHead, PublicationPill, useActor, useData, useUi } from './ui';
import { can } from '../domain/rbac';

type SortKey = 'name' | 'updatedAt' | 'publication' | 'halal' | 'version';

function csv(rows: AdminRestaurant[]): string {
  const t = todayIso();
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['id', 'nom', 'slug', 'adresse', 'code_postal', 'ville', 'latitude', 'longitude', 'publication', 'exploitation', 'niveau_halal', 'horaires', 'maj', 'version'];
  const lines = rows.map((r) =>
    [r.id, r.name, r.slug, r.address.street, r.address.postcode, r.address.city, r.location.lat, r.location.lng, r.publication, r.operating, halalOf(r, t).level, hoursConfidence(r.hours, t), r.updatedAt, r.version].map(esc).join(';'),
  );
  return [head.join(';'), ...lines].join('\n');
}

export function Restaurants() {
  const all = useData((d) => d.restaurants);
  const preset = useUi((u) => u.preset);
  const actor = useActor();
  const [q, setQ] = useState('');
  const [pub, setPub] = useState<PublicationStatus | ''>('');
  const [op, setOp] = useState<OperatingStatus | ''>('');
  const [level, setLevel] = useState<TrustLevel | ''>('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'updatedAt', dir: -1 });
  const [exporting, setExporting] = useState(false);
  const today = todayIso();

  const dupIds = useMemo(() => new Set(duplicatePairs(all).flat().map((r) => r.id)), [all]);
  // Un restaurateur ne voit que ses établissements.
  const scoped = all.filter((r) => actor.role !== 'restaurateur' || can(actor, 'restaurant.read', { restaurantId: r.id }));

  const rows = useMemo(() => {
    const nq = normalize(q);
    const list = scoped.filter(
      (r) =>
        matchesPreset(r, preset, dupIds, today) &&
        (!nq || normalize(`${r.name} ${r.address.street} ${r.address.city} ${r.address.neighbourhood ?? ''} ${r.slug}`).includes(nq)) &&
        (!pub || r.publication === pub) &&
        (!op || r.operating === op) &&
        (!level || halalOf(r, today).level === level),
    );
    const val = (r: AdminRestaurant): string | number => {
      switch (sort.key) {
        case 'name':
          return normalize(r.name);
        case 'updatedAt':
          return r.updatedAt;
        case 'publication':
          return r.publication;
        case 'halal':
          return TRUST_ORDER.indexOf(halalOf(r, today).level);
        case 'version':
          return r.version;
      }
    };
    return [...list].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir || a.id.localeCompare(b.id));
  }, [scoped, q, pub, op, level, sort, preset]);

  const th = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" class="th-sort" onClick={() => setSort({ key, dir: sort.key === key ? ((-sort.dir) as 1 | -1) : 1 })}>
        {label}
        {sort.key === key && <Icon name="down" size={14} class={sort.dir === 1 ? 'flip' : undefined} />}
      </button>
    </th>
  );

  return (
    <div class="a-page">
      <PageHead title={actor.role === 'restaurateur' ? 'Mes établissements' : 'Établissements'} eyebrow={`${rows.length} sur ${scoped.length}`}>
        {can(actor, 'restaurant.edit') && (
          <button type="button" class="btn btn-secondary btn-sm" onClick={() => go('import')}>
            <Icon name="plus" /> Importer
          </button>
        )}
        <button type="button" class="btn btn-secondary btn-sm" onClick={() => setExporting(true)}>
          <Icon name="copy" /> Exporter CSV
        </button>
      </PageHead>

      {preset && (
        <div class="preset-bar">
          <span>
            Filtre du tableau de bord : <strong>{preset.label}</strong>
          </span>
          <button type="button" class="btn btn-ghost btn-sm" onClick={() => ui.set({ preset: undefined })}>
            <Icon name="close" /> Retirer
          </button>
        </div>
      )}

      <div class="a-filters">
        <label class="search">
          <Icon name="search" size={18} />
          <span class="sr-only">Rechercher</span>
          <input id="rq" type="search" placeholder="Nom, rue, ville, quartier…" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <select class="input" aria-label="Publication" value={pub} onChange={(e) => setPub((e.currentTarget as HTMLSelectElement).value as PublicationStatus | '')}>
          <option value="">Toutes publications</option>
          {(Object.keys(PUBLICATION_LABELS) as PublicationStatus[]).map((s) => (
            <option key={s} value={s}>
              {PUBLICATION_LABELS[s]}
            </option>
          ))}
        </select>
        <select class="input" aria-label="Exploitation" value={op} onChange={(e) => setOp((e.currentTarget as HTMLSelectElement).value as OperatingStatus | '')}>
          <option value="">Toutes situations</option>
          {(Object.keys(OPERATING_LABELS) as OperatingStatus[]).map((s) => (
            <option key={s} value={s}>
              {OPERATING_LABELS[s]}
            </option>
          ))}
        </select>
        <select class="input" aria-label="Niveau halal" value={level} onChange={(e) => setLevel((e.currentTarget as HTMLSelectElement).value as TrustLevel | '')}>
          <option value="">Tous niveaux halal</option>
          {TRUST_ORDER.map((l) => (
            <option key={l} value={l}>
              {TRUST_LEVELS[l].label}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <Empty icon="search" title="Aucune fiche ne correspond" text="Retire un filtre ou change la recherche." />
      ) : (
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                {th('name', 'Nom')}
                <th>Lieu</th>
                {th('publication', 'Publication')}
                <th>Situation</th>
                {th('halal', 'Halal')}
                <th>Horaires</th>
                {th('updatedAt', 'Mise à jour')}
                {th('version', 'V.')}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} class="clickable" onClick={() => go('editor', { editingId: r.id })}>
                  <td>
                    <button type="button" class="row-link" onClick={(e) => (e.stopPropagation(), go('editor', { editingId: r.id }))}>
                      {r.name}
                    </button>
                    {r.pending?.length ? <span class="mini-flag">modifs en attente</span> : null}
                    {dupIds.has(r.id) && <span class="mini-flag warn">doublon ?</span>}
                  </td>
                  <td class="muted">{r.address.neighbourhood ?? r.address.district}</td>
                  <td>
                    <PublicationPill status={r.publication} />
                  </td>
                  <td>
                    <OperatingPill status={r.operating} />
                  </td>
                  <td>
                    <TrustBadge status={halalOf(r, today)} />
                  </td>
                  <td>
                    <HoursPill r={r} />
                  </td>
                  <td class="tnum muted">{r.updatedAt.split('-').reverse().join('/')}</td>
                  <td class="tnum num">{r.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {exporting && (
        <Dialog title={`Export CSV · ${rows.length} fiches`} onClose={() => setExporting(false)} wide>
          <p class="sub">Séparateur « ; », encodage UTF-8 : s’ouvre directement dans un tableur français. Le texte suit les filtres en cours.</p>
          <CopyBox text={csv(rows)} rows={12} />
        </Dialog>
      )}
    </div>
  );
}
