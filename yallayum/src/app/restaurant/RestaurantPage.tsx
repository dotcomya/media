// Fiche détaillée : décider (où, quand, combien), se rassurer (information
// halal sourcée, datée), partir (itinéraire). Faisable sans compte.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CERTIFIERS, LOYALTY_PARTNERS } from '../../data/demo';
import { resolveRestaurantLink, restaurantUrl } from '../../domain/deeplink';
import { formatAgo, formatDate, formatPrice } from '../../domain/format';
import { distanceMeters, formatDistance } from '../../domain/geo';
import { deriveHalalStatus, halalHeadline, METHOD_LABELS, SCOPE_LABELS, TRUST_LEVELS } from '../../domain/halal';
import { localClock, openStatus, upcomingExceptions, weekTable } from '../../domain/hours';
import { isDiscoverable } from '../../domain/publication';
import { rankOne } from '../../domain/ranking';
import { amenity, cuisine, occasion } from '../../domain/taxonomy';
import type { Restaurant } from '../../domain/types';
import { Icon } from '../../ui/Icon';
import { Illustration, OpenLabel, TrustBadge, hueOf, trustIcon } from '../../ui/bits';
import { prefersReducedMotion } from '../spring';
import { useStore } from '../store';
import { CATALOG, closePage, now, openOverlay, openRestaurant, restaurantById, store, toast, toggleVisited, track } from '../state';
import { NAV_APPS } from '../overlays';
import { distanceBucket } from '../../domain/analytics';
import { FavButton } from '../explore/ResultRow';

const HOURS_SOURCE: Record<string, string> = {
  restaurant: 'par le restaurant',
  team_visit: 'sur place par l’équipe',
  team_phone: 'par téléphone par l’équipe',
  website: 'sur le site du restaurant',
  community: 'par la communauté',
  legacy_import: 'dans l’ancienne base (non revérifiés)',
};

export function RestaurantPage({ id, from }: { id: string; from?: DOMRect }) {
  const r = restaurantById(id);
  if (!r) return <LinkPage slug={id} />;
  return <Fiche r={r} from={from} />;
}

