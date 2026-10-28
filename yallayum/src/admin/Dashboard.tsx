// Tableau de bord : l'état du catalogue en un coup d'œil. Chaque chiffre
// porte sa définition et ouvre la liste qui le compose.

import { PUBLICATION_LABELS } from '../domain/publication';
import type { PublicationStatus } from '../domain/types';
import { Icon } from '../ui/Icon';
import { duplicatePairs, HALAL_QUEUES, QUALITY, ROUTE_INTENTS_EXAMPLE, ZERO_RESULT_EXAMPLE, type QualityKey } from './metrics';
import { go, todayIso, type ListPreset } from './model';
import { Kpi, PageHead, Section, useData } from './ui';

const PUB_DEF: Record<PublicationStatus, string> = {
  published: 'Fiches visibles du public (sauf si l’établissement est fermé définitivement ou a déménagé).',
  in_review: 'Fiches complètes qui attendent la relecture d’un éditeur avant publication.',
  draft: 'Fiches en cours de saisie ou importées, invisibles du public.',
  suspended: 'Fiches retirées temporairement après un doute (motif au journal).',
  archived: 'Fiches retirées durablement, restaurables.',
};

export function Dashboard() {
  const restaurants = useData((d) => d.restaurants);
  const contributions = useData((d) => d.contributions);
  const lastCheck = useData((d) => d.lastDailyCheck);
  const today = todayIso();
  const open = (preset: ListPreset) => go('restaurants', { preset });

  const byPub = (s: PublicationStatus) => restaurants.filter((r) => r.publication === s).length;
  const published = restaurants.filter((r) => r.publication === 'published');
  const closedForever = restaurants.filter((r) => r.operating === 'permanently_closed').length;
  const pendingContrib = contributions.filter((c) => ['received', 'in_review', 'needs_info'].includes(c.status)).length;
  const dups = duplicatePairs(restaurants);

  const cities = Object.entries(
    published.reduce<Record<string, number>>((acc, r) => {
      acc[r.address.city] = (acc[r.address.city] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const maxCity = Math.max(1, ...cities.map(([, n]) => n));
  const maxRoute = Math.max(...ROUTE_INTENTS_EXAMPLE);

  return (
    <div class="a-page">
      <PageHead title="Tableau de bord" eyebrow={`Catalogue au ${today.split('-').reverse().join('/')}`} />

      <Section title="Fiches" sub="Cycle de publication. Cliquer sur un chiffre ouvre la liste correspondante.">
        <div class="kpis">
          {(['published', 'in_review', 'draft', 'suspended', 'archived'] as PublicationStatus[]).map((s) => (
            <Kpi key={s} value={byPub(s)} label={PUBLICATION_LABELS[s] + (byPub(s) > 1 && s !== 'in_review' ? 's' : '')} definition={PUB_DEF[s]} tone={s === 'published' ? 'ok' : s === 'suspended' ? 'warn' : undefined} onClick={() => open({ publication: s, label: PUBLICATION_LABELS[s] })} />
          ))}
          <Kpi
            value={closedForever}
            label="Fermées définitivement"
            definition="Établissements signalés fermés : sortis de la découverte, leur lien explique la fermeture."
            tone="bad"
            onClick={() => open({ operating: 'permanently_closed', label: 'Fermées définitivement' })}
          />
        </div>
      </Section>

      <div class="a-grid-2">
        <Section title="Information halal" sub={lastCheck ? `Contrôle quotidien lancé le ${new Date(lastCheck).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Contrôle quotidien pas encore lancé aujourd’hui'}>
          <div class="kpis">
            {(Object.keys(HALAL_QUEUES) as (keyof typeof HALAL_QUEUES)[]).map((k) => (
              <Kpi
                key={k}
                value={published.filter((r) => HALAL_QUEUES[k].test(r, today)).length}
                label={HALAL_QUEUES[k].label}
                definition={HALAL_QUEUES[k].definition}
                tone={k === 'expired' ? 'bad' : k === 'expiring' ? 'warn' : undefined}
                onClick={() => open({ halal: k, label: HALAL_QUEUES[k].label })}
              />
            ))}
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onClick={() => go('halal')}>
            <Icon name="shield" /> Ouvrir la vérification
          </button>
        </Section>

        <Section title="À traiter">
          <div class="kpis">
            <Kpi value={pendingContrib} label="Contributions en attente" definition="Propositions et signalements reçus, en cours d’examen ou en attente de précisions." tone={pendingContrib ? 'warn' : 'ok'} onClick={() => go('contributions')} />
            <Kpi
              value={dups.length}
              label="Doublons probables"
              definition="Paires de fiches à moins de 50 m avec un nom proche ou le même téléphone. Jamais fusionnées automatiquement."
              tone={dups.length ? 'warn' : 'ok'}
              onClick={() => open({ duplicates: true, label: 'Doublons probables' })}
            />
          </div>
          {dups.length > 0 && (
            <ul class="a-list">
              {dups.map(([a, b]) => (
                <li key={a.id + b.id}>
                  <Icon name="copy" size={16} /> {a.name} ↔ {b.name}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Qualité des fiches publiées" sub={`${published.length} fiches publiées.`}>
        <div class="kpis">
          {(Object.keys(QUALITY) as QualityKey[]).map((k) => {
            const n = published.filter((r) => QUALITY[k].test(r, today)).length;
            return <Kpi key={k} value={n} label={QUALITY[k].label} definition={QUALITY[k].definition} tone={n ? 'warn' : 'ok'} onClick={() => open({ quality: k, label: QUALITY[k].label })} />;
          })}
        </div>
      </Section>

      <div class="a-grid-2">
        <Section title="Couverture par ville" sub="Fiches publiées, en activité ou fermées temporairement.">
          <div class="bars">
            {cities.map(([city, n]) => (
              <button key={city} type="button" class="bar-row" onClick={() => open({ city, label: city })}>
                <span class="bar-label">{city}</span>
                <span class="bar-track" aria-hidden="true">
                  <span style={{ width: `${(n / maxCity) * 100}%` }} />
                </span>
                <span class="tnum bar-n">{n}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Usage" sub="Mesure d’audience exemptée, sans donnée personnelle.">
          <div class="usage">
            <div>
              <h3>
                Recherches sans résultat <span class="example-tag">Exemple</span>
              </h3>
              <p class="sub">Requêtes nettoyées (ni numéro ni e-mail), gardées 90 jours, regroupées.</p>
              <table class="data compact">
                <tbody>
                  {ZERO_RESULT_EXAMPLE.map((z) => (
                    <tr key={z.query}>
                      <td>« {z.query} »</td>
                      <td class="num tnum">{z.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3>
                Intentions d’itinéraire, 7 jours <span class="example-tag">Exemple</span>
              </h3>
              <p class="sub">Ouvertures d’une app de navigation depuis une fiche. Ne prouve pas la visite.</p>
              <div class="spark" role="img" aria-label={`De ${ROUTE_INTENTS_EXAMPLE[0]} à ${ROUTE_INTENTS_EXAMPLE[6]} par jour`}>
                {ROUTE_INTENTS_EXAMPLE.map((v, i) => (
                  <span key={i} style={{ height: `${(v / maxRoute) * 100}%` }} title={`${v}`} class={i === ROUTE_INTENTS_EXAMPLE.length - 1 ? 'last' : undefined} />
                ))}
              </div>
              <p class="sub tnum">Dernier jour : {ROUTE_INTENTS_EXAMPLE[6]}</p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
