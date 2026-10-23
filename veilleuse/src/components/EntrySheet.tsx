import { useState } from 'preact/hooks';
import { formatClock } from '../lib/format';
import { TAGS, type Entry, type Tag } from '../model';
import { deleteEntry, saveEntry, useAppState } from '../store';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { TagButton } from './Tag';
import { TimeChips } from './TimeChips';
import { VolumePicker } from './VolumePicker';

/** Corriger une saisie : ce qui s'est passé, l'heure, ou la supprimer. */
export function EntrySheet({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const [tags, setTags] = useState<Tag[]>(entry.tags);
  const [at, setAt] = useState(entry.at);
  const { settings } = useAppState();
  const [ml, setMl] = useState(entry.ml ?? settings.lastBottleMl);
  const toggle = (tag: Tag) => setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));

  return (
    <Sheet
      title={`Saisie de ${formatClock(entry.at)}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            class="action action-danger"
            onClick={() => {
              deleteEntry(entry);
              onClose();
            }}
          >
            <Icon name="trash" size={22} />
            Supprimer
          </button>
          <button
            type="button"
            class="action action-primary"
            disabled={!tags.length}
            onClick={() => {
              saveEntry({ ...entry, tags, at, ml });
              onClose();
            }}
          >
            <Icon name="check" size={22} />
            Enregistrer
          </button>
        </>
      }
    >
      <div class="field">
        <span class="field-label">Ce qui s'est passé</span>
        <div class="tag-grid">
          {TAGS.map((tag) => (
            <TagButton key={tag} tag={tag} shape="card" on={tags.includes(tag)} onClick={() => toggle(tag)} />
          ))}
        </div>
        {tags.includes('bottle') && <VolumePicker ml={ml} onChange={setMl} />}
      </div>
      <TimeChips label="Heure" value={at} onChange={setAt} />
    </Sheet>
  );
}
