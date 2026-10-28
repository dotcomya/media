// Normalisation du texte saisi : accents, apostrophes, fautes de frappe.

/** Minuscules, sans accents ni ponctuation, espaces simples. « Château-Rouge » → « chateau rouge ». */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[’'`´-]/g, ' ')
    .replace(/[^a-z0-9€\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Distance de Damerau-Levenshtein (transpositions adjacentes comprises),
 * interrompue dès qu'elle dépasse `max`.
 */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      }
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

/** Tolérance aux fautes selon la longueur du mot : aucune sous 4 lettres. */
export function typoBudget(word: string): number {
  if (word.length < 4) return 0;
  if (word.length < 8) return 1;
  return 2;
}

/** `word` correspond-il à `target`, au budget de fautes près ? */
export function fuzzyEquals(word: string, target: string): boolean {
  return editDistance(word, target, typoBudget(target)) <= typoBudget(target);
}
