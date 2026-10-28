import { describe, expect, it } from 'vitest';
import { PLACES } from './places';
import { autocomplete, interpret } from './query';
import { restaurant } from './testing';

/** La carte est centrée sur Paris : c'est l'origine quand la position n'est pas partagée. */
const MAP_CENTER = PLACES.find((p) => p.id === 'paris')!.center;

describe('Compréhension des requêtes du cahier des charges', () => {
  it('« brunch halal Paris » → lieu Paris, cuisine brunch, « halal » ignoré', () => {
    const i = interpret('brunch halal Paris');
    expect(i.place?.id).toBe('paris');
    expect(i.cuisines).toEqual(['brunch']);
    expect(i.ignored).toContain('halal');
    expect(i.text).toBe('');
  });

  it('« indien romantique » → cuisine indienne, envie date', () => {
    const i = interpret('indien romantique');
    expect(i.cuisines).toEqual(['indienne']);
    expect(i.occasions).toEqual(['date']);
  });

  it('« ouvert après 23h » → ouvert à 23:00', () => {
    expect(interpret('ouvert après 23h').openAt).toBe('23:00');
    expect(interpret('kebab ouvert après 1h30').openAt).toBe('01:30');
  });

  it('« burger à Saint-Denis », carte sur Paris → Saint-Denis (93), La Réunion en alternative', () => {
    const i = interpret('burger à Saint-Denis', { origin: MAP_CENTER });
    expect(i.cuisines).toEqual(['burger']);
    expect(i.place?.id).toBe('saint-denis-93');
    expect(i.placeAlternatives.map((p) => p.id)).toEqual(['saint-denis-974']);
  });

  it('Homonyme départagé par la position : à La Réunion, Saint-Denis = 974', () => {
    const i = interpret('burger saint denis', { origin: { lat: -20.9, lng: 55.5 } });
    expect(i.place?.id).toBe('saint-denis-974');
  });

  it('Accents et fautes courantes : « libanai chateau rouge », « japonnais »', () => {
    const i = interpret('libanai chateau rouge');
    expect(i.cuisines).toEqual(['libanaise']);
    expect(i.place?.id).toBe('chateau-rouge');
    expect(interpret('japonnais').cuisines).toEqual(['japonaise']);
  });

  it('« Paris 15e » reste un arrondissement, « moins de 15 € » un budget', () => {
    expect(interpret('pizza paris 15e').place?.id).toBe('paris-15');
    expect(interpret('pizza paris 15e').priceMax).toBeUndefined();
    expect(interpret('déjeuner moins de 15 €').priceMax).toBe(1);
    expect(interpret('75011 tacos').place?.id).toBe('paris-11');
  });

  it('« entre amis à 6 personnes » → envie amis + grandes tables', () => {
    const i = interpret('entre amis 6 personnes');
    expect(i.occasions).toEqual(['amis']);
    expect(i.amenities).toEqual(['groupes']);
  });

  it('Les plats sont gardés pour le classement : « tajine » → marocaine + terme de plat', () => {
    const i = interpret('tajine bastille');
    expect(i.cuisines).toEqual(['marocaine']);
    expect(i.dishTerms).toEqual(['tajine']);
    expect(i.place?.id).toBe('bastille');
  });

  it('Le reste sert à chercher un nom, et chaque élément compris devient une puce', () => {
    const i = interpret('Chez Mounir ouvert maintenant');
    expect(i.openNow).toBe(true);
    expect(i.text).toBe('chez mounir');
    expect(i.chips.map((c) => c.kind)).toEqual(['open_now', 'text']);
  });
});

describe('Autocomplétion structurée', () => {
  it('« saint den », carte sur Paris → Saint-Denis 93 avant La Réunion', () => {
    const g = autocomplete('saint den', [], MAP_CENTER);
    const ids = g.places.map((p) => p.id);
    expect(ids.indexOf('saint-denis-93')).toBeLessThan(ids.indexOf('saint-denis-974'));
  });

  it('« bra » trouve un restaurant par le début de son nom', () => {
    const g = autocomplete('bra', [restaurant({ id: 'x', name: 'Les Braises' }), restaurant({ id: 'y', name: 'Kyoto Bowl' })]);
    expect(g.restaurants.map((r) => r.label)).toEqual(['Les Braises']);
  });

  it('Sans position ni carte, le plus peuplé des homonymes passe en tête', () => {
    expect(interpret('saint denis').place?.id).toBe('saint-denis-974');
  });

  it('« bur » propose la cuisine Burger', () => {
    expect(autocomplete('bur', []).cuisines.map((c) => c.id)).toContain('burger');
  });
});
