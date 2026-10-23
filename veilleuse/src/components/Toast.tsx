import { undoToast, useAppState } from '../store';
import { Icon } from './Icon';

/** Toast « Ajouté à 03:12 · Annuler », affiché juste au-dessus de la zone de saisie. */
export function ToastSlot() {
  const { toast } = useAppState();
  if (!toast) return null;
  return (
    <div class="toast" role="status" key={toast.id}>
      <span class="toast-msg">
        <Icon name="check" size={20} />
        {toast.message}
      </span>
      {toast.undo && (
        <button type="button" class="toast-undo" onClick={undoToast}>
          Annuler
        </button>
      )}
    </div>
  );
}
