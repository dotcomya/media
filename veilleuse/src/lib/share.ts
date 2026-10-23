import type { AppEvent } from '../model';
import { capitalize, diaperLabel, formatClock, formatDate, formatDuration, sideLetter } from './format';
import { eventsOfDay, summarizeDay } from './summary';

const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`;

function describe(e: AppEvent): string {
  switch (e.type) {
    case 'breast': {
      const parts = e.sides.length === 1
        ? [sideLetter(e.sides[0])]
        : [`G ${formatDuration(e.leftMs)}`, `D ${formatDuration(e.rightMs)}`];
      return `Tétée ${parts.join(', ')} — ${formatDuration(e.durationMs)}`;
    }
    case 'bottle':
      return `Biberon ${e.ml} ml`;
    case 'diaper':
      return diaperLabel(e.pee, e.poop);
  }
}

/** Résumé texte d'une journée, à envoyer au pédiatre ou à la sage-femme. */
export function daySummaryText(events: AppEvent[], dayStart: number, babyName: string): string {
  const s = summarizeDay(events, dayStart);
  const date = formatDate(dayStart, true);
  const lines = [
    babyName ? `${babyName} — ${capitalize(date)}` : `Résumé du ${date}`,
    `Tétées : ${s.feeds}${s.feeds ? ` (${formatDuration(s.breastMs)} au sein)` : ''}`,
    `Biberons : ${s.bottles}${s.bottles ? ` (${s.bottleMl} ml)` : ''}`,
    `Couches : ${s.diapers} — ${plural(s.pees, 'pipi')}, ${plural(s.poops, 'caca')}`,
  ];
  const detail = eventsOfDay(events, dayStart).reverse();
  if (detail.length) lines.push('', 'Détail :', ...detail.map((e) => `${formatClock(e.at)}  ${describe(e)}`));
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
