import type { Entry } from '../model';

/**
 * Saisies reçues à garder : nouvelles, ou plus récentes que la version locale.
 * La dernière modification gagne (updatedAt), suppressions comprises.
 */
export function newerRemote(local: Map<string, Entry>, remote: Entry[]): Entry[] {
  return remote.filter((entry) => {
    const mine = local.get(entry.id);
    return !mine || entry.updatedAt > mine.updatedAt;
  });
}

// Alphabet sans caractères ambigus (0/O, 1/I/L) : le code se lit et se recopie sans erreur.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;

/** Code famille : « K7QM-2XRP-HW4D » (12 caractères, environ 59 bits de hasard). */
export function newFamilyCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return chars.match(/.{4}/g)!.join('-');
}

/** Code saisi ou collé, remis en forme ; null s'il n'est pas valide. */
export function normalizeFamilyCode(input: string): string | null {
  const chars = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (chars.length !== CODE_LENGTH || [...chars].some((c) => !ALPHABET.includes(c))) return null;
  return chars.match(/.{4}/g)!.join('-');
}
