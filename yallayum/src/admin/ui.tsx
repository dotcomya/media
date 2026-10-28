// Briques d'interface du back-office : pastilles d'état, chiffres-clés,
// boîtes de dialogue, champs. Chaque état se lit par une forme et un texte,
// jamais par la seule couleur.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { hoursConfidence, type HoursConfidence } from '../domain/hours';
import { OPERATING_LABELS, PUBLICATION_LABELS } from '../domain/publication';
import { can, type Permission, type Scope } from '../domain/rbac';
import type { OperatingStatus, PublicationStatus, Restaurant } from '../domain/types';
import { Icon, type IconName } from '../ui/Icon';
import { useStore } from '../app/store';
import { actorFor, data, todayIso, ui, type AdminData, type UiState } from './model';

export function useData<S>(select: (d: AdminData) => S): S {
  return useStore(data, select);
}

export function useUi<S>(select: (u: UiState) => S): S {
  return useStore(ui, select);
}

export function useActor() {
  const role = useUi((u) => u.role);
  const mfa = useUi((u) => u.mfa);
  return actorFor({ role, mfa });
}

/** Le droit est-il accordé ? L'interface s'en sert pour masquer, chaque action le re-vérifie. */
export function useCan(permission: Permission, scope?: Scope): boolean {
  const actor = useActor();
  return can(actor, permission, scope);
}

type Tone = 'ok' | 'info' | 'warn' | 'bad' | 'muted';

/** Pastille : une forme (●, ◐, ◌, ‖, ✕…) + un texte, dans une teinte sémantique. */
export function Pill({ tone, glyph, children, title }: { tone: Tone; glyph: string; children: ComponentChildren; title?: string }) {
  return (
    <span class={`pill pill-${tone}`} title={title}>
      <span class="glyph" aria-hidden="true">
        {glyph}
      </span>
      {children}
    </span>
  );
}

const PUB: Record<PublicationStatus, [Tone, string]> = {
  draft: ['muted', '◌'],
  in_review: ['info', '◐'],
  published: ['ok', '●'],
  suspended: ['warn', '‖'],
  archived: ['muted', '▢'],
};

export function PublicationPill({ status }: { status: PublicationStatus }) {
  const [tone, glyph] = PUB[status];
  return (
    <Pill tone={tone} glyph={glyph}>
      {PUBLICATION_LABELS[status]}
    </Pill>
  );
}

const OP: Record<OperatingStatus, [Tone, string]> = {
  operating: ['ok', '●'],
  temporarily_closed: ['warn', '◑'],
  permanently_closed: ['bad', '✕'],
  moved: ['info', '→'],
};

export function OperatingPill({ status }: { status: OperatingStatus }) {
  const [tone, glyph] = OP[status];
  return (
    <Pill tone={tone} glyph={glyph}>
      {OPERATING_LABELS[status]}
    </Pill>
  );
}

const HOURS: Record<HoursConfidence, [Tone, string, string]> = {
  confirmed: ['ok', '●', 'Confirmés'],
  stale: ['warn', '◐', 'Anciens'],
  none: ['bad', '◌', 'Absents'],
};

export function HoursPill({ r }: { r: Restaurant }) {
  const c = hoursConfidence(r.hours, todayIso());
  const [tone, glyph, label] = HOURS[c];
  return (
    <Pill tone={tone} glyph={glyph} title={r.hours?.verifiedAt ? `Vérifiés le ${r.hours.verifiedAt}` : 'Aucun horaire saisi'}>
      {label}
    </Pill>
  );
}

export function Kpi({
  value,
  label,
  definition,
  tone,
  onClick,
  example,
}: {
  value: number | string;
  label: string;
  definition: string;
  tone?: Tone;
  onClick?: () => void;
  example?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div class={`kpi${tone ? ` kpi-${tone}` : ''}`}>
      <button type="button" class="kpi-main" onClick={onClick} disabled={!onClick} title={definition}>
        <span class="kpi-value tnum">{value}</span>
        <span class="kpi-label">{label}</span>
        {example && <span class="example-tag">Exemple</span>}
      </button>
      <button type="button" class="kpi-info" aria-expanded={open} aria-label={`Définition : ${label}`} onClick={() => setOpen(!open)}>
        <Icon name="info" size={16} />
      </button>
      {open && <p class="kpi-def">{definition}</p>}
    </div>
  );
}

