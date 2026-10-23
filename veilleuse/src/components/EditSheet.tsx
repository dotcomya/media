import { useState } from 'preact/hooks';
import { formatDuration } from '../lib/format';
import { MINUTE } from '../lib/time';
import { breastData, type AppEvent, type BreastEvent, type DiaperEvent, type EventData, type Side } from '../model';
import { addEvent, deleteEvent, saveEvent } from '../store';
import { BottlePicker } from './BottlePicker';
import { DurationPicker } from './DurationPicker';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { TimeChips } from './TimeChips';

type Props =
  /** Modification d'une entrée existante. */
  | { event: AppEvent; draft?: undefined; defaultAt?: undefined; onClose: () => void }
  /** Ajout d'un oubli. */
  | { event?: undefined; draft: EventData; defaultAt: number; onClose: () => void };

const TITLES = {
  breast: { edit: 'Modifier la tétée', add: 'Ajouter une tétée passée' },
  bottle: { edit: 'Modifier le biberon', add: 'Ajouter un biberon oublié' },
  diaper: { edit: 'Modifier la couche', add: 'Ajouter une couche oubliée' },
};

function dataOf(event: AppEvent): EventData {
  const { id, at, createdAt, updatedAt, deletedAt, ...data } = event;
  return data;
}

export function EditSheet({ event, draft, defaultAt, onClose }: Props) {
  const [data, setData] = useState<EventData>(() => (event ? dataOf(event) : draft!));
  const [at, setAt] = useState(event?.at ?? defaultAt!);

  const save = () => {
    if (event) saveEvent({ ...event, ...data, at } as AppEvent);
    else addEvent(data, at);
    onClose();
  };
  const remove = () => {
    if (event) deleteEvent(event);
    onClose();
  };

  return (
    <Sheet
      title={TITLES[data.type][event ? 'edit' : 'add']}
      onClose={onClose}
      footer={
        <>
          {event && (
            <button type="button" class="action action-danger" onClick={remove}>
              <Icon name="trash" size={24} />
              Supprimer
            </button>
          )}
          <button type="button" class="action action-primary" onClick={save}>
            <Icon name="check" size={24} />
            Enregistrer
          </button>
        </>
      }
    >
      {data.type === 'breast' && <BreastFields value={data} onChange={setData} />}
      {data.type === 'bottle' && <BottlePicker ml={data.ml} onChange={(ml) => setData({ ...data, ml })} />}
      {data.type === 'diaper' && <DiaperFields value={data} onChange={setData} />}
      <TimeChips label={data.type === 'breast' ? 'Heure de début' : 'Heure'} value={at} onChange={setAt} />
    </Sheet>
  );
}

const SIDE_OPTIONS: { label: string; sides: Side[] }[] = [
  { label: 'Gauche', sides: ['L'] },
  { label: 'Droit', sides: ['R'] },
  { label: 'G → D', sides: ['L', 'R'] },
  { label: 'D → G', sides: ['R', 'L'] },
];

const DEFAULT_SIDE_MS = 10 * MINUTE;

type BreastData = Omit<BreastEvent, 'id' | 'at' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

function BreastFields({ value, onChange }: { value: BreastData; onChange: (data: BreastData) => void }) {
  const used = new Set(value.sides);
  // Une tétée G → D → G s'affiche comme « G → D » : seuls le premier sein et le nombre de seins comptent ici.
  const isSelected = (sides: Side[]) =>
    sides[0] === value.sides[0] && (sides.length > 1) === (used.size > 1);

  const pickSides = (sides: Side[]) => {
    const leftMs = sides.includes('L') ? value.leftMs || DEFAULT_SIDE_MS : 0;
    const rightMs = sides.includes('R') ? value.rightMs || DEFAULT_SIDE_MS : 0;
    onChange(breastData(sides, leftMs, rightMs));
  };

  return (
    <>
      <div class="field">
        <span class="field-label">Seins</span>
        <div class="chips cols-4">
          {SIDE_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.label}
              class={`chip${isSelected(option.sides) ? ' on' : ''}`}
              aria-pressed={isSelected(option.sides)}
              onClick={() => pickSides(option.sides)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {used.has('L') && (
        <DurationPicker label="Sein gauche" ms={value.leftMs} onChange={(ms) => onChange(breastData(value.sides, ms, value.rightMs))} />
      )}
      {used.has('R') && (
        <DurationPicker label="Sein droit" ms={value.rightMs} onChange={(ms) => onChange(breastData(value.sides, value.leftMs, ms))} />
      )}
      <p class="hint">Total au sein : {formatDuration(value.durationMs)}</p>
    </>
  );
}

type DiaperData = Omit<DiaperEvent, 'id' | 'at' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

function DiaperFields({ value, onChange }: { value: DiaperData; onChange: (data: DiaperData) => void }) {
  // Une couche contient toujours au moins pipi ou caca.
  const toggle = (key: 'pee' | 'poop') => {
    const next = { ...value, [key]: !value[key] };
    if (next.pee || next.poop) onChange(next);
  };
  return (
    <div class="field">
      <span class="field-label">Contenu de la couche</span>
      <div class="chips cols-2">
        <button type="button" class={`chip chip-lg tone-pee${value.pee ? ' on' : ''}`} aria-pressed={value.pee} onClick={() => toggle('pee')}>
          <Icon name="pee" size={22} /> Pipi
        </button>
        <button type="button" class={`chip chip-lg tone-poop${value.poop ? ' on' : ''}`} aria-pressed={value.poop} onClick={() => toggle('poop')}>
          <Icon name="poop" size={22} /> Caca
        </button>
      </div>
    </div>
  );
}
