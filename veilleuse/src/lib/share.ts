import { TAGS, TAG_LABELS, describeEntry, type Entry, type Tag } from '../model';
import { capitalize, formatClock, formatDate } from './format';
import { entriesOfDay, summarizeDay, type DaySummary } from './summary';

const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`;

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
