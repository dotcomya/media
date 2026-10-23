import { Icon } from './Icon';

interface Props {
  title: string;
  subtitle?: string;
  onOpenSettings: () => void;
}

export function TopBar({ title, subtitle, onOpenSettings }: Props) {
  return (
    <header class="topbar">
      <div>
        <h1>{title}</h1>
        {subtitle && <p class="topbar-sub">{subtitle}</p>}
      </div>
      <button type="button" class="text-btn" onClick={onOpenSettings}>
        <Icon name="settings" size={20} />
        Réglages
      </button>
    </header>
  );
}
