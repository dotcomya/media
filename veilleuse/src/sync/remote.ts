// Serveur de synchronisation : une table Supabase, lue et écrite par son API REST
// (voir supabase/schema.sql). Le code famille, envoyé dans l'en-tête x-family, limite
// chaque téléphone aux lignes de sa famille.
import { sortTags, withVolume, type Entry, type Tag } from '../model';

const BASE = import.meta.env.VITE_SYNC_URL as string | undefined;
const KEY = import.meta.env.VITE_SYNC_KEY as string | undefined;
const TABLE = 'veilleuse_entries';

/** Cette version de l'app est branchée sur un serveur (adresse et clé publique fournies au build). */
export const syncAvailable = Boolean(BASE && KEY);

interface Row {
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

function headers(family: string): Record<string, string> {
  const result: Record<string, string> = { apikey: KEY!, 'x-family': family, 'Content-Type': 'application/json' };
  // L'ancienne clé « anon » (un JWT) se passe aussi en Authorization ; les nouvelles clés publiables, non.
  if (KEY!.startsWith('eyJ')) result.Authorization = `Bearer ${KEY}`;
  return result;
}

const toRow = (family: string, e: Entry): Row => ({
  id: e.id,
  family,
  at: e.at,
  tags: e.tags,
  ml: e.ml ?? null,
  created_at: e.createdAt,
  updated_at: e.updatedAt,
  deleted_at: e.deletedAt,
});

const fromRow = (r: Row): Entry =>
  withVolume(
    {
      id: r.id,
      at: Number(r.at),
      tags: sortTags(r.tags as Tag[]),
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      deletedAt: r.deleted_at == null ? null : Number(r.deleted_at),
    },
    r.ml ?? undefined,
  );

export async function pushEntries(family: string, entries: Entry[]): Promise<void> {
  const response = await fetch(`${BASE}/rest/v1/${TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers(family), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(entries.map((e) => toRow(family, e))),
  });
  if (!response.ok) throw new Error(`Envoi refusé par le serveur (${response.status})`);
}

/** Lignes modifiées sur le serveur après `since` (repère serveur), dans l'ordre. */
export async function pullEntries(
  family: string,
  since: string | null,
  limit: number,
): Promise<{ entries: Entry[]; last: string | null }> {
  const params = new URLSearchParams({ select: '*', family: `eq.${family}`, order: 'synced_at.asc', limit: String(limit) });
  if (since) params.append('synced_at', `gt.${since}`);
  const response = await fetch(`${BASE}/rest/v1/${TABLE}?${params}`, { headers: headers(family) });
  if (!response.ok) throw new Error(`Réception refusée par le serveur (${response.status})`);
  const rows = (await response.json()) as Row[];
  return { entries: rows.map(fromRow), last: rows.length ? rows[rows.length - 1].synced_at ?? null : null };
}
