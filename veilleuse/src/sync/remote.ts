// Serveur de synchronisation : une table Supabase, lue et écrite par son API REST
// (voir supabase/schema.sql). Le code famille, envoyé dans l'en-tête x-family, limite
// chaque téléphone aux lignes de sa famille.
import type { Item } from '../model';
import { fromRow, toRow, type Row } from './rows';

const BASE = import.meta.env.VITE_SYNC_URL as string | undefined;
const KEY = import.meta.env.VITE_SYNC_KEY as string | undefined;
const TABLE = 'veilleuse_entries';

/** Cette version de l'app est branchée sur un serveur (adresse et clé publique fournies au build). */
export const syncAvailable = Boolean(BASE && KEY);

function headers(family: string): Record<string, string> {
  const result: Record<string, string> = { apikey: KEY!, 'x-family': family, 'Content-Type': 'application/json' };
  // L'ancienne clé « anon » (un JWT) se passe aussi en Authorization ; les nouvelles clés publiables, non.
  if (KEY!.startsWith('eyJ')) result.Authorization = `Bearer ${KEY}`;
  return result;
}

export async function pushItems(family: string, items: Item[]): Promise<void> {
  const response = await fetch(`${BASE}/rest/v1/${TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers(family), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(items.map((item) => toRow(family, item))),
  });
  if (!response.ok) throw new Error(`Envoi refusé par le serveur (${response.status})`);
}

/** Lignes modifiées sur le serveur après `since` (repère serveur), dans l'ordre. */
export async function pullItems(
  family: string,
  since: string | null,
  limit: number,
): Promise<{ items: Item[]; last: string | null }> {
  const params = new URLSearchParams({ select: '*', family: `eq.${family}`, order: 'synced_at.asc', limit: String(limit) });
  if (since) params.append('synced_at', `gt.${since}`);
  const response = await fetch(`${BASE}/rest/v1/${TABLE}?${params}`, { headers: headers(family) });
  if (!response.ok) throw new Error(`Réception refusée par le serveur (${response.status})`);
  const rows = (await response.json()) as Row[];
  return { items: rows.map(fromRow), last: rows.length ? rows[rows.length - 1].synced_at ?? null : null };
}
