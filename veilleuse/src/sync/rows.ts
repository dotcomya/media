// Une ligne du serveur ↔ un élément de l'app. La table n'a que des colonnes simples
// (voir supabase/schema.sql) : le genre d'élément et ses détails voyagent dans la liste
// « tags », sous forme de jetons « clé:valeur ». Ainsi, rien à changer côté serveur.
import {
  PROFILE_ID,
  SIDES,
  sortTags,
  tidyEntry,
  type Item,
  type Profile,
  type Sex,
  type Side,
  type Tag,
  type Weight,
} from '../model';

export interface Row {
  id: string;
  family: string;
  at: number;
  tags: string[];
  ml: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  synced_at?: string;
}

/**
 * Le profil est unique par famille : son identifiant serveur est tiré du code famille
 * (les deux téléphones écrivent donc la même ligne), au format UUID que la table attend.
 */
export function profileRowId(family: string): string {
  let hex = '';
  for (let seed = 0; seed < 4; seed++) {
    let h = 0x811c9dc5 ^ seed;
    for (const char of `nous3-profil:${family}`) h = Math.imul(h ^ char.charCodeAt(0), 0x01000193);
    hex += (h >>> 0).toString(16).padStart(8, '0');
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function toRow(family: string, item: Item): Row {
  const base = { family, created_at: item.createdAt, updated_at: item.updatedAt, deleted_at: item.deletedAt, ml: null };
  switch (item.kind) {
    case 'weight':
      return { ...base, id: item.id, at: item.at, tags: ['weight', `g:${item.grams}`] };
    case 'profile': {
      const tags = ['profile', `name:${item.babyName}`, `every:${item.feedIntervalMin}`];
      if (item.birthDate) tags.push(`born:${item.birthDate}`);
      if (item.sex) tags.push(`sex:${item.sex}`);
      return { ...base, id: profileRowId(family), at: 0, tags };
    }
    default: {
      const tags: string[] = [...item.tags, ...(item.sides ?? []).map((side) => `side:${side}`)];
      if (item.durationMin) tags.push(`min:${item.durationMin}`);
      return { ...base, id: item.id, at: item.at, tags, ml: item.ml ?? null };
    }
  }
}

export function fromRow(row: Row): Item {
  const plain = row.tags.filter((tag) => !tag.includes(':'));
  const values = row.tags.flatMap((tag) => {
    const i = tag.indexOf(':');
    return i < 0 ? [] : [[tag.slice(0, i), tag.slice(i + 1)] as const];
  });
  const value = (key: string) => values.find(([k]) => k === key)?.[1];
  const common = {
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    deletedAt: row.deleted_at == null ? null : Number(row.deleted_at),
  };

  if (plain.includes('profile')) {
    const sex = value('sex');
    const profile: Profile = {
      kind: 'profile',
      id: PROFILE_ID,
      babyName: value('name') ?? '',
      birthDate: value('born') ?? null,
      sex: sex === 'girl' || sex === 'boy' ? (sex as Sex) : null,
      feedIntervalMin: Number(value('every')) || 150,
      ...common,
      deletedAt: null,
    };
    return profile;
  }
  if (plain.includes('weight')) {
    const weight: Weight = { kind: 'weight', id: row.id, at: Number(row.at), grams: Number(value('g')), ...common };
    return weight;
  }
  return tidyEntry({
    id: row.id,
    at: Number(row.at),
    tags: sortTags(plain as Tag[]),
    ml: row.ml ?? undefined,
    sides: values.flatMap(([k, v]) => (k === 'side' && (SIDES as readonly string[]).includes(v) ? [v as Side] : [])),
    durationMin: Number(value('min')) || undefined,
    ...common,
  });
}
