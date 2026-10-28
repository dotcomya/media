// Import CSV de l'ancienne base (format décrit dans db/MIGRATION.md).
// Analyse d'abord, sans rien écrire ; puis import des lignes valides en
// brouillon. Rien n'est publié par un import, et aucune mention historique
// ne devient une certification.

import { useMemo, useState } from 'preact/hooks';
import { distanceMeters, inBBox } from '../domain/geo';
import { daysBetween } from '../domain/hours';
import { placesNamed } from '../domain/places';
import { can } from '../domain/rbac';
import { cuisine, occasion } from '../domain/taxonomy';
import { editDistance, normalize } from '../domain/text';
import type { BBox, HalalClaim, LatLng, PriceLevel, Weekday, WeeklyRange } from '../domain/types';
import { Icon } from '../ui/Icon';
import { auditEntry, commit, data, go, nowIso, todayIso, toast, type AdminRestaurant } from './model';
import { PageHead, Pill, Section, useActor } from './ui';

const HEADER = 'ref_historique;nom;enseigne;adresse;code_postal;ville;latitude;longitude;telephone;cuisines;ambiances;prix;description;horaires;mention_halal;date_mention_halal';

const SAMPLE = [
  HEADER,
  'YY-1001;Le Jardin d’Ifriqiya;;8 rue de la Fontaine-au-Roi;75011;Paris;48.8689;2.3712;01 99 00 61 20;tunisienne;famille|cosy;€€;Couscous au poisson le vendredi, brik maison et thé aux pignons.;"mar 12:00-14:30,19:00-22:30; mer 12:00-14:30,19:00-22:30; sam 19:00-23:30";Certifié halal par le restaurateur;29/06/2025',
  'YY-1002;Grill Express Pantin;;21 avenue Jean-Lolive;93500;Pantin;;;01 99 00 61 21;grillades;street;€;Brochettes et frites, service rapide au comptoir.;lun 11:30-23:00;;',
  'YY-1003;Burger Atlantique;;3 quai de la Fosse;44000;Nantes;47.2125;-1.5600;01 99 00 61 22;burger;amis;€;Smash burgers et milkshakes.;;Certifié halal par le restaurateur;12/03/2026',
  'YY-1004;Taco Sol;;7 calle Mayor;28013;Madrid;40.4168;-3.7038;;latino;;€€;;;;',
  'YY-1005;Les Braises Belleville;;48 boulevard de Belleville;75020;Paris;48.87137;2.37752;01 99 00 10 70;turque|grillades;amis;€;Grillades au charbon.;;Certifié halal par le restaurateur;02/02/2025',
  'YY-1006;Saveurs de Lahore;;14 rue Cail;75010;Paris;48.8838;2.3598;;pakistanaise;;€;Karahi et nihari le week-end.;;Organisme Alpha;10/01/2026',
  'YY-1007;Thé à la menthe;;;75018;Paris;48.886;2.350;;patisserie;;;;;;',
  'YY-1008;Pho Rapide;;9 avenue de Choisy;75013;Paris;48.8250;2.3640;;asiatique|bubble-tea;;€;;;;',
  'YY-1009;Kebab du Port;;2 rue du Port;13002;Marseille;5.3698;43.2965;;turque;;€;;;;',
].join('\n');

const FRANCE: BBox = [-5.3, 41.3, 9.7, 51.2];
const DAYS: Record<string, Weekday> = { lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6, dim: 7 };

type Level = 'ok' | 'warning' | 'error' | 'duplicate' | 'already';

interface RowResult {
  line: number;
  ref: string;
  name: string;
  level: Level;
  messages: string[];
  halal: string;
  restaurant?: AdminRestaurant;
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === ';' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseHours(raw: string): { weekly: WeeklyRange[]; bad: string[] } {
  const weekly: WeeklyRange[] = [];
  const bad: string[] = [];
  for (const part of raw.split(';').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(lun|mar|mer|jeu|ven|sam|dim)\s+(.*)$/i);
    if (!m) {
      bad.push(part);
      continue;
    }
    for (const r of m[2].split(',')) {
      const t = r.trim().match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
      if (t) weekly.push({ day: DAYS[m[1].toLowerCase()], opens: t[1], closes: t[2] });
      else bad.push(`${m[1]} ${r.trim()}`);
    }
  }
  return { weekly, bad };
}

