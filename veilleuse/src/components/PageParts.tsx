import type { ComponentChildren } from 'preact';
import type { DayState } from '../useDay';
import { Icon } from './Icon';
import { ToastSlot } from './Toast';

/** Titre du jour (« Aujourd'hui · vendredi 23 octobre »), Partager et Réglages. */
export function PageHeader({ day, onOpenSettings }: { day: DayState; onOpenSettings: () => void }) {
  return (
    <header class="topbar">
      <div class="topbar-title">
        <h1>{day.title}</h1>
        {day.subtitle && <p class="topbar-sub">{day.subtitle}</p>}
      </div>
      <button type="button" class="head-btn" onClick={day.share}>
        <Icon name="share" size={20} />
        Partager
      </button>
      <button type="button" class="head-btn" onClick={onOpenSettings}>
        <Icon name="settings" size={20} />
        Réglages
      </button>
    </header>
  );
}

/** Bas de page : la saisie aujourd'hui, un retour vers aujourd'hui les autres jours. Le toast s'affiche juste au-dessus. */
export function PageBottom({ day, children }: { day: DayState; children: ComponentChildren }) {
  return (
    <div class="bottom">
      <div class="toast-anchor">
        <ToastSlot />
      </div>
      {day.isToday ? (
        children
      ) : (
        <button type="button" class="action action-wide" onClick={day.backToToday}>
          Revenir à aujourd'hui
          <Icon name="next" size={22} />
        </button>
      )}
    </div>
  );
}

export function EmptyDay({ day }: { day: DayState }) {
  return <p class="empty">{day.isToday ? "Rien pour l'instant aujourd'hui." : "Rien d'enregistré ce jour-là."}</p>;
}