export function Section({ title, actions, children, sub }: { title: string; actions?: ComponentChildren; children: ComponentChildren; sub?: string }) {
  return (
    <section class="a-section">
      <header class="a-section-head">
        <div>
          <h2>{title}</h2>
          {sub && <p class="sub">{sub}</p>}
        </div>
        {actions && <div class="a-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function PageHead({ title, eyebrow, children }: { title: string; eyebrow?: string; children?: ComponentChildren }) {
  return (
    <header class="a-pagehead">
      <div>
        {eyebrow && <span class="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
      </div>
      {children && <div class="a-actions">{children}</div>}
    </header>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('input, textarea, select, button.btn')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="a-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <div class="a-scrim" onClick={onClose} />
      <div class={`a-dialog-panel${wide ? ' wide' : ''}`} ref={panel}>
        <header>
          <h2>{title}</h2>
          <button type="button" class="icon-btn" onClick={onClose} aria-label="Fermer">
            <Icon name="close" />
          </button>
        </header>
        <div class="a-dialog-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

/** Demande un motif avant une décision sensible (suspension, rejet…). */
export function ReasonDialog({
  title,
  label = 'Motif',
  confirm,
  required = true,
  onConfirm,
  onClose,
  danger,
  children,
}: {
  title: string;
  label?: string;
  confirm: string;
  required?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  danger?: boolean;
  children?: ComponentChildren;
}) {
  const [reason, setReason] = useState('');
  const ok = !required || reason.trim().length >= 3;
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" class="btn btn-secondary btn-sm" onClick={onClose}>
            Annuler
          </button>
          <button type="button" class={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={!ok} onClick={() => onConfirm(reason.trim())}>
            {confirm}
          </button>
        </>
      }
    >
      {children}
      <label class="field">
        {label}
        {required && <span class="help">Obligatoire : il figure au journal d’audit.</span>}
        <textarea id="reason-input" class="input" value={reason} onInput={(e) => setReason((e.currentTarget as HTMLTextAreaElement).value)} />
      </label>
    </Dialog>
  );
}

export function Field({ label, help, error, children, wide }: { label: string; help?: string; error?: string; children: ComponentChildren; wide?: boolean }) {
  return (
    <label class={`field${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      {help && <span class="help">{help}</span>}
      {children}
      {error && <span class="error-text">{error}</span>}
    </label>
  );
}

export function Empty({ icon = 'check', title, text }: { icon?: IconName; title: string; text?: string }) {
  return (
    <div class="a-empty">
      <Icon name={icon} size={28} />
      <strong>{title}</strong>
      {text && <span>{text}</span>}
    </div>
  );
}

export function Denied({ what }: { what: string }) {
  return (
    <div class="notice" role="note">
      <Icon name="lock" />
      <span>{what}</span>
    </div>
  );
}

/** Texte copiable : bouton « Copier » avec repli sur la sélection. */
export function CopyBox({ text, rows = 10 }: { text: string; rows?: number }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [done, setDone] = useState(false);
  return (
    <div class="copybox">
      <textarea ref={area} class="input mono" rows={rows} readOnly value={text} aria-label="Contenu à copier" />
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        onClick={() => {
          navigator.clipboard
            .writeText(text)
            .then(() => setDone(true))
            .catch(() => {
              area.current?.select();
              setDone(false);
            });
        }}
      >
        <Icon name="copy" /> {done ? 'Copié' : 'Copier'}
      </button>
    </div>
  );
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export function Toast() {
  const t = useUi((u) => u.toast);
  const [shown, setShown] = useState<number | undefined>();
  useEffect(() => {
    if (!t) return;
    setShown(t.nonce);
    const id = setTimeout(() => setShown(undefined), 3600);
    return () => clearTimeout(id);
  }, [t?.nonce]);
  if (!t || shown !== t.nonce) return null;
  return (
    <div class={`a-toast${t.tone ? ` tone-${t.tone}` : ''}`} role="status">
      {t.text}
    </div>
  );
}
