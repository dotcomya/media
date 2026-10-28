// Modifications concurrentes dans le back-office : verrouillage optimiste.
//
// Chaque fiche porte une version. Un enregistrement envoie la version lue ;
// si la fiche a changé entre-temps, rien n'est écrasé : on fusionne champ par
// champ ce qui ne se contredit pas et on présente le reste à arbitrer.

export interface MergeResult<T> {
  merged: T;
  /** Champs modifiés des deux côtés, différemment : à arbitrer. */
  conflicts: (keyof T)[];
  /** Champs repris automatiquement de l'autre modification. */
  theirs: (keyof T)[];
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Fusion à trois voies : base (version lue), mine (mes changements), theirs (version actuelle). */
export function threeWayMerge<T extends object>(base: T, mine: T, theirs: T, fields: (keyof T)[]): MergeResult<T> {
  const merged = { ...theirs };
  const conflicts: (keyof T)[] = [];
  const taken: (keyof T)[] = [];
  for (const f of fields) {
    const changedByMe = !same(base[f], mine[f]);
    const changedByThem = !same(base[f], theirs[f]);
    if (changedByMe && changedByThem && !same(mine[f], theirs[f])) conflicts.push(f);
    else if (changedByMe) merged[f] = mine[f];
    else if (changedByThem) taken.push(f);
  }
  return { merged, conflicts, theirs: taken };
}

export class VersionConflictError<T> extends Error {
  constructor(
    public readonly current: T & { version: number },
    public readonly merge: MergeResult<T>,
  ) {
    super('La fiche a été modifiée par quelqu’un d’autre depuis son ouverture.');
  }
}

/**
 * Enregistre `mine` si personne n'a modifié la fiche depuis `base`. Sinon lève
 * VersionConflictError avec la fusion proposée.
 */
export function saveVersioned<T extends { version: number }>(
  current: T,
  base: T,
  mine: T,
  fields: (keyof T)[],
): T {
  if (current.version === base.version) return { ...mine, version: current.version + 1 };
  throw new VersionConflictError(current, threeWayMerge(base, mine, current, fields));
}
