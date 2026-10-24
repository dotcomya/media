import { TAGS, TAG_LABELS, describeEntry, type Entry, type Tag } from '../model';
import { capitalize, formatClock, formatDate, formatSpan } from './format';
import { entriesOfDay, summarizeDay, weekStats, type DayStats, type DaySummary } from './summary';

export const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`;

/** « 6 tétées · 2 biberons · 5 pipis · 2 cacas » */
export function summaryParts(summary: DaySummary): { tag: Tag; text: string }[] {
  return TAGS.map((tag) => ({ tag, text: plural(summary[tag], TAG_LABELS[tag].toLowerCase()) }));
}

/** Résumé texte d'une journée, à envoyer au pédiatre ou à la sage-femme. */
export function daySummaryText(entries: Entry[], dayStart: number, babyName: string): string {
  const date = formatDate(dayStart, true);
  const lines = [
    babyName ? `${babyName} — ${capitalize(date)}` : `Résumé du ${date}`,
    summaryParts(summarizeDay(entries, dayStart))
      .map((part) => part.text)
      .join(' · '),
  ];
  const detail = entriesOfDay(entries, dayStart).reverse();
  if (detail.length) lines.push('', 'Détail :', ...detail.map((e) => `${formatClock(e.at)}  ${describeEntry(e)}`));
  return lines.join('\n');
}

/** Moyenne lisible : « 8 », « 8,5 ». */
export const formatAverage = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** « 4 tétées · 2 biberons (210 ml) · 5 pipis · 2 cacas » */
function dayLine(stats: DayStats): string {
  if (!stats.total) return 'rien de noté';
  return summaryParts(stats.counts)
    .map((part) => (part.tag === 'bottle' && stats.ml ? `${part.text} (${stats.ml} ml)` : part.text))
    .join(' · ');
}

/** Bilan des 7 derniers jours, à envoyer au pédiatre : moyennes, pauses entre repas, puis jour par jour. */
export function weekSummaryText(entries: Entry[], today: number, babyName: string): string {
  const { days, average, gaps } = weekStats(entries, today);
  const lines = [`${babyName ? `${babyName} — ` : ''}7 derniers jours (${formatDate(days[6].day)} → ${formatDate(today)})`];
  if (average) {
    const milk = average.ml ? `, ${Math.round(average.ml)} ml de lait` : '';
    lines.push(
      `Par jour en moyenne : ${formatAverage(average.meals)} repas${milk} · ${formatAverage(average.pee)} pipis · ${formatAverage(average.poop)} cacas`,
    );
  }
  if (gaps) lines.push(`Entre deux repas : ${formatSpan(gaps.mean)} en moyenne, ${formatSpan(gaps.longest)} au plus long`);
  lines.push('', ...days.map((d, i) => `${capitalize(formatDate(d.day))}${i === 0 ? ' (en cours)' : ''} : ${dayLine(d)}`));
  return lines.join('\n');
}

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

/** Partage via la feuille de partage du téléphone, sinon copie dans le presse-papiers. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}

/** Partage un fichier (« Enregistrer dans Fichiers », e-mail…), sinon le télécharge. */
export async function shareFile(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement('a'), { href: url, download: file.name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
