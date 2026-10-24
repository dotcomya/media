import { useMemo } from 'preact/hooks';
import { formatSpan } from '../lib/format';
import { formatAverage, shareText, weekSummaryText } from '../lib/share';
import { weekStats, type DayStats } from '../lib/summary';
import { startOfDay } from '../lib/time';
import { TAGS, type Tag } from '../model';
import { showToast, useAppState } from '../store';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { Emoji } from './Tag';

const shortDay = (ts: number) =>
  new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }).replace(/^./, (c) => c.toUpperCase());

/** Un nombre et, dessous, une fine barre proportionnelle au maximum de la colonne (piste : 70 % de la case). */
function Cell({ value, max }: { value: number; max: number }) {
  return (
    <span class="week-cell">
      <span>{value}</span>
      <i style={{ width: `${max ? (value / max) * 70 : 0}%` }} />
    </span>
  );
}

/** Les 7 derniers jours, pour les rendez-vous : moyennes, pauses entre repas, et le détail jour par jour. */
export function WeekSheet({ onClose }: { onClose: () => void }) {
  const { entries, settings } = useAppState();
  const today = startOfDay(Date.now());
  const { days, average, gaps } = useMemo(() => weekStats(entries, today), [entries, today]);
  const withMilk = days.some((d) => d.ml > 0);
  const max = (pick: (d: DayStats) => number) => Math.max(0, ...days.map(pick));
  const maxima = Object.fromEntries(TAGS.map((tag) => [tag, max((d) => d.counts[tag])])) as Record<Tag, number>;
  const maxMl = max((d) => d.ml);

  const send = async () => {
    try {
      const text = weekSummaryText(entries, today, settings.babyName.trim());
      if ((await shareText('Bilan des 7 derniers jours', text)) === 'copied') showToast('Bilan copié, prêt à coller');
    } catch {
      showToast('Partage indisponible');
    }
  };

  return (
    <Sheet
      title="7 derniers jours"
      onClose={onClose}
      footer={
        <button type="button" class="action action-primary" onClick={send}>
          <Icon name="share" size={20} />
          Envoyer au pédiatre
        </button>
      }
    >
      {average ? (
        <>
          <p class="field-label">Par jour en moyenne</p>
          <div class="kpis">
            <span class="kpi">
              <strong>{formatAverage(average.meals)}</strong>
              repas
            </span>
            {withMilk && (
              <span class="kpi">
                <strong>{Math.round(average.ml)}</strong>
                ml de lait
              </span>
            )}
            <span class="kpi">
              <strong>{formatAverage(average.pee)}</strong>
              pipis
            </span>
            <span class="kpi">
              <strong>{formatAverage(average.poop)}</strong>
              cacas
            </span>
          </div>
        </>
      ) : (
        <p class="hint">Les moyennes apparaîtront après une première journée complète.</p>
      )}
      {gaps && (
        <p class="week-gaps">
          Entre deux repas : <strong>{formatSpan(gaps.mean)}</strong> en moyenne,{' '}
          <strong>{formatSpan(gaps.longest)}</strong> au plus long.
        </p>
      )}

      <div class={`week${withMilk ? ' with-milk' : ''}`} role="table" aria-label="Détail des 7 derniers jours">
        <div class="week-row week-head" role="row">
          <span role="columnheader">Jour</span>
          {TAGS.map((tag) => [
            <span role="columnheader" key={tag}>
              <Emoji tag={tag} size={15} />
            </span>,
            tag === 'bottle' && withMilk && (
              <span role="columnheader" key="ml">
                ml
              </span>
            ),
          ])}
        </div>
        {days.map((d, i) => (
          <div class={`week-row${d.total ? '' : ' is-empty'}`} role="row" key={d.day}>
            <span role="cell" class="week-day">
              {i === 0 ? 'Auj.' : shortDay(d.day)}
              {i === 0 && <small>en cours</small>}
            </span>
            {TAGS.map((tag) => [
              <span role="cell" key={tag}>
                {d.total ? <Cell value={d.counts[tag]} max={maxima[tag]} /> : '—'}
              </span>,
              tag === 'bottle' && withMilk && (
                <span role="cell" key="ml">
                  {d.total ? <Cell value={d.ml} max={maxMl} /> : '—'}
                </span>
              ),
            ])}
          </div>
        ))}
      </div>
      <p class="hint">Les moyennes ne comptent que les journées terminées où quelque chose a été noté.</p>
    </Sheet>
  );
}
