// Back-office YallaYum : coque, navigation par rôle, sélection de l'acteur.

import './admin.css';
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { DEMO_NOTICE } from '../data/demo';
import { ROLE_LABELS, ROLE_PERMISSIONS, type Permission, type Role } from '../domain/rbac';
import { Icon, type IconName } from '../ui/Icon';
import { Switch } from '../ui/bits';
import { storage } from '../app/store';
import { Access } from './Access';
import { Audit } from './Audit';
import { Contributions } from './Contributions';
import { Content } from './Content';
import { Dashboard } from './Dashboard';
import { Editor } from './Editor';
import { Halal } from './Halal';
import { Import } from './Import';
import { LoyaltyAdmin } from './LoyaltyAdmin';
import { go, refreshFromApp, resetDemo, ui, type Screen } from './model';
import { OwnerHome, OwnerStats } from './Owner';
import { Restaurants } from './Restaurants';
import { Toast, useActor, useData, useUi } from './ui';

interface NavItem {
  screen: Screen;
  label: string;
  icon: IconName;
  /** Le rôle doit avoir au moins un de ces droits pour voir l'entrée. */
  needs?: Permission[];
  badge?: (d: { contributions: number; tasks: number }) => number;
}

const INTERNAL_NAV: NavItem[] = [
  { screen: 'dashboard', label: 'Tableau de bord', icon: 'map' },
  { screen: 'restaurants', label: 'Établissements', icon: 'list', needs: ['restaurant.read'] },
  { screen: 'halal', label: 'Vérification halal', icon: 'shield', needs: ['halal.review', 'halal.evidence.read', 'restaurant.edit'], badge: (d) => d.tasks },
  { screen: 'contributions', label: 'Contributions', icon: 'flag', needs: ['contribution.moderate'], badge: (d) => d.contributions },
  { screen: 'import', label: 'Import CSV', icon: 'plus', needs: ['import.run'] },
  { screen: 'content', label: 'Contenus', icon: 'stack', needs: ['content.edit'] },
  { screen: 'loyalty', label: 'Fidélité', icon: 'gift', needs: ['loyalty.read'] },
  { screen: 'audit', label: 'Journal d’audit', icon: 'history', needs: ['audit.read'] },
  { screen: 'access', label: 'Accès et RGPD', icon: 'lock', needs: ['user.manage', 'privacy.requests'] },
];

const OWNER_NAV: NavItem[] = [
  { screen: 'owner', label: 'Mes établissements', icon: 'pin' },
  { screen: 'owner-stats', label: 'Statistiques', icon: 'eye' },
  { screen: 'loyalty', label: 'Fidélité', icon: 'gift' },
];

const ROLES: Role[] = ['super_admin', 'editor', 'verifier', 'support', 'restaurateur'];

function navFor(role: Role): NavItem[] {
  if (role === 'restaurateur') return OWNER_NAV;
  return INTERNAL_NAV.filter((n) => !n.needs || n.needs.some((p) => ROLE_PERMISSIONS[role].includes(p)));
}