function Fiche({ r, from }: { r: Restaurant; from?: DOMRect }) {
  const position = useStore(store, (s) => s.location.position);
  const origin = useStore(store, (s) => s.origin);
  const originIsUser = useStore(store, (s) => s.originIsUser);
  const visited = useStore(store, (s) => s.visited.includes(r.id));
  const navApp = useStore(store, (s) => s.prefs.navApp);
  const preferred = navApp ? NAV_APPS.find((a) => a.id === navApp) : undefined;
  const fromSearch = useStore(store, (s) => s.response.results.find((x) => x.restaurant.id === r.id));
  const hue = hueOf(r);
  const at = now();
  const today = localClock(at, r.timezone);
  const open = openStatus(r, at);
  const halal = deriveHalalStatus(r.halalClaims, today.date, CERTIFIERS);
  const level = TRUST_LEVELS[halal.level];
  const [solid, setSolid] = useState(false);
  const [slide, setSlide] = useState(0);
  const [showHalalDetail, setShowHalalDetail] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const distance = position ? distanceMeters(position, r.location) : origin ? distanceMeters(origin, r.location) : undefined;

  // Ouverture « morphing » : la vignette touchée s'agrandit jusqu'à la galerie.
  useLayoutEffect(() => {
    const hero = heroRef.current;
    const page = pageRef.current;
    if (!hero || !page || !from || prefersReducedMotion()) return;
    const to = hero.getBoundingClientRect();
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    page.style.animation = 'none';
    hero.style.transformOrigin = '0 0';
    hero.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`;
    hero.style.borderRadius = '16px';
    const body = page.querySelector<HTMLElement>('.sheet-body-card');
    if (body) {
      body.style.transform = 'translateY(40px)';
      body.style.opacity = '0';
    }
    page.style.background = 'transparent';
    requestAnimationFrame(() => {
      hero.style.transition = 'transform 520ms cubic-bezier(.2,.9,.25,1.04), border-radius 520ms';
      hero.style.transform = 'none';
      hero.style.borderRadius = '0';
      if (body) {
        body.style.transition = 'transform 560ms cubic-bezier(.2,.9,.25,1.04) 60ms, opacity 300ms 80ms';
        body.style.transform = 'none';
        body.style.opacity = '1';
      }
      page.style.transition = 'background 200ms 250ms';
      page.style.background = '';
    });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      setSolid(el.scrollTop > 240);
      if (heroRef.current && !prefersReducedMotion()) heroRef.current.style.transform = `translateY(${Math.max(0, el.scrollTop) * 0.35}px)`;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const similar = useMemo(() => {
    return CATALOG.filter((x) => x.id !== r.id && isDiscoverable(x))
      .map((x) => ({ x, d: distanceMeters(r.location, x.location), same: x.cuisines.some((c) => r.cuisines.includes(c) || cuisine(c)?.parent === cuisine(r.cuisines[0])?.parent) }))
      .filter((s) => s.d < 2500)
      .sort((a, b) => Number(b.same) - Number(a.same) || a.d - b.d)
      .slice(0, 6);
  }, [r.id]);

  const partner = r.loyaltyPartnerId ? LOYALTY_PARTNERS.find((p) => p.id === r.loyaltyPartnerId) : undefined;
  const exceptions = r.hours ? upcomingExceptions(r.hours, today.date) : [];
  const routeLabel = distance !== undefined ? `Itinéraire · ${formatDistance(distance)}` : 'Itinéraire';

  const share = async () => {
    const url = restaurantUrl(r);
    track('share_clicked', { restaurant_id: r.id, target: 'restaurant' });
    try {
      if (navigator.share) {
        await navigator.share({ title: r.name, text: `${r.name} sur YallaYum`, url });
        return;
      }
    } catch {
      // Partage refusé ou annulé : on retombe sur la copie du lien.
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Lien copié.');
    } catch {
      toast(url);
    }
  };

  return (
    <div class="page" ref={pageRef} style={{ '--seed-h': hue }} role="dialog" aria-label={r.name}>
      <div class={`page-top${solid ? ' is-solid' : ''}`}>
        <button type="button" class="round-btn" onClick={closePage} aria-label="Retour">
          <Icon name="back" />
        </button>
        <span class="title">{r.name}</span>
        <button type="button" class="round-btn" onClick={share} aria-label="Partager">
          <Icon name="share" />
        </button>
      </div>

      <div class="page-scroll" ref={scroller}>
        <div class="hero" ref={heroRef}>
          <div
            class="gallery"
            onScroll={(e) => {
              const el = e.currentTarget as HTMLElement;
              setSlide(Math.round(el.scrollLeft / el.clientWidth));
            }}
            aria-label={`Galerie, ${r.media.length} visuels`}
          >
            {r.media.map((m) => (
              <div key={m.id}>
                <Illustration media={m} hue={hue} width={393} height={320} />
              </div>
            ))}
          </div>
          {r.media.length > 1 && (
            <div class="hero-dots" aria-hidden="true">
              {r.media.map((m, i) => (
                <span key={m.id} class={i === slide ? 'on' : undefined} />
              ))}
            </div>
          )}
        </div>

        <div class="sheet-body-card">
          <header>
            <div class="fiche-kicker">
              {r.cuisines.map((c) => cuisine(c)?.label).join(' · ')} — {r.address.neighbourhood ?? r.address.district}
            </div>
            <h1 class="fiche-title">{r.name}</h1>
            <div class="fiche-meta">
              <OpenLabel status={open} />
              <span>{formatPrice(r.price)}</span>
              {distance !== undefined && (
                <span class="tnum">
                  {formatDistance(distance)} {position ? 'de toi' : 'du centre de la zone'} · à vol d’oiseau
                </span>
              )}
            </div>
            {fromSearch?.sponsored && (
              <div class="notice" style={{ marginTop: 12 }}>
                <Icon name="info" />
                <span>
                  <strong>Sponsorisé.</strong> Cette adresse a payé pour apparaître plus haut dans tes résultats. Elle respecte tes filtres ; son information halal est vérifiée comme les autres, sans passe-droit.
                </span>
              </div>
            )}
          </header>

          {r.operating === 'temporarily_closed' && (
            <div class="notice bad">
              <Icon name="door" />
              <span>{open.label}. Le reste de la fiche est donné pour la réouverture.</span>
            </div>
          )}

          {/* ── Information halal ───────────────────────────────────── */}
          <section class={`halal-card trust-${halal.level}`} aria-labelledby="halal-h">
            <div class="head">
              <span class="seal">
                <Icon name={trustIcon(halal.level)} />
              </span>
              <div>
                <div class="level">Information halal · {level.short}</div>
                <h3 id="halal-h">{halalHeadline(halal)}</h3>
              </div>
            </div>
            <dl>
              {halal.scope && (
                <>
                  <dt>Périmètre</dt>
                  <dd>
                    {SCOPE_LABELS[halal.scope]}
                    {halal.scopeNote && <div style={{ fontWeight: 400, color: 'var(--ink-2)' }}>{halal.scopeNote}</div>}
                  </dd>
                </>
              )}
              {halal.claim && (
                <>
                  <dt>Source</dt>
                  <dd>{METHOD_LABELS[halal.claim.method]}</dd>
                  <dt>Preuve du</dt>
                  <dd>
                    {formatDate(halal.claim.evidenceDate)} ({formatAgo(halal.claim.evidenceDate, today.date)})
                  </dd>
                </>
              )}
              {halal.claim?.certificateRef && (
                <>
                  <dt>Certificat</dt>
                  <dd>n° {halal.claim.certificateRef}</dd>
                </>
              )}
              {halal.validUntil && (
                <>
                  <dt>{halal.level === 'certified' ? 'Valable jusqu’au' : 'À revérifier avant'}</dt>
                  <dd>{formatDate(halal.validUntil)}</dd>
                </>
              )}
              <dt>Alcool</dt>
              <dd>{r.alcohol === 'not_served' ? 'Non servi (confirmé)' : r.alcohol === 'served' ? 'Servi sur place' : 'Non renseigné'}</dd>
            </dl>
            {halal.underReview && (
              <div class="notice" style={{ background: 'var(--surface)' }}>
                <Icon name="clock" />
                <span>Vérification en cours par l’équipe.</span>
              </div>
            )}
            {halal.expiredCertification && halal.level !== 'certified' && (
              <div class="notice" style={{ background: 'var(--surface)' }}>
                <Icon name="info" />
                <span>
                  Le certificat de l’organisme a expiré le {formatDate(halal.expiredCertification.validUntil!)}. Le badge a été retiré le jour même ; une nouvelle preuve a été demandée.
                </span>
              </div>
            )}
            {showHalalDetail && <p class="why">{level.explanation}</p>}
            <div class="actions">
              <button
                type="button"
                class="link-btn"
                aria-expanded={showHalalDetail}
                onClick={() => {
                  setShowHalalDetail(!showHalalDetail);
                  if (!showHalalDetail) track('halal_info_expanded', { restaurant_id: r.id, level: halal.level });
                }}
              >
                <Icon name="info" /> {showHalalDetail ? 'Moins de détails' : 'Ce que ça veut dire'}
              </button>
              <button type="button" class="link-btn" onClick={() => openOverlay({ kind: 'halal-help' })}>
                <Icon name="shield" /> Comment on vérifie
              </button>
              <button type="button" class="link-btn" onClick={() => openOverlay({ kind: 'contribute', restaurantId: r.id, preset: 'halal_info' })}>
                <Icon name="flag" /> Signaler
              </button>
            </div>
          </section>

          <p class="lede">{r.description}</p>

          {(r.occasions.length > 0 || r.amenities.length > 0) && (
            <div class="tags" aria-label="Envies">
              {[...r.occasions]
                .sort((a, b) => b.strength - a.strength)
                .map((o) => (
                  <span key={o.id} class={`tag${o.strength === 2 ? ' strong' : ''}`}>
                    {occasion(o.id)?.label}
                  </span>
                ))}
            </div>
          )}

          {fromSearch && (
            <button type="button" class="link-btn" style={{ background: 'var(--surface-2)', justifySelf: 'start' }} onClick={() => openOverlay({ kind: 'why', restaurantId: r.id })}>
              <Icon name="sparkle" /> Pourquoi ce résultat ?
            </button>
          )}

          {/* ── Pratique ─────────────────────────────────────────────── */}
          <section class="section" aria-labelledby="h-infos">
            <h2 id="h-infos">Infos pratiques</h2>
            <div class="rows">
              <button
                type="button"
                class="row"
                onClick={async () => {
                  const text = `${r.address.street}, ${r.address.postcode} ${r.address.city}`;
                  try {
                    await navigator.clipboard.writeText(text);
                    toast('Adresse copiée.');
                  } catch {
                    toast(text);
                  }
                }}
              >
                <Icon name="pin" />
                <span class="grow">
                  {r.address.street}
                  <span class="small">
                    {r.address.postcode} {r.address.city} · {r.address.district}
                  </span>
                </span>
                <Icon name="copy" class="chev" />
              </button>
              {r.contact.phone && (
                <a class="row" href={`tel:${r.contact.phone.replace(/\s/g, '')}`} onClick={() => track('phone_clicked', { restaurant_id: r.id })}>
                  <Icon name="phone" />
                  <span class="grow">
                    <span class="tnum">{r.contact.phone}</span>
                    <span class="small">Numéro fictif de démonstration</span>
                  </span>
                  <Icon name="chevron" class="chev" />
                </a>
              )}
              {r.contact.bookingUrl && (
                <a class="row" href={r.contact.bookingUrl} target="_blank" rel="noopener" onClick={() => track('booking_clicked', { restaurant_id: r.id })}>
                  <Icon name="calendar" />
                  <span class="grow">
                    Réserver
                    <span class="small">Sur le service de réservation du restaurant</span>
                  </span>
                  <Icon name="external" class="chev" />
                </a>
              )}
              {r.contact.menuUrl ? (
                <a class="row" href={r.contact.menuUrl} target="_blank" rel="noopener">
                  <Icon name="list" />
                  <span class="grow">
                    Voir le menu
                    <span class="small">Consulté par l’équipe le {formatDate(r.contact.menuCheckedAt!)} · les prix peuvent avoir changé</span>
                  </span>
                  <Icon name="external" class="chev" />
                </a>
              ) : (
                <div class="row">
                  <Icon name="list" />
                  <span class="grow">
                    Menu non disponible
                    <span class="small">On n’affiche pas de prix qu’on n’a pas vus.</span>
                  </span>
                </div>
              )}
            </div>
          </section>

          <section class="section" aria-labelledby="h-hours">
            <h2 id="h-hours">Horaires</h2>
            {r.hours ? (
              <>
                <table class="hours-table">
                  <tbody>
                    {weekTable(r.hours, today.weekday).map((row) => (
                      <tr key={row.day} class={row.isToday ? 'today' : undefined}>
                        <td>
                          {row.label}
                          {row.isToday && ' (aujourd’hui)'}
                        </td>
                        <td>{row.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {exceptions.length > 0 && (
                  <div class="notice info" style={{ marginTop: 10 }}>
                    <Icon name="calendar" />
                    <span>
                      {exceptions.map((x) => (
                        <div key={x.date}>
                          {formatDate(x.date)} : {x.label}, {x.text}
                        </div>
                      ))}
                    </span>
                  </div>
                )}
                <p class="hint">
                  {r.hours.verifiedAt ? `Confirmés ${HOURS_SOURCE[r.hours.source]} ${formatAgo(r.hours.verifiedAt, today.date)}.` : 'Horaires non confirmés.'}
                  {open.confidence === 'stale' && ' Ils peuvent avoir changé : appelle avant de te déplacer.'}
                </p>
              </>
            ) : (
              <div class="notice">
                <Icon name="clock" />
                <span>Horaires non renseignés. Appelle avant de venir, ou aide-nous à les compléter.</span>
              </div>
            )}
          </section>

          <section class="section" aria-labelledby="h-amen">
            <h2 id="h-amen">Sur place</h2>
            <div class="tags">
              {r.amenities.map((a) => (
                <span key={a} class="tag">
                  <Icon name="check" size={14} /> {amenity(a)?.label}
                </span>
              ))}
            </div>
            <p class="hint">Seuls les services confirmés sont listés. Absent de la liste = non confirmé.</p>
          </section>

          {partner && (
            <section class="section" aria-labelledby="h-loyal">
              <h2 id="h-loyal">Carte de fidélité</h2>
              <div class="notice info">
                <Icon name="gift" />
                <span>
                  <strong>Partenaire de la carte YallaYum.</strong> Fais scanner ta carte en caisse pour cumuler des points. Ce partenariat est commercial et n’influence ni le classement ni l’information halal.
                </span>
              </div>
            </section>
          )}

          {similar.length > 0 && (
            <section class="section" aria-labelledby="h-sim">
              <h2 id="h-sim">À proximité</h2>
              <div class="hscroll">
                {similar.map(({ x, d, same }) => (
                  <button
                    key={x.id}
                    type="button"
                    class="mini-card"
                    style={{ '--seed-h': hueOf(x) }}
                    onClick={(e) => openRestaurant(x.id, 'similar', (e.currentTarget as HTMLElement).querySelector('.thumb')?.getBoundingClientRect())}
                  >
                    <div class="thumb">
                      <Illustration media={x.media[0]} hue={hueOf(x)} width={168} height={120} />
                    </div>
                    <h3>{x.name}</h3>
                    <span class="why">
                      {same ? 'Même cuisine' : cuisine(x.cuisines[0])?.label} · à {formatDistance(d)}
                    </span>
                    <TrustBadge status={deriveHalalStatus(x.halalClaims, today.date, CERTIFIERS)} />
                  </button>
                ))}
              </div>
            </section>
          )}

          <section class="section">
            <div class="rows">
              <button type="button" class="row" onClick={() => toggleVisited(r.id)} aria-pressed={visited}>
                <Icon name="check" />
                <span class="grow">
                  {visited ? 'Dans ton carnet : tu y es allé·e' : 'J’y suis allé·e'}
                  <span class="small">Ton carnet reste sur ce téléphone.</span>
                </span>
              </button>
              <button type="button" class="row" onClick={() => openOverlay({ kind: 'contribute', restaurantId: r.id })}>
                <Icon name="flag" />
                <span class="grow">
                  Signaler une erreur
                  <span class="small">Fermé, horaires, adresse, photos, doublon…</span>
                </span>
                <Icon name="chevron" class="chev" />
              </button>
            </div>
            <p class="hint">
              Fiche mise à jour le {formatDate(r.updatedAt)}
              {r.publishedAt && ` · référencée depuis le ${formatDate(r.publishedAt)}`}. Établissement fictif de démonstration.
            </p>
          </section>
        </div>
      </div>

      <div class="action-bar">
        {preferred ? (
          // Appli de navigation mémorisée : l'itinéraire part en un geste ; l'appui long reste pour en changer.
          <a
            class="btn btn-tint"
            style={{ flex: 1 }}
            href={preferred.url(r.location.lat, r.location.lng, r.name)}
            target="_blank"
            rel="noopener"
            onClick={() => track('route_clicked', { restaurant_id: r.id, app: preferred.id, distance: distanceBucket(position ? distanceMeters(position, r.location) : undefined) })}
            onContextMenu={(e) => {
              e.preventDefault();
              openOverlay({ kind: 'route', restaurantId: r.id });
            }}
            aria-label={`${routeLabel} avec ${preferred.label}`}
          >
            <Icon name="route" />
            {routeLabel}
          </a>
        ) : (
          <button
            type="button"
            class="btn btn-tint"
            style={{ flex: 1 }}
            onClick={() => openOverlay({ kind: 'route', restaurantId: r.id })}
            disabled={r.operating !== 'operating' && r.operating !== 'temporarily_closed'}
          >
            <Icon name="route" />
            {routeLabel}
          </button>
        )}
        {r.contact.phone && (
          <a class="square-btn" href={`tel:${r.contact.phone.replace(/\s/g, '')}`} aria-label={`Appeler ${r.name}`} onClick={() => track('phone_clicked', { restaurant_id: r.id })}>
            <Icon name="phone" />
          </a>
        )}
        <FavButton id={r.id} size="lg" />
      </div>
      <span class="sr-only" aria-live="polite">
        {originIsUser ? '' : 'Distances calculées depuis le centre de la zone.'}
      </span>
    </div>
  );
}

// ─── Liens profonds : fermé, déménagé, introuvable ──────────────────────────

export function LinkPage({ slug }: { slug: string }) {
  const res = resolveRestaurantLink(slug, CATALOG);
  useEffect(() => {
    // Un lien partagé qui mène à une fiche compte comme une ouverture (source « lien »).
    const target = res.kind === 'moved' ? res.to : res.kind === 'restaurant' || res.kind === 'renamed' || res.kind === 'temporarily_closed' ? res.restaurant : undefined;
    if (res.kind === 'moved') toast(`${res.from.name} a déménagé : voici la nouvelle adresse.`);
    if (target) {
      store.set({ pages: [...store.get().pages.slice(0, -1), { kind: 'restaurant', id: target.id }] });
      track('restaurant_opened', { restaurant_id: target.id, source: 'deeplink', sponsored: false });
    }
  }, [slug]);
  const t = localClock(now(), 'Europe/Paris').date;

  if (res.kind === 'permanently_closed') {
    const r = res.restaurant;
    return (
      <div class="page" style={{ '--seed-h': hueOf(r) }} role="dialog" aria-label={`${r.name}, fermé définitivement`}>
        <div class="page-top is-solid">
          <button type="button" class="round-btn" onClick={closePage} aria-label="Retour">
            <Icon name="back" />
          </button>
          <span class="title" style={{ opacity: 1 }}>
            {r.name}
          </span>
        </div>
        <div class="page-scroll" style={{ paddingTop: 'calc(var(--sat) + 70px)' }}>
          <div class="empty">
            <div class="art" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>
              <Icon name="door" />
            </div>
            <h3>{r.name} a fermé définitivement</h3>
            <p>
              Ce lien a été partagé avant la fermeture. La fiche ne sort plus dans les résultats. Voici des adresses proches qui servent une cuisine voisine :
            </p>
          </div>
          <ul class="results" style={{ marginTop: 8 }}>
            {res.alternatives.map((a) => {
              const ranked = rankOne(a, { now: now(), origin: r.location, originIsUser: false, text: '', dishTerms: [], occasions: [], certifiers: CERTIFIERS });
              return (
                <li key={a.id}>
                  <button type="button" class="result" style={{ '--seed-h': hueOf(a) }} onClick={() => openRestaurant(a.id, 'deeplink')}>
                    <div class="thumb">
                      <Illustration media={a.media[0]} hue={hueOf(a)} width={96} height={112} />
                    </div>
                    <div class="info">
                      <span class="kicker">
                        {cuisine(a.cuisines[0])?.label} — à {formatDistance(distanceMeters(r.location, a.location))}
                      </span>
                      <h3>{a.name}</h3>
                      <div class="meta">
                        <OpenLabel status={ranked.open} short />
                      </div>
                      <TrustBadge status={deriveHalalStatus(a.halalClaims, t, CERTIFIERS)} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  if (res.kind === 'unavailable' || res.kind === 'not_found') {
    return (
      <div class="page" role="dialog" aria-label="Fiche introuvable">
        <div class="page-top is-solid">
          <button type="button" class="round-btn" onClick={closePage} aria-label="Retour">
            <Icon name="back" />
          </button>
        </div>
        <div class="page-scroll" style={{ paddingTop: 'calc(var(--sat) + 90px)' }}>
          <div class="empty">
            <div class="art">
              <Icon name="question" />
            </div>
            <h3>{res.kind === 'unavailable' ? 'Cette fiche n’est plus disponible' : 'Lien introuvable'}</h3>
            <p>{res.kind === 'unavailable' ? 'Elle a été retirée ou est en cours de mise à jour.' : 'L’adresse du lien est peut-être incomplète.'} Cherche le restaurant par son nom ou explore la carte.</p>
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => {
                closePage();
                openOverlay({ kind: 'search' });
              }}
            >
              <Icon name="search" /> Rechercher
            </button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
