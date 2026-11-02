// Petits composants partagés : visuel, badge de confiance, état d'ouverture,
// feuille modale, interrupteur.

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { TRUST_LEVELS, type HalalStatus, type TrustLevel } from '../domain/halal';
import type { OpenStatus } from '../domain/hours';
import { cuisine } from '../domain/taxonomy';
import type { Media, Restaurant } from '../domain/types';
import { Icon, type IconName } from './Icon';
import { renderIllustration } from './illustration';

export function hueOf(r: Pick<Restaurant, 'cuisines'>): number {
  return cuisine(r.cuisines[0])?.hue ?? 192;
}

export function iconOf(r: Pick<Restaurant, 'cuisines'>): IconName {
  return cuisine(r.cuisines[0])?.icon ?? 'plate';
}

interface IllustrationProps {
  media?: Media;
  hue: number;
  width: number;
  height: number;
  /** Masquer la mention (vignettes minuscules) : la fiche la montre toujours. */
  tag?: boolean;
}

/** Visuel génératif + mention « Illustration » : jamais confondu avec une photo. */
export function Illustration({ media, hue, width, height, tag = true }: IllustrationProps) {
  const src = useMemo(
    () => renderIllustration({ seed: media?.seed ?? 7, hue, subject: media?.subject ?? 'dish', width, height }),
    [media?.seed, hue, media?.subject, width, height],
  );
  return (
    <>
      <img src={src} alt={media?.alt ?? 'Illustration générique'} width={width} height={height} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} draggable={false} />
      {tag && <span class="illus-tag">Illustration</span>}
    </>
  );
}

const TRUST_ICON: Record<TrustLevel, IconName> = {
  certified: 'seal',
  team_verified: 'shield',
  declared: 'speech',
  unconfirmed: 'question',
};

export function TrustBadge({ status, large }: { status: Pick<HalalStatus, 'level'>; large?: boolean }) {
  const info = TRUST_LEVELS[status.level];
  return (
    <span class={`trust trust-${status.level}${large ? ' lg' : ''}`} title={info.label}>
      <Icon name={TRUST_ICON[status.level]} />
      {large ? info.label : info.short}
    </span>
  );
}

export function trustIcon(level: TrustLevel): IconName {
  return TRUST_ICON[level];
}

export function OpenLabel({ status, short }: { status: OpenStatus; short?: boolean }) {
  const cls =
    status.state === 'unknown'
      ? 'is-unknown'
      : status.state === 'open'
        ? status.closingSoon
          ? 'is-soon'
          : 'is-open'
        : 'is-closed';
  let text = status.label;
  if (short) {
    if (status.state === 'open') text = status.closingSoon ? `Ferme à ${status.closesAt}` : `Ouvert · ${status.closesAt}`;
    else if (status.state === 'unknown') text = 'Horaires inconnus';
    else if (status.reason === 'temporarily_closed') text = 'Fermé temporairement';
    else if (status.nextOpening) {
      const { dayOffset, time } = status.nextOpening;
      text = dayOffset === 0 ? `Ouvre à ${time}` : dayOffset === 1 ? `Ouvre demain ${time}` : 'Fermé';
    }
    else text = 'Fermé';
    if (status.state === 'open' && status.confidence === 'stale') text += ' ?';
  }
  return <span class={`open-state ${cls}`}>{text}</span>;
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  full?: boolean;
  label?: string;
}

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';

/**
 * Feuille modale accessible : le focus y entre, y reste (Tab boucle), et
 * revient à l'élément d'origine à la fermeture. Échap ferme.
 */
export function Modal({ title, onClose, children, footer, full }: ModalProps) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = root.current?.querySelector<HTMLElement>('.modal-panel');
    const first = panel?.querySelector<HTMLElement>('input, textarea') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const [a, b] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        b.focus();
      } else if (!e.shiftKey && document.activeElement === b) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <div ref={root} class={`modal${full ? ' is-full' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div class="modal-scrim" onClick={onClose} />
      <div class="modal-panel">
        <div class="bsheet-grab" aria-hidden="true" />
        <div class="modal-head">
          <h2>{title}</h2>
          <button type="button" class="icon-btn" onClick={onClose} aria-label="Fermer">
            <Icon name="close" />
          </button>
        </div>
        <div class="modal-body">{children}</div>
        {footer && <div class="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} class="switch" onClick={() => onChange(!checked)} />;
}

export function Chip({
  pressed,
  onClick,
  children,
  icon,
  flat,
  label,
}: {
  pressed?: boolean;
  onClick: () => void;
  children: ComponentChildren;
  icon?: IconName;
  flat?: boolean;
  label?: string;
}) {
  return (
    <button type="button" class={`chip${flat ? ' flat' : ''}`} aria-pressed={pressed === undefined ? undefined : pressed} onClick={onClick} aria-label={label}>
      {icon && <Icon name={icon} />}
      {children}
      {pressed && !icon && <Icon name="check" />}
    </button>
  );
}
