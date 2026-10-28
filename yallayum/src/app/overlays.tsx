// Feuilles modales : itinéraire, « pourquoi ce résultat », méthode halal,
// contributions, compte, confidentialité.

import { useState } from 'preact/hooks';
import { CERTIFIERS } from '../data/demo';
import { distanceBucket } from '../domain/analytics';
import { distanceMeters } from '../domain/geo';
import { TRUST_LEVELS, TRUST_ORDER } from '../domain/halal';
import { CONTRIBUTION_LABELS, validateSubmission, type ContributionKind } from '../domain/moderation';
import { planAccountDeletion } from '../domain/privacy';
import { rankOne, type Signal } from '../domain/ranking';
import { Icon } from '../ui/Icon';
import { Modal, Switch, TrustBadge } from '../ui/bits';
import { storage, useStore } from './store';
import {
  closeOverlay,
  now,
  restaurantById,
  setConsent,
  store,
  submitContribution,
  toast,
  track,
  type NavApp,
} from './state';

// ─── Itinéraire ─────────────────────────────────────────────────────────────

export const NAV_APPS: { id: NavApp; label: string; url: (lat: number, lng: number, name: string) => string }[] = [
  { id: 'apple', label: 'Plans (Apple)', url: (lat, lng, name) => `https://maps.apple.com/?daddr=${lat},${lng}&q=${encodeURIComponent(name)}` },
  { id: 'google', label: 'Google Maps', url: (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` },
  { id: 'waze', label: 'Waze', url: (lat, lng) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes` },
  { id: 'citymapper', label: 'Citymapper', url: (lat, lng, name) => `https://citymapper.com/directions?endcoord=${lat},${lng}&endname=${encodeURIComponent(name)}` },
];

export function RouteSheet({ restaurantId }: { restaurantId: string }) {
  const r = restaurantById(restaurantId)!;
  const pref = useStore(store, (s) => s.prefs.navApp);
  const position = useStore(store, (s) => s.location.position);
  const [remember, setRemember] = useState(!!pref);
  const go = (app: (typeof NAV_APPS)[number]) => {
    track('route_clicked', { restaurant_id: r.id, app: app.id, distance: distanceBucket(position ? distanceMeters(position, r.location) : undefined) });
    if (remember) {
      const prefs = { ...store.get().prefs, navApp: app.id };
      store.set({ prefs });
      storage.write('prefs', prefs);
    }
    closeOverlay();
  };
  const ordered = pref ? [...NAV_APPS].sort((a, b) => Number(b.id === pref) - Number(a.id === pref)) : NAV_APPS;
  return (
    <Modal title="Y aller avec…" onClose={closeOverlay}>
      <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: '0.9375rem' }}>
        Ton application de navigation calcule le vrai temps de trajet. YallaYum ne suit pas ton déplacement.
      </p>
      <div class="rows">
        {ordered.map((app) => (
          <a key={app.id} class="row" href={app.url(r.location.lat, r.location.lng, r.name)} target="_blank" rel="noopener" onClick={() => go(app)}>
            <Icon name="route" />
            <span class="grow">
              {app.label}
              {pref === app.id && <span class="small">Ton choix habituel</span>}
            </span>
            <Icon name="external" class="chev" />
          </a>
        ))}
      </div>
      <div class="switch-row">
        <span class="grow">Se souvenir de mon choix</span>
        <Switch checked={remember} onChange={setRemember} label="Se souvenir de mon choix" />
      </div>
    </Modal>
  );
}

// ─── Pourquoi ce résultat ───────────────────────────────────────────────────

const SIGNAL_LABELS: Record<Signal, string> = {
  text: 'Correspondance avec ta recherche',
  proximity: 'Proximité',
  occasion: 'Adéquation à ton envie',
  openness: 'Ouvert maintenant',
  completeness: 'Fiche complète',
  freshness: 'Fraîcheur de la vérification',
  editorial: 'Choix de la rédaction',
};

