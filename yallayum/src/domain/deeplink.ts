// Liens profonds : https://yallayum.app/r/<slug>
//
// Un lien partagé il y a six mois doit toujours mener quelque part d'utile :
// la fiche, son successeur après un déménagement, ou une page qui explique la
// fermeture et propose des adresses proches — jamais une page d'erreur muette.

import { distanceMeters } from './geo';
import { isDiscoverable } from './publication';
import type { Restaurant } from './types';

export type LinkResolution =
  | { kind: 'restaurant'; restaurant: Restaurant }
  | { kind: 'temporarily_closed'; restaurant: Restaurant }
  | { kind: 'renamed'; restaurant: Restaurant }
  | { kind: 'moved'; from: Restaurant; to: Restaurant }
  | { kind: 'permanently_closed'; restaurant: Restaurant; alternatives: Restaurant[] }
  | { kind: 'unavailable' }
  | { kind: 'not_found' };

export function resolveRestaurantLink(slug: string, catalog: Restaurant[]): LinkResolution {
  let r = catalog.find((x) => x.slug === slug);
  let renamed = false;
  if (!r) {
    r = catalog.find((x) => x.previousSlugs?.includes(slug));
    renamed = !!r;
  }
  if (!r) return { kind: 'not_found' };
  // Suspendue, archivée, brouillon : on ne dit pas pourquoi, on n'expose rien.
  if (r.publication !== 'published') return { kind: 'unavailable' };

  if (r.operating === 'moved' && r.successorId) {
    const to = catalog.find((x) => x.id === r!.successorId);
    if (to && isDiscoverable(to)) return { kind: 'moved', from: r, to };
  }
  if (r.operating === 'permanently_closed' || r.operating === 'moved') {
    const origin = r.location;
    const alternatives = catalog
      .filter((x) => x.id !== r!.id && isDiscoverable(x) && x.cuisines.some((c) => r!.cuisines.includes(c)))
      .sort((a, b) => distanceMeters(origin, a.location) - distanceMeters(origin, b.location))
      .slice(0, 3);
    return { kind: 'permanently_closed', restaurant: r, alternatives };
  }
  if (r.operating === 'temporarily_closed') return { kind: 'temporarily_closed', restaurant: r };
  return renamed ? { kind: 'renamed', restaurant: r } : { kind: 'restaurant', restaurant: r };
}

/** Lien canonique à partager. */
export function restaurantUrl(r: Pick<Restaurant, 'slug'>, base = 'https://yallayum.app'): string {
  return `${base}/r/${r.slug}`;
}
