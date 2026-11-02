// Avantages : la carte de fidélité transversale. Module en pilote, paramètres
// de démonstration signalés comme tels ; aucune règle économique présentée
// comme acquise.

import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { LOYALTY_PARTNERS } from '../../data/demo';
import { balance, DEMO_PROGRAM, nextReward, REJECT_MESSAGES, secondsLeft, voucherState } from '../../domain/loyalty';
import { formatDate } from '../../domain/format';
import { Icon } from '../../ui/Icon';
import { useStore } from '../store';
import {
  activateCard,
  currentToken,
  now,
  openOverlay,
  redeemReward,
  restaurantById,
  showCollectionOnMap,
  simulateScan,
  store,
  track,
} from '../state';

function Qr({ token }: { token: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(token);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }, [token]);
  return <div class="qr" role="img" aria-label="QR de ta carte, renouvelé toutes les 30 secondes" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Ring({ fraction }: { fraction: number }) {
  const r = 100;
  const c = 2 * Math.PI * r;
  return (
    <svg class="ring" viewBox="0 0 212 212" aria-hidden="true">
      <circle cx="106" cy="106" r={r} fill="none" stroke="var(--surface-3)" stroke-width="6" />
      <circle
        cx="106"
        cy="106"
        r={r}
        fill="none"
        stroke="url(#yyring)"
        stroke-width="6"
        stroke-linecap="round"
        stroke-dasharray={c}
        stroke-dashoffset={c * (1 - fraction)}
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
      <defs>
        <linearGradient id="yyring" x1="0" x2="1">
          <stop offset="0" stop-color="#36c6db" />
          <stop offset="1" stop-color="#4f8ef0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Loyalty() {
  const loyalty = useStore(store, (s) => s.loyalty);
  const account = useStore(store, (s) => s.account);
  const [tick, setTick] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    track('loyalty_card_opened', { activated: loyalty.activated });
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const at = now();
  const token = currentToken(at);
  const left = secondsLeft(at, DEMO_PROGRAM);
  const points = balance(loyalty.ledger, loyalty.cardId);
  const next = nextReward(DEMO_PROGRAM, points);
  void tick;

  const scan = (mode: 'fresh' | 'replay' | 'expired') => {
    setSyncing(true);
    setTimeout(() => {
      simulateScan(LOYALTY_PARTNERS[0].id, mode);
      setSyncing(false);
    }, 900);
  };

  const last = loyalty.last;

  return (
    <div class="screen" aria-label="Avantages">
      <header class="screen-head">
        <span class="eyebrow">Carte de fidélité commune</span>
        <h1>Avantages</h1>
      </header>

      {DEMO_PROGRAM.provisional && (
        <div class="pad" style={{ marginBottom: 12 }}>
          <span class="demo-flag">
            <Icon name="beaker" size={14} /> Pilote · paramètres de démonstration, à valider avec les partenaires
          </span>
        </div>
      )}

      <div class="yy-card" aria-label={`Carte YallaYum, ${points} points`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span class="wordmark">Yalla Yum</span>
          <Icon name="gift" size={26} />
        </div>
        <div class="pts" aria-live="polite">
          {loyalty.activated ? points : '—'}
          <small>points</small>
        </div>
        <div class="holder">
          <span>{account ? account.email : 'Invité'}</span>
          <span class="tnum">{loyalty.cardId.toUpperCase()}</span>
        </div>
      </div>

      {!loyalty.activated ? (
        <div class="pad stack" style={{ marginTop: 18 }}>
          <p style={{ margin: 0, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            Une seule carte pour tous les restaurants partenaires : tu cumules des points à chaque passage et tu les échanges contre des avantages. Il faut un compte pour ne pas perdre tes points.
          </p>
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => {
              if (!store.get().account) openOverlay({ kind: 'account', reason: 'Ta carte de fidélité est liée à ton compte : tes points te suivent si tu changes de téléphone.' });
              else activateCard();
            }}
          >
            {account ? 'Activer ma carte' : 'Créer un compte et activer'}
          </button>
        </div>
      ) : (
        <>
          <div class="qr-wrap" style={{ marginTop: 18 }}>
            <div class="qr-box">
              <Ring fraction={left / DEMO_PROGRAM.qrStepSeconds} />
              <div style={{ opacity: syncing ? 0.3 : 1, transition: 'opacity 200ms' }}>
                <Qr token={token} />
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--ink-2)' }}>
              À montrer en caisse · nouveau code dans <span class="tnum">{Math.ceil(left)} s</span>
              <br />
              <span style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>Une capture d’écran ne fonctionne pas : le code change.</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" class="btn btn-secondary btn-sm" onClick={() => scan('fresh')} disabled={syncing}>
                <Icon name="qr" /> Simuler un passage en caisse
              </button>
            </div>
            {syncing && (
              <div class="notice info" role="status" style={{ width: '100%' }}>
                <Icon name="refresh" />
                <span>Synchronisation avec la caisse…</span>
              </div>
            )}
            {!syncing && last && (
              <div class={`notice ${last.status === 'credited' ? 'info' : last.status === 'duplicate' ? '' : 'bad'}`} role="status" style={{ width: '100%' }}>
                <Icon name={last.status === 'credited' ? 'check' : 'info'} />
                <span>
                  {last.status === 'credited' && (
                    <>
                      <strong>+{last.tx.points} points</strong> chez {restaurantById(LOYALTY_PARTNERS.find((p) => p.id === last.tx.partnerId)?.restaurantId ?? '')?.name}.
                    </>
                  )}
                  {last.status === 'duplicate' && (
                    <>
                      <strong>Déjà enregistré.</strong> Ce code a déjà été scanné : aucun point en double.
                    </>
                  )}
                  {last.status === 'rejected' && (
                    <>
                      <strong>Refusé.</strong> {REJECT_MESSAGES[last.reason]}
                    </>
                  )}
                </span>
              </div>
            )}
          </div>

          <div class="pad stack" style={{ marginTop: 18 }}>
            {next.reward ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 650 }}>
                  <span>{next.reward.label}</span>
                  <span class="tnum">
                    {points} / {next.reward.threshold}
                  </span>
                </div>
                <div class="progress" style={{ marginTop: 8 }}>
                  <div style={{ width: `${next.progress * 100}%` }} />
                </div>
              </div>
            ) : (
              <div class="notice info">
                <Icon name="gift" />
                <span>Toutes les récompenses sont débloquées.</span>
              </div>
            )}
            <div class="rows">
              {DEMO_PROGRAM.rewards.map((rw) => (
                <div key={rw.id} class="row">
                  <Icon name="gift" />
                  <span class="grow">
                    {rw.label}
                    <span class="small">
                      {rw.threshold} points · offert par {rw.fundedBy === 'partner' ? 'le restaurant' : rw.fundedBy === 'yallayum' ? 'YallaYum' : 'les deux'} · valable {rw.validityDays} jours
                    </span>
                  </span>
                  <button type="button" class="btn btn-sm btn-secondary" disabled={points < rw.threshold} onClick={() => redeemReward(rw.id)}>
                    Échanger
                  </button>
                </div>
              ))}
            </div>
            {loyalty.vouchers.length > 0 && (
              <div class="rows">
                {loyalty.vouchers.map((v) => {
                  const st = voucherState(v, at);
                  return (
                    <div key={v.id} class="row">
                      <Icon name="check" />
                      <span class="grow">
                        {DEMO_PROGRAM.rewards.find((x) => x.id === v.rewardId)?.label}
                        <span class="small">{st === 'available' ? `Disponible jusqu’au ${formatDate(v.expiresAt.slice(0, 10))}` : st === 'used' ? 'Utilisé' : 'Expiré'}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div class="list-section">
            <h2>Historique</h2>
          </div>
          {loyalty.ledger.length === 0 ? (
            <p class="pad" style={{ margin: 0, color: 'var(--ink-3)' }}>
              Aucun point pour l’instant. Ton premier passage chez un partenaire apparaîtra ici.
            </p>
          ) : (
            <div class="tx-list">
              {[...loyalty.ledger].reverse().map((tx) => (
                <div key={tx.id} class="tx">
                  <Icon name={tx.kind === 'earn' ? 'plus' : tx.kind === 'reversal' ? 'refresh' : 'gift'} />
                  <span class="grow">
                    {tx.kind === 'earn' ? restaurantById(LOYALTY_PARTNERS.find((p) => p.id === tx.partnerId)?.restaurantId ?? '')?.name : tx.kind === 'redeem' ? 'Échange' : 'Annulation'}
                    <span class="small">{new Date(tx.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </span>
                  <span class={`pts ${tx.points >= 0 ? 'plus' : 'minus'}`}>
                    {tx.points >= 0 ? '+' : ''}
                    {tx.points}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div class="list-section">
        <h2>Comment ça marche</h2>
        <div class="criteria">
          <span>1. En caisse, montre ta carte : le restaurant la scanne avec son téléphone.</span>
          <span>2. Le passage est crédité une fois ({DEMO_PROGRAM.earn.mode === 'per_visit' ? `${DEMO_PROGRAM.earn.points} points par visite` : 'selon le montant'}), au plus {DEMO_PROGRAM.dailyCapPerPartner} fois par jour et par restaurant.</span>
          <span>3. Échange tes points contre les avantages listés. Chaque avantage a une durée de validité.</span>
          <span style={{ color: 'var(--ink-3)' }}>Ces règles sont des paramètres de démonstration : taux, seuils et financement seront fixés avec les partenaires.</span>
        </div>
      </div>

      <div class="list-section">
        <h2>Partenaires</h2>
        <div class="rows">
          {LOYALTY_PARTNERS.map((p) => {
            const r = restaurantById(p.restaurantId);
            return (
              <div key={p.id} class="row">
                <Icon name="pin" />
                <span class="grow">
                  {p.name}
                  <span class="small">{r?.address.neighbourhood ?? r?.address.district}</span>
                </span>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          class="btn btn-secondary btn-block"
          style={{ marginTop: 10 }}
          onClick={() =>
            showCollectionOnMap({
              id: 'partenaires',
              title: 'Partenaires fidélité',
              kicker: '',
              intro: '',
              criteria: [],
              restaurantIds: LOYALTY_PARTNERS.map((p) => p.restaurantId),
              hue: 200,
            })
          }
        >
          <Icon name="map" /> Voir les {LOYALTY_PARTNERS.length} partenaires sur la carte
        </button>
        <p style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', margin: '10px 0 0' }}>
          Être partenaire fidélité est un accord commercial : il n’influence ni le classement ni l’information halal. Être référencé n’est pas être partenaire.
        </p>
      </div>
    </div>
  );
}
