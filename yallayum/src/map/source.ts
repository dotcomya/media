// D'où viennent les tuiles : serveur public (version hébergée) ou paquet
// embarqué (artefact en fichier unique, démonstration hors ligne).
//
// Le paquet embarqué est un fichier gzip encodé en base64 : un en-tête JSON
// (clé → [début, longueur]) suivi des tuiles et glyphes bout à bout. Il est
// décompressé une fois, puis servi à MapLibre par un protocole « yy:// ».

import { ATTRIBUTION, type MapSources } from './style';

declare global {
  interface Window {
    __YY_MAP__?: string;
  }
}

export interface MapPack {
  meta: { bbox: [number, number, number, number]; minzoom: number; maxzoom: number };
  files: Map<string, Uint8Array>;
}

let packPromise: Promise<MapPack | null> | undefined;

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function loadEmbeddedPack(): Promise<MapPack | null> {
  packPromise ??= (async () => {
    const b64 = window.__YY_MAP__;
    if (!b64) return null;
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bytes = await gunzip(raw);
    const headerLength = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headerLength))) as {
      meta: MapPack['meta'];
      files: Record<string, [number, number]>;
    };
    const base = 4 + headerLength;
    const files = new Map<string, Uint8Array>();
    for (const [key, [start, length]] of Object.entries(header.files)) files.set(key, bytes.subarray(base + start, base + start + length));
    return { meta: header.meta, files };
  })();
  return packPromise;
}

let protocolInstalled = false;

/** Sources de la carte : paquet embarqué s'il existe, sinon OpenFreeMap en direct. */
/** Ce dont on a besoin de MapLibre ici : enregistrer un protocole. */
interface ProtocolHost {
  addProtocol(name: string, loader: (params: { url: string }) => Promise<{ data: ArrayBuffer }>): void;
}

export async function resolveSources(lib: ProtocolHost): Promise<{ sources: MapSources; embedded: boolean }> {
  const pack = await loadEmbeddedPack();
  if (pack) {
    if (!protocolInstalled) {
      lib.addProtocol('yy', async (params: { url: string }) => {
        const key = decodeURIComponent(params.url.replace('yy://', ''));
        const data = pack.files.get(key);
        // Tuile hors zone : une tuile vide plutôt qu'une erreur.
        return { data: data ? data.slice().buffer : new ArrayBuffer(0) };
      });
      protocolInstalled = true;
    }
    return {
      embedded: true,
      sources: {
        tiles: { tiles: ['yy://t/{z}/{x}/{y}'], minzoom: pack.meta.minzoom, maxzoom: pack.meta.maxzoom, bounds: pack.meta.bbox },
        glyphs: 'yy://g/{fontstack}/{range}',
        attribution: ATTRIBUTION,
      },
    };
  }
  return {
    embedded: false,
    sources: {
      tiles: { url: 'https://tiles.openfreemap.org/planet' },
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      attribution: ATTRIBUTION,
    },
  };
}