export function WhySheet({ restaurantId }: { restaurantId: string }) {
  const s = store.get();
  const r = restaurantById(restaurantId)!;
  const ranked =
    s.response.results.find((x) => x.restaurant.id === restaurantId) ??
    rankOne(r, { now: now(), origin: s.origin, originIsUser: s.originIsUser, text: '', dishTerms: [], occasions: s.filters.occasions, certifiers: CERTIFIERS });
  const max = Math.max(...ranked.reasons.map((x) => x.contribution), 0.01);
  return (
    <Modal title="Pourquoi ce résultat ?" onClose={closeOverlay}>
      <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: '0.9375rem' }}>
        L’adresse respecte tous tes filtres. Son rang vient de ces critères, pondérés par l’équipe produit. Le paiement n’en fait pas partie.
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {[...ranked.reasons]
          .sort((a, b) => b.contribution - a.contribution)
          .map((x) => (
            <div key={x.signal}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 650 }}>
                <span>{SIGNAL_LABELS[x.signal]}</span>
              </div>
              <div class="progress" style={{ marginTop: 6 }} aria-hidden="true">
                <div style={{ width: `${(x.contribution / max) * 100}%` }} />
              </div>
              {x.text && <div style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', marginTop: 4 }}>{x.text}</div>}
            </div>
          ))}
      </div>
      {ranked.sponsored && (
        <div class="notice">
          <Icon name="info" />
          <span>Cette position est sponsorisée : l’emplacement est payé, il est signalé et réservé aux adresses qui respectent déjà tes filtres.</span>
        </div>
      )}
    </Modal>
  );
}

// ─── Méthode de vérification halal ──────────────────────────────────────────

export function HalalHelpSheet() {
  return (
    <Modal title="Comment on vérifie" onClose={closeOverlay} full>
      <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.5 }}>
        Chaque adresse affiche un niveau de preuve, jamais une promesse de certitude. Le niveau se calcule à partir de preuves datées : quand une preuve expire, le badge change le jour même.
      </p>
      {TRUST_ORDER.map((lvl) => (
        <div key={lvl} style={{ display: 'grid', gap: 6 }}>
          <TrustBadge status={{ level: lvl }} large />
          <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: '0.9375rem', lineHeight: 1.5 }}>{TRUST_LEVELS[lvl].explanation}</p>
        </div>
      ))}
      <div class="criteria">
        <strong>Ce qu’on ne fait jamais</strong>
        <span>Vendre un niveau : une adresse sponsorisée est vérifiée comme les autres.</span>
        <span>Afficher « certifié » sur une simple déclaration du restaurant.</span>
        <span>Publier un signalement sans l’avoir vérifié.</span>
        <span>Garder un badge dont la preuve a expiré.</span>
      </div>
      <div class="criteria">
        <strong>Durées de validité (paramétrables)</strong>
        <span>Certification : jusqu’à la date de fin du certificat.</span>
        <span>Vérification de l’équipe : 12 mois.</span>
        <span>Déclaration du restaurant : 12 mois.</span>
      </div>
      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink-3)' }}>Organismes de la démonstration : {CERTIFIERS.map((c) => c.name).join(', ')}.</p>
    </Modal>
  );
}

// ─── Contributions ──────────────────────────────────────────────────────────

const REPORT_KINDS: ContributionKind[] = ['closed_permanently', 'moved', 'hours', 'halal_info', 'photos', 'contact', 'duplicate', 'other'];