export function Admin() {
  const screen = useUi((u) => u.screen);
  const role = useUi((u) => u.role);
  const mfa = useUi((u) => u.mfa);
  const menuOpen = useUi((u) => u.menuOpen);
  const actor = useActor();
  const openContrib = useData((d) => d.contributions.filter((c) => ['received', 'in_review', 'needs_info'].includes(c.status)).length);
  const openTasks = useData((d) => d.tasks.filter((t) => t.status === 'open').length);
  const nav = navFor(role);

  // Les contributions envoyées depuis l'app (autre onglet) arrivent au retour sur la page.
  useEffect(() => {
    const onFocus = () => refreshFromApp();
    window.addEventListener('focus', onFocus);
    document.title = 'YallaYum · Back-office';
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Écran hors de portée du rôle choisi : retour à l'accueil du rôle.
  useEffect(() => {
    const allowed = new Set<Screen>([...nav.map((n) => n.screen), 'editor']);
    if (!allowed.has(screen)) go(role === 'restaurateur' ? 'owner' : 'dashboard');
  }, [role]);

  const current = nav.find((n) => n.screen === screen)?.screen ?? (screen === 'editor' ? (role === 'restaurateur' ? 'owner' : 'restaurants') : screen);

  return (
    <div class={`admin${menuOpen ? ' menu-open' : ''}`}>
      <a class="skip" href="#a-main">
        Aller au contenu
      </a>
      <header class="a-top">
        <button type="button" class="icon-btn a-menu-btn" aria-label="Menu" aria-expanded={menuOpen} onClick={() => ui.set({ menuOpen: !menuOpen })}>
          <Icon name={menuOpen ? 'close' : 'list'} />
        </button>
        <span class="a-brand">
          <span class="wordmark">Yalla Yum</span>
          <span class="a-brand-sub">Back-office</span>
        </span>
        <span class="grow" />
        <label class="a-role">
          <span class="sr-only">Rôle de démonstration</span>
          <Icon name="user" size={18} />
          <select
            id="a-role"
            value={role}
            onChange={(e) => {
              const r = (e.currentTarget as HTMLSelectElement).value as Role;
              storage.write('admin-role', r);
              ui.set({ role: r, screen: r === 'restaurateur' ? 'owner' : 'dashboard', editingId: undefined });
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r === 'restaurateur' ? 'Restaurateur · Smash Club' : ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        {role !== 'restaurateur' && (
          <span class={`a-mfa${mfa ? ' on' : ''}`} title="Sans MFA, les droits sensibles (publier, valider le halal, importer, annuler…) sont refusés.">
            <Icon name="lock" size={16} />
            <span class="a-mfa-label">Session MFA</span>
            <Switch checked={mfa} onChange={(v) => ui.set({ mfa: v })} label="Session MFA" />
          </span>
        )}
        <span class="a-actor">{actor.name}</span>
      </header>

      <nav class="a-side" aria-label="Sections">
        <ul>
          {nav.map((n) => {
            const badge = n.badge?.({ contributions: openContrib, tasks: openTasks });
            return (
              <li key={n.screen}>
                <button type="button" class="a-nav" aria-current={current === n.screen ? 'page' : undefined} onClick={() => go(n.screen, { preset: undefined })}>
                  <Icon name={n.icon} size={20} />
                  <span class="grow">{n.label}</span>
                  {badge ? <span class="a-badge tnum">{badge}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div class="a-side-foot">
          <a class="btn btn-secondary btn-sm" href={__ARTIFACT__ ? '#' : 'index.html'}>
            <Icon name="back" /> Retour à l’app
          </a>
          <button type="button" class="btn btn-ghost btn-sm" onClick={resetDemo}>
            <Icon name="refresh" /> Réinitialiser la démo
          </button>
          <p class="a-notice">{DEMO_NOTICE}</p>
        </div>
      </nav>
      <div class="a-scrim-menu" onClick={() => ui.set({ menuOpen: false })} />

      <main id="a-main" class="a-main">
        <ScreenView screen={screen} />
      </main>
      <Toast />
    </div>
  );
}

function ScreenView({ screen }: { screen: Screen }): ComponentChildren {
  switch (screen) {
    case 'dashboard':
      return <Dashboard />;
    case 'restaurants':
      return <Restaurants />;
    case 'editor':
      return <Editor />;
    case 'halal':
      return <Halal />;
    case 'contributions':
      return <Contributions />;
    case 'import':
      return <Import />;
    case 'content':
      return <Content />;
    case 'loyalty':
      return <LoyaltyAdmin />;
    case 'audit':
      return <Audit />;
    case 'access':
      return <Access />;
    case 'owner':
      return <OwnerHome />;
    case 'owner-stats':
      return <OwnerStats />;
  }
}
