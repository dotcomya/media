import { Icon, type IconName } from './Icon';

interface Props {
  title: string;
  subtitle?: string;
  /** Bouton discret en haut à droite (Réglages, Partager…). */
  action: { icon: IconName; label: string; onClick: () => void };
}

export function TopBar({ title, subtitle, action }: Props) {
  return (
    <header class="topbar">
      <div>
        <h1>{title}</h1>
        {subtitle && <p class="topbar-sub">{subtitle}</p>}
      </div>
      <button type="button" class="text-btn" onClick={action.onClick}>
        <Icon name={action.icon} size={20} />
        {action.label}
      </button>
    </header>
  );
}
