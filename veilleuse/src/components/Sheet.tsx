import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { Icon } from './Icon';

interface Props {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  /** Boutons d'action, collés en bas de la feuille (zone du pouce). */
  footer?: ComponentChildren;
}

/** Feuille qui monte du bas de l'écran ; se ferme en touchant le fond assombri. */
export function Sheet({ title, onClose, children, footer }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="backdrop" onClick={onClose}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div class="sheet-head">
          <h2>{title}</h2>
          <button type="button" class="text-btn" onClick={onClose}>
            <Icon name="close" size={20} />
            Fermer
          </button>
        </div>
        <div class="sheet-body">{children}</div>
        {footer && <div class="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