export function ContributeSheet({ restaurantId, preset }: { restaurantId?: string; preset?: ContributionKind }) {
  const r = restaurantId ? restaurantById(restaurantId) : undefined;
  const [kind, setKind] = useState<ContributionKind>(preset ?? (r ? 'hours' : 'new_restaurant'));
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [halalSource, setHalalSource] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const isNew = kind === 'new_restaurant';

  const send = () => {
    const payload: Record<string, unknown> = isNew ? { name, address } : kind === 'halal_info' ? { halal: halalSource } : {};
    const c = { kind, restaurantId: r?.id, payload, halalSource: halalSource || undefined, message };
    const errs = validateSubmission(c);
    if (kind === 'halal_info' && !halalSource.trim()) errs.push('Indique d’où vient l’information (certificat affiché, échange avec le gérant…).');
    setErrors(errs);
    if (errs.length) return;
    submitContribution(c);
    closeOverlay();
  };

  return (
    <Modal
      title={isNew ? 'Proposer une adresse' : `Signaler · ${r?.name ?? ''}`}
      onClose={closeOverlay}
      full
      footer={
        <button type="button" class="btn btn-primary btn-block" onClick={send}>
          Envoyer
        </button>
      }
    >
      <div class="notice info">
        <Icon name="shield" />
        <span>Rien n’est publié automatiquement : l’équipe vérifie chaque contribution avant de modifier une fiche.</span>
      </div>
      {!isNew && (
        <div class="field-group">
          <h3>Quel est le problème ?</h3>
          <div class="wrap-chips">
            {REPORT_KINDS.map((k) => (
              <button key={k} type="button" class="chip flat" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {CONTRIBUTION_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
      )}
      {isNew && (
        <>
          <label class="field">
            Nom du restaurant
            <input id="c-name" class="input" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} autoComplete="off" />
          </label>
          <label class="field">
            Adresse
            <span class="help">Rue et ville suffisent ; on géolocalise nous-mêmes.</span>
            <input id="c-address" class="input" value={address} onInput={(e) => setAddress((e.currentTarget as HTMLInputElement).value)} autoComplete="off" />
          </label>
        </>
      )}
      {(isNew || kind === 'halal_info') && (
        <label class="field">
          D’où vient l’information halal ?
          <span class="help">Certificat affiché, échange avec le gérant, site de l’organisme… Ça nous aide à vérifier.</span>
          <input id="c-source" class="input" value={halalSource} onInput={(e) => setHalalSource((e.currentTarget as HTMLInputElement).value)} />
        </label>
      )}
      <label class="field">
        {isNew ? 'Autres infos (facultatif)' : 'Détails'}
        <textarea id="c-message" class="input" value={message} onInput={(e) => setMessage((e.currentTarget as HTMLTextAreaElement).value)} maxLength={2000} />
      </label>
      {errors.length > 0 && (
        <div role="alert" style={{ display: 'grid', gap: 4 }}>
          {errors.map((e) => (
            <span key={e} class="error-text">
              {e}
            </span>
          ))}
        </div>
      )}
      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink-3)' }}>Pas besoin de compte. Avec un compte, tu suis le traitement de ton signalement.</p>
    </Modal>
  );
}

// ─── Compte (progressif) ────────────────────────────────────────────────────

export function AccountSheet({ reason }: { reason: string }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const signIn = (method: string, mail: string) => {
    const account = { email: mail || `${method}@demo`, since: Date.now() };
    store.set({ account });
    storage.write('account', account);
    toast('Compte créé. Tes favoris sont synchronisés.');
    closeOverlay();
  };
  return (
    <Modal title="Créer un compte" onClose={closeOverlay}>
      <p style={{ margin: 0, color: 'var(--ink-2)' }}>{reason}</p>
      <div class="stack">
        <button type="button" class="btn btn-primary" onClick={() => signIn('apple', '')}>
          Continuer avec Apple
        </button>
        <button type="button" class="btn btn-secondary" onClick={() => signIn('google', '')}>
          Continuer avec Google
        </button>
      </div>
      <div style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--ink-3)' }}>ou par e-mail, sans mot de passe</div>
      {sent ? (
        <div class="notice info">
          <Icon name="check" />
          <span>Lien de connexion envoyé à {email} (simulation). <button type="button" style={{ textDecoration: 'underline', fontWeight: 700 }} onClick={() => signIn('email', email)}>Ouvrir le lien</button></span>
        </div>
      ) : (
        <form
          class="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (/\S+@\S+\.\S+/.test(email)) setSent(true);
          }}
        >
          <label class="field">
            E-mail
            <input id="acc-email" class="input" type="email" value={email} onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} autoComplete="email" />
          </label>
          <button type="submit" class="btn btn-secondary">
            Recevoir un lien
          </button>
        </form>
      )}
      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink-3)' }}>
        On ne te demande ni ta religion, ni ton âge, ni tes contacts. Tu peux supprimer ton compte à tout moment depuis Profil.
      </p>
    </Modal>
  );
}

