import { useMemo, useState } from 'preact/hooks';
import { formatDate } from '../lib/format';
import { ageInWeeks, formatAge, formatKg, formatPercentile, parseDate, parseWeight, percentileOf, toDateValue } from '../lib/growth';
import { HOUR } from '../lib/time';
import type { Sex, Weight } from '../model';
import { addWeight, deleteWeight, saveWeight, useAppState } from '../store';
import { Icon } from './Icon';
import { BabyFields } from './SettingsSheet';
import { Sheet } from './Sheet';
import { WeightChart } from './WeightChart';

/** Ajouter ou corriger une pesée : le poids (clavier numérique) et la date. */
function WeightForm({ weight, birthDate, onDone }: { weight: Weight | null; birthDate: string; onDone: () => void }) {
  const [text, setText] = useState(weight ? String(weight.grams / 1000).replace('.', ',') : '');
  const today = toDateValue(Date.now());
  const [date, setDate] = useState(weight ? toDateValue(weight.at) : today);
  const grams = parseWeight(text);
  const beforeBirth = date < birthDate;

  const save = () => {
    if (!grams || beforeBirth) return;
    const unchanged = weight && toDateValue(weight.at) === date;
    const at = unchanged ? weight.at : date === today ? Date.now() : parseDate(date) + 12 * HOUR;
    if (weight) saveWeight({ ...weight, grams, at });
    else addWeight(grams, at);
    onDone();
  };

  return (
    <Sheet
      title={weight ? 'Modifier la pesée' : 'Nouvelle pesée'}
      onClose={onDone}
      footer={
        <>
          {weight ? (
            <button
              type="button"
              class="action action-danger"
              onClick={() => {
                deleteWeight(weight);
                onDone();
              }}
            >
              <Icon name="trash" size={22} />
              Supprimer
            </button>
          ) : (
            <button type="button" class="action" onClick={onDone}>
              Annuler
            </button>
          )}
          <button type="button" class="action action-primary" disabled={!grams || beforeBirth} onClick={save}>
            <Icon name="check" size={22} />
            Enregistrer
          </button>
        </>
      }
    >
      <label class="field">
        <span class="field-label">Poids</span>
        <span class="weight-input">
          <input
            id="weight-kg"
            class="input"
            type="text"
            inputMode="decimal"
            placeholder="4,25"
            autocomplete="off"
            enterkeyhint="done"
            value={text}
            onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <span>kg</span>
        </span>
        {text.trim() !== '' && !grams && <span class="hint">Entre 1 et 25 kg : par exemple 4,25 (ou 4250 en grammes).</span>}
      </label>
      <label class="field">
        <span class="field-label">Date de la pesée</span>
        <input class="input" type="date" min={birthDate} max={today} value={date} onChange={(e) => setDate(e.currentTarget.value || today)} />
        {beforeBirth && <span class="hint">Cette date est avant la naissance.</span>}
      </label>
    </Sheet>
  );
}

const SEX_CURVES: Record<Sex, string> = { girl: 'filles', boy: 'garçons' };

/** Suivi du poids sur les courbes de l'OMS : le graphique, la liste des pesées, et « Ajouter un poids ». */
export function WeightSheet({ onClose }: { onClose: () => void }) {
  const { profile, weights } = useAppState();
  const sorted = useMemo(() => [...weights].sort((a, b) => a.at - b.at), [weights]);
  const [editing, setEditing] = useState<Weight | 'new' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { birthDate, sex } = profile;

  if (editing && birthDate) {
    return <WeightForm weight={editing === 'new' ? null : editing} birthDate={birthDate} onDone={() => setEditing(null)} />;
  }

  const selected = sorted.find((w) => w.id === selectedId) ?? sorted[sorted.length - 1];
  const describe = (w: Weight) => {
    const weeks = ageInWeeks(birthDate!, w.at);
    return { weeks, percentile: formatPercentile(percentileOf(sex!, weeks, w.grams / 1000)) };
  };

  return (
    <Sheet
      title="Courbe de poids"
      onClose={onClose}
      footer={
        birthDate && sex ? (
          <button type="button" class="action action-primary" onClick={() => setEditing('new')}>
            <Icon name="growth" size={22} />
            Ajouter un poids
          </button>
        ) : undefined
      }
    >
      {!birthDate || !sex ? (
        <div class="field">
          <p class="guide-text">
            Pour placer {profile.babyName || 'bébé'} sur les courbes de l'OMS, il faut sa date de naissance et son sexe : les
            courbes des filles et des garçons sont différentes.
          </p>
          <BabyFields />
        </div>
      ) : (
        <>
          {selected ? (
            <p class="weight-now">
              <strong>{formatKg(selected.grams)}</strong>
              <span>
                {formatAge(describe(selected).weeks)} · {describe(selected).percentile}
              </span>
            </p>
          ) : (
            <p class="guide-text">Ajoutez une première pesée, le poids de naissance par exemple : elle apparaîtra sur les courbes.</p>
          )}
          <WeightChart sex={sex} birthDate={birthDate} weights={sorted} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          <p class="who-note">
            Courbes de l'OMS ({SEX_CURVES[sex]}) : 3e, 15e, 50e (médiane), 85e et 97e percentiles. Zone foncée : du 15e au
            85e.
          </p>

          {sorted.length > 0 && (
            <div class="weight-list" aria-label="Pesées">
              {[...sorted].reverse().map((w) => (
                <button type="button" key={w.id} class="weight-row" onClick={() => setEditing(w)}>
                  <span class="weight-date">
                    {formatDate(w.at)}
                    <small>{formatAge(describe(w).weeks)}</small>
                  </span>
                  <span class="weight-kg">
                    {formatKg(w.grams)}
                    <small>{describe(w).percentile}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          <p class="hint">
            Les courbes situent bébé parmi les enfants de son âge. C'est la régularité de sa courbe que suit le médecin.
          </p>
        </>
      )}
    </Sheet>
  );
}