function frDate(raw: string): string | undefined {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

function similarName(a: string, b: string) {
  const na = normalize(a).replace(/^(le|la|les|l) /, '');
  const nb = normalize(b).replace(/^(le|la|les|l) /, '');
  return na === nb || na.includes(nb) || nb.includes(na) || editDistance(na, nb, 4) <= 4;
}

export function analyse(csv: string, existing: AdminRestaurant[]): { results: RowResult[]; headerError?: string } {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { results: [], headerError: 'Fichier vide.' };
  const head = splitCsv(lines[0]);
  const expected = HEADER.split(';');
  const missing = expected.filter((c) => !head.includes(c));
  if (missing.length) return { results: [], headerError: `Colonnes manquantes : ${missing.join(', ')}.` };
  const col = (cells: string[], name: string) => cells[head.indexOf(name)] ?? '';
  const today = todayIso();
  const results: RowResult[] = [];
  const seenRefs = new Set<string>();

  lines.slice(1).forEach((line, i) => {
    const cells = splitCsv(line);
    const ref = col(cells, 'ref_historique');
    const name = col(cells, 'nom');
    const messages: string[] = [];
    // Modifié par les fermetures err/warn : on empêche TypeScript de le figer à 'ok'.
    let level = 'ok' as Level;
    const err = (m: string) => {
      messages.push(m);
      level = 'error';
    };
    const warn = (m: string) => {
      messages.push(m);
      if (level === 'ok') level = 'warning';
    };

    if (!ref) err('Référence historique manquante.');
    else if (seenRefs.has(ref)) err('Référence en double dans le fichier.');
    seenRefs.add(ref);
    if (existing.some((r) => r.legacyRef === ref)) {
      results.push({ line: i + 2, ref, name, level: 'already', messages: ['Déjà importée : ignorée (rejeu sans effet).'], halal: '—' });
      return;
    }
    if (!name) err('Nom manquant.');
    const street = col(cells, 'adresse');
    const postcode = col(cells, 'code_postal');
    const city = col(cells, 'ville');
    if (!street) err('Adresse manquante : impossible à géocoder.');
    if (!/^\d{5}$/.test(postcode)) err('Code postal invalide.');
    if (!city) err('Ville manquante.');

    // Coordonnées : contrôle croisé, ou géocodage à faire.
    let location: LatLng | undefined;
    const lat = Number(col(cells, 'latitude').replace(',', '.'));
    const lng = Number(col(cells, 'longitude').replace(',', '.'));
    if (col(cells, 'latitude') && col(cells, 'longitude') && Number.isFinite(lat) && Number.isFinite(lng)) {
      if (inBBox({ lat, lng }, FRANCE)) location = { lat, lng };
      else if (inBBox({ lat: lng, lng: lat }, FRANCE)) err('Coordonnées hors de France : latitude et longitude inversées ?');
      else err('Coordonnées hors de France métropolitaine.');
    } else {
      warn('Sans coordonnées : à géocoder (BAN) avant relecture.');
    }

    const cuisines = col(cells, 'cuisines').split('|').map((s) => s.trim()).filter(Boolean);
    const known = cuisines.filter((c) => cuisine(c));
    const unknown = cuisines.filter((c) => !cuisine(c));
    if (!known.length) err('Aucune cuisine reconnue par la taxonomie.');
    if (unknown.length) warn(`Cuisine inconnue ignorée : ${unknown.join(', ')}.`);
    const occasions = col(cells, 'ambiances').split('|').map((s) => s.trim()).filter((o) => o && occasion(o));

    const priceRaw = col(cells, 'prix');
    const price = /^€{1,4}$/.test(priceRaw) ? { level: priceRaw.length as PriceLevel } : undefined;
    if (priceRaw && !price) warn('Prix non reconnu (attendu : € à €€€€).');

    const hoursRaw = col(cells, 'horaires');
    const hours = hoursRaw ? parseHours(hoursRaw) : undefined;
    if (hours?.bad.length) warn(`Horaires illisibles : ${hours.bad.join(', ')}.`);
    if (hours?.weekly.length) warn('Horaires repris de l’ancienne base : marqués non vérifiés.');

    // Information halal : aucune promotion implicite (MIGRATION.md § 4).
    const mention = col(cells, 'mention_halal');
    const mentionDate = frDate(col(cells, 'date_mention_halal'));
    const claims: HalalClaim[] = [];
    let halal = 'Aucune → « à confirmer »';
    if (/restaurateur/i.test(mention)) {
      const evidenceDate = mentionDate ?? today;
      claims.push({ id: `hc-${ref}`, kind: 'establishment_declaration', scope: 'whole_menu', method: 'legacy_import', evidenceDate, reviewStatus: 'pending' });
      const old = daysBetween(evidenceDate, today) > 365;
      halal = `Déclaration du restaurant du ${col(cells, 'date_mention_halal') || '?'} (à valider)${old ? ' · plus d’un an : resterait « à confirmer »' : ''}`;
      if (!mentionDate) warn('Mention halal sans date : la déclaration ne pourra pas être validée en l’état.');
    } else if (mention) {
      halal = `Organisme cité (« ${mention} ») sans certificat contrôlé → rien d’affiché`;
      warn('Organisme cité : certificat à obtenir et contrôler avant tout affichage.');
    }

    // Doublons : moins de 50 m et nom proche, ou même téléphone.
    const phone = col(cells, 'telephone');
    const dup = location && existing.find((r) => r.publication !== 'archived' && distanceMeters(r.location, location!) < 50 && (similarName(r.name, name) || (!!phone && r.contact.phone === phone)));
    if (dup && level !== 'error') {
      level = 'duplicate';
      messages.push(`Doublon probable de « ${dup.name} » (${Math.round(distanceMeters(dup.location, location!))} m). Non fusionné automatiquement.`);
    }

    const center = placesNamed(city)[0]?.center;
    const restaurant: AdminRestaurant | undefined =
      level === 'error'
        ? undefined
        : {
            id: `import-${ref.toLowerCase()}`,
            slug: normalize(name).replace(/\s+/g, '-'),
            name,
            legacyRef: ref,
            description: col(cells, 'description'),
            publication: 'draft',
            operating: 'operating',
            location: location ?? center ?? { lat: 48.8566, lng: 2.3522 },
            address: { street, postcode, city, district: city, country: 'FR' },
            timezone: 'Europe/Paris',
            cuisines: known,
            occasions: occasions.map((id) => ({ id, strength: 1 as const })),
            amenities: [],
            alcohol: 'unknown',
            price,
            hours: hours?.weekly.length ? { weekly: hours.weekly, special: [], source: 'legacy_import' } : undefined,
            contact: { phone: phone || undefined },
            media: [],
            halalClaims: claims,
            editorialPick: false,
            updatedAt: today,
            version: 1,
          };
    results.push({ line: i + 2, ref, name, level, messages, halal, restaurant });
  });
  return { results };
}

const LEVEL_PILL: Record<Level, [Parameters<typeof Pill>[0]['tone'], string, string]> = {
  ok: ['ok', '●', 'Valide'],
  warning: ['warn', '!', 'Avertissement'],
  error: ['bad', '✕', 'Erreur'],
  duplicate: ['warn', '=', 'Doublon'],
  already: ['muted', '↺', 'Déjà importée'],
};

export function Import() {
  const actor = useActor();
  const [csv, setCsv] = useState(SAMPLE);
  const [analysed, setAnalysed] = useState<ReturnType<typeof analyse> | undefined>();
  const [withDuplicates, setWithDuplicates] = useState(false);
  const allowed = can(actor, 'import.run');

  const importable = useMemo(
    () => analysed?.results.filter((r) => r.restaurant && (r.level === 'ok' || r.level === 'warning' || (withDuplicates && r.level === 'duplicate'))) ?? [],
    [analysed, withDuplicates],
  );

  const run = () => {
    if (!can(actor, 'import.run')) return toast('Import réservé aux éditeurs en session MFA.', 'bad');
    const d = data.get();
    const taken = new Set(d.restaurants.flatMap((r) => [r.slug, ...(r.previousSlugs ?? [])]));
    const added = importable.map(({ restaurant: r }) => {
      let slug = r!.slug;
      for (let n = 2; taken.has(slug); n++) slug = `${r!.slug}-${n}`;
      taken.add(slug);
      return { ...r!, slug };
    });
    commit(
      { restaurants: [...d.restaurants, ...added] },
      auditEntry(actor, 'import.run', 'restaurant', 'import-csv', {
        reason: `${added.length} fiche(s) importée(s) en brouillon`,
        after: { refs: added.map((r) => r.legacyRef) },
      }),
    );
    toast(`${added.length} fiche(s) ajoutée(s) en brouillon. Rien n’est publié.`, 'ok');
    setAnalysed(analyse(csv, data.get().restaurants));
  };

  const counts = analysed?.results.reduce<Record<Level, number>>((acc, r) => ({ ...acc, [r.level]: (acc[r.level] ?? 0) + 1 }), { ok: 0, warning: 0, error: 0, duplicate: 0, already: 0 });

  return (
    <div class="a-page">
      <PageHead title="Import CSV" eyebrow="Reprise de l’ancienne base · simulation avant écriture" />
      {!allowed && (
        <div class="notice">
          <Icon name="lock" />
          <span>L’analyse est ouverte à tous ; l’import est réservé aux éditeurs en session MFA.</span>
        </div>
      )}
      <Section title="Fichier" sub="UTF-8, séparateur « ; », une ligne par établissement physique. Colonnes : voir db/MIGRATION.md. Les lignes ci-dessous sont fictives.">
        <textarea id="csv-input" class="input mono" rows={9} value={csv} onInput={(e) => setCsv((e.currentTarget as HTMLTextAreaElement).value)} aria-label="Contenu CSV" />
        <div class="a-actions wrap">
          <button type="button" class="btn btn-primary btn-sm" onClick={() => setAnalysed(analyse(csv, data.get().restaurants))}>
            <Icon name="eye" /> Analyser (simulation)
          </button>
          <button type="button" class="btn btn-ghost btn-sm" onClick={() => setCsv(SAMPLE)}>
            Recharger l’exemple
          </button>
        </div>
      </Section>

      {analysed?.headerError && (
        <div class="notice bad">
          <Icon name="info" />
          <span>{analysed.headerError}</span>
        </div>
      )}

      {analysed && !analysed.headerError && counts && (
        <Section
          title="Rapport d’analyse"
          sub={`${counts.ok} valides · ${counts.warning} avec avertissement · ${counts.duplicate} doublons probables · ${counts.error} en erreur · ${counts.already} déjà importées`}
          actions={
            <>
              <label class="check">
                <input type="checkbox" checked={withDuplicates} onChange={(e) => setWithDuplicates((e.currentTarget as HTMLInputElement).checked)} /> Importer aussi les doublons (en brouillon)
              </label>
              <button type="button" class="btn btn-primary btn-sm" disabled={!allowed || importable.length === 0} onClick={run}>
                Importer {importable.length} ligne{importable.length > 1 ? 's' : ''} en brouillon
              </button>
            </>
          }
        >
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  <th>Ligne</th>
                  <th>Référence</th>
                  <th>Nom</th>
                  <th>Résultat</th>
                  <th>Information halal reprise</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
                {analysed.results.map((r) => {
                  const [tone, glyph, label] = LEVEL_PILL[r.level];
                  return (
                    <tr key={r.line}>
                      <td class="tnum num">{r.line}</td>
                      <td class="mono">{r.ref || '—'}</td>
                      <td>{r.name || '—'}</td>
                      <td>
                        <Pill tone={tone} glyph={glyph}>
                          {label}
                        </Pill>
                      </td>
                      <td>{r.halal}</td>
                      <td>
                        <ul class="checks">
                          {r.messages.map((m) => (
                            <li key={m} class={r.level === 'error' ? 'bad' : r.level === 'ok' ? '' : 'warn'}>
                              {m}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p class="sub">
            Après import : géocodage BAN des lignes sans coordonnées, validation des déclarations par un vérificateur, relecture, puis publication par lots. Les brouillons apparaissent dans{' '}
            <button type="button" class="link" onClick={() => go('restaurants', { preset: { publication: 'draft', label: 'Brouillons' } })}>
              Établissements › Brouillons
            </button>
            . Dernière analyse : {new Date(nowIso()).toLocaleTimeString('fr-FR')}.
          </p>
        </Section>
      )}
    </div>
  );
}
