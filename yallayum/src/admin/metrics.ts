// Indicateurs du tableau de bord et filtres de liste correspondants.
// Une définition = une fonction : le chiffre affiché et la liste ouverte au
// clic viennent du même prédicat, ils ne peuvent pas diverger.

import { daysBetween, hoursConfidence } from '../domain/hours';
import { distanceMeters } from '../domain/geo';
import { normalize, editDistance } from '../domain/text';
import { displayedValidUntil, halalOf, todayIso, type AdminRestaurant, type ListPreset } from './model';

export type QualityKey = NonNullable<ListPreset['quality']>;

export const QUALITY: Record<QualityKey, { label: string; definition: string; test: (r: AdminRestaurant, today: string) => boolean }> = {
  no_photo: {
    label: 'Sans photo réelle',
    definition: 'Fiches publiées sans aucune photo dont les droits sont acquis (les illustrations génériques ne comptent pas).',
    test: (r) => !r.media.some((m) => m.kind === 'photo'),
  },
  no_hours: {
    label: 'Sans horaires',
    definition: 'Fiches publiées sans aucun horaire saisi : elles sortent du filtre « Ouvert maintenant ».',
    test: (r, t) => hoursConfidence(r.hours, t) === 'none',
  },
  stale_hours: {
    label: 'Horaires anciens',
    definition: 'Horaires saisis mais confirmés il y a plus de 180 jours : affichés « à confirmer ».',
    test: (r, t) => hoursConfidence(r.hours, t) === 'stale',
  },
  no_price: {
    label: 'Sans prix',
    definition: 'Aucun niveau de prix : la fiche est écartée dès qu’un budget est filtré.',
    test: (r) => !r.price,
  },
  no_menu: {
    label: 'Sans menu',
    definition: 'Aucun lien de menu consulté par l’équipe.',
    test: (r) => !r.contact.menuUrl,
  },
};

export const HALAL_QUEUES: Record<NonNullable<ListPreset['halal']>, { label: string; definition: string; test: (r: AdminRestaurant, today: string) => boolean }> = {
  expired: {
    label: 'Certifications expirées',
    definition: 'Fiches dont une certification validée a dépassé sa date de fin. Le badge a déjà été recalculé ; une nouvelle preuve est à obtenir.',
    test: (r, t) => !!halalOf(r, t).expiredCertification && halalOf(r, t).level !== 'certified',
  },
  expiring: {
    label: 'À revérifier sous 60 jours',
    definition: 'Le niveau affiché aujourd’hui expire dans moins de 60 jours (certificat ou vérification).',
    test: (r, t) => {
      const until = displayedValidUntil(r, t);
      return !!until && daysBetween(t, until) <= 60;
    },
  },
  unconfirmed: {
    label: 'Info halal à confirmer',
    definition: 'Aucune preuve validée en cours de validité : la fiche affiche « Info halal à confirmer ».',
    test: (r, t) => halalOf(r, t).level === 'unconfirmed',
  },
};

/** Paires de fiches probablement en double : moins de 50 m et noms proches. */
export function duplicatePairs(list: AdminRestaurant[]): [AdminRestaurant, AdminRestaurant][] {
  const out: [AdminRestaurant, AdminRestaurant][] = [];
  const live = list.filter((r) => r.publication !== 'archived');
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (distanceMeters(a.location, b.location) > 50) continue;
      const na = normalize(a.name).replace(/^(le|la|les|l) /, '');
      const nb = normalize(b.name).replace(/^(le|la|les|l) /, '');
      const similar = na === nb || na.includes(nb) || nb.includes(na) || editDistance(na, nb, 4) <= 4;
      const samePhone = !!a.contact.phone && a.contact.phone === b.contact.phone;
      if (similar || samePhone) out.push([a, b]);
    }
  }
  return out;
}

export function matchesPreset(r: AdminRestaurant, p: ListPreset | undefined, dupIds: Set<string>, today = todayIso()): boolean {
  if (!p) return true;
  if (p.publication && r.publication !== p.publication) return false;
  if (p.operating && r.operating !== p.operating) return false;
  if (p.quality && !(r.publication === 'published' && QUALITY[p.quality].test(r, today))) return false;
  if (p.halal && !(r.publication === 'published' && HALAL_QUEUES[p.halal].test(r, today))) return false;
  if (p.duplicates && !dupIds.has(r.id)) return false;
  if (p.city && r.address.city !== p.city) return false;
  return true;
}

/** Recherches sans résultat : jeu d'exemple, en attendant le flux d'événements réel. */
export const ZERO_RESULT_EXAMPLE = [
  { query: 'sushi saint ouen', count: 14 },
  { query: 'brunch vincennes', count: 9 },
  { query: 'gastro lyon', count: 7 },
  { query: 'ouvert 4h', count: 5 },
  { query: 'pizza 75015', count: 4 },
];

/** Intentions d'itinéraire par jour, 7 derniers jours : exemple déterministe. */
export const ROUTE_INTENTS_EXAMPLE = [182, 167, 201, 214, 260, 312, 289];