// ─── Confidentialité ────────────────────────────────────────────────────────

export function PrivacySheet() {
  const consent = useStore(store, (s) => s.consent);
  return (
    <Modal title="Confidentialité" onClose={closeOverlay} full>
      <div class="switch-row">
        <span class="grow">
          Mesure d’audience détaillée
          <span class="small">Quelles fiches s’affichent et dans quel ordre, pour améliorer le classement. Désactivée par défaut.</span>
        </span>
        <Switch checked={consent.analytics} onChange={(v) => setConsent({ analytics: v })} label="Mesure d’audience détaillée" />
      </div>
      <div class="switch-row">
        <span class="grow">
          Historique de recherche
          <span class="small">Gardé sur ce téléphone pour te reproposer tes recherches. Effacé si tu désactives.</span>
        </span>
        <Switch checked={consent.history} onChange={(v) => setConsent({ history: v })} label="Historique de recherche" />
      </div>
      <div class="criteria">
        <strong>Ce qui est collecté sans consentement</strong>
        <span>Une mesure d’audience anonyme et strictement nécessaire (ouvertures, recherches sans résultat, clics vers l’itinéraire), sans identifiant publicitaire ni recoupement.</span>
        <span>Aucune position précise : seulement une tranche de distance (« moins de 500 m »).</span>
        <span>Aucun SDK publicitaire.</span>
      </div>
      <div class="criteria">
        <strong>Ta position</strong>
        <span>Demandée seulement quand tu touches « Autour de moi » ou « Utiliser ma position ». Jamais en arrière-plan, jamais stockée sur nos serveurs.</span>
      </div>
    </Modal>
  );
}

export function DeletionSheet() {
  const s = store.get();
  const plan = planAccountDeletion({
    userId: s.account?.email ?? 'invité',
    hasFavorites: s.favorites.length > 0,
    hasCollections: false,
    searchHistory: s.recent.length,
    contributions: s.contributions.length,
    loyaltyCardId: s.loyalty.activated ? s.loyalty.cardId : undefined,
    loyaltyTransactions: s.loyalty.ledger.length,
    openDisputes: 0,
    devices: 1,
  });
  const [confirm, setConfirm] = useState('');
  return (
    <Modal
      title="Supprimer mes données"
      onClose={closeOverlay}
      full
      footer={
        <button
          type="button"
          class="btn btn-block"
          style={{ background: 'var(--bad)', color: '#fff' }}
          disabled={confirm.trim().toUpperCase() !== 'SUPPRIMER'}
          onClick={() => {
            storage.clear();
            toast('Données supprimées de ce téléphone. Rechargement…');
            setTimeout(() => location.reload(), 900);
          }}
        >
          Supprimer définitivement
        </button>
      }
    >
      <p style={{ margin: 0, color: 'var(--ink-2)' }}>Voici exactement ce qui se passe :</p>
      <div class="rows">
        {plan.map((step) => (
          <div key={step.what} class="row">
            <Icon name={step.action === 'delete' ? 'trash' : step.action === 'anonymize' ? 'eye' : 'lock'} />
            <span class="grow">
              {step.what}
              <span class="small">
                {step.action === 'delete' ? 'Supprimé' : step.action === 'anonymize' ? 'Anonymisé' : `Conservé ${Math.round((step.retainDays ?? 0) / 365)} an(s)`} — {step.why}
              </span>
            </span>
          </div>
        ))}
      </div>
      <label class="field">
        Tape SUPPRIMER pour confirmer
        <input id="del-confirm" class="input" value={confirm} onInput={(e) => setConfirm((e.currentTarget as HTMLInputElement).value)} autoComplete="off" />
      </label>
    </Modal>
  );
}
