import { useState } from 'preact/hooks';
import { logBottle, useAppState } from '../store';
import { BottlePicker } from './BottlePicker';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

/** Biberon en deux pressions : la dernière quantité est déjà sélectionnée. */
export function BottleSheet({ onClose }: { onClose: () => void }) {
  const { settings } = useAppState();
  const [ml, setMl] = useState(settings.lastBottleMl);
  const save = () => {
    logBottle(ml);
    onClose();
  };
  return (
    <Sheet
      title="Biberon"
      onClose={onClose}
      footer={
        <button type="button" class="action action-primary action-giant" onClick={save}>
          <Icon name="check" size={28} />
          Valider {ml} ml
        </button>
      }
    >
      <BottlePicker ml={ml} onChange={setMl} />
    </Sheet>
  );
}
