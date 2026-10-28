// La carte : MapLibre, style YallaYum, marqueurs HTML regroupés par zoom.
//
// Règles :
// - les marqueurs montrent exactement les résultats de la dernière recherche ;
// - bouger la carte ne relance rien : on le signale (onUserMove) et la
//   personne décide avec « Rechercher dans cette zone » ;
// - à faible zoom, des grappes chiffrées plutôt que mille pastilles ;
// - la sélection n'est jamais avalée par une grappe et respire doucement.

import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Supercluster from 'supercluster';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Ranked } from '../../domain/ranking';
import type { BBox, LatLng } from '../../domain/types';
import { resolveSources } from '../../map/source';
import { buildStyle, DAY, NIGHT, type MapSources } from '../../map/style';
import { iconPath } from '../../ui/Icon';
import { hueOf, iconOf } from '../../ui/bits';
import { prefersReducedMotion } from '../spring';

export interface Camera {
  bbox?: BBox;
  center?: LatLng;
  zoom?: number;
  nonce: number;
}

interface Props {
  results: Ranked[];
  selectedId?: string;
  user?: { position: LatLng; simulated?: boolean };
  camera?: Camera;
  initialArea: BBox;
  padTop: number;
  padBottom: number;
  dark: boolean;
  onSelect: (id: string | undefined, source: 'map') => void;
  onUserMove: (visible: BBox) => void;
  onStatus: (status: 'ready' | 'failed', info?: { embedded: boolean }) => void;
}

const svg = (name: Parameters<typeof iconPath>[0], size = 17) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPath(name)}"/></svg>`;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | undefined>(undefined);
  const markers = useRef(new Map<string, maplibregl.Marker>());
  const userMarker = useRef<maplibregl.Marker | undefined>(undefined);
  const sourcesRef = useRef<MapSources | undefined>(undefined);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [loaded, setLoaded] = useState(false);
  const indexRef = useRef<Supercluster<{ id: string }> | undefined>(undefined);

  // Création unique de la carte.
  useEffect(() => {
    let cancelled = false;
    let timeout = 0;
    (async () => {
      try {
        const { sources, embedded } = await resolveSources(maplibregl);
        if (cancelled || !container.current) return;
        sourcesRef.current = sources;
        const p = propsRef.current;
        const map = new maplibregl.Map({
          container: container.current,
          style: buildStyle(p.dark ? NIGHT : DAY, sources),
          bounds: p.initialArea,
          fitBoundsOptions: { padding: { top: p.padTop + 10, bottom: p.padBottom + 10, left: 16, right: 16 } },
          attributionControl: false,
          minZoom: 4,
          maxZoom: 18,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          fadeDuration: 150,
        });
        map.touchZoomRotate.disableRotation();
        // Attribution OpenStreetMap obligatoire : repliée en « i », sous la barre de recherche.
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
        mapRef.current = map;
        if (import.meta.env.DEV) (window as unknown as { __yyMap: unknown }).__yyMap = map;
        timeout = window.setTimeout(() => !map.loaded() && propsRef.current.onStatus('failed', { embedded }), 15000);
        map.on('load', () => {
          clearTimeout(timeout);
          container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
          setLoaded(true);
          propsRef.current.onStatus('ready', { embedded });
        });
        map.on('moveend', (e: { originalEvent?: Event }) => {
          if (e.originalEvent) propsRef.current.onUserMove(visibleBBox(map));
        });
        map.on('click', (e: maplibregl.MapMouseEvent) => {
          const target = e.originalEvent.target as HTMLElement;
          if (target.closest('.marker-wrap')) return;
          propsRef.current.onSelect(undefined, 'map');
        });
        let frame = 0;
        map.on('move', () => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => drawMarkers());
        });
      } catch {
        propsRef.current.onStatus('failed', { embedded: false });
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      mapRef.current?.remove();
    };
  }, []);

  function visibleBBox(map: maplibregl.Map): BBox {
    const c = map.getContainer();
    const { padTop, padBottom } = propsRef.current;
    const nw = map.unproject([0, Math.min(padTop, c.clientHeight / 2)]);
    const se = map.unproject([c.clientWidth, Math.max(c.clientHeight - padBottom, c.clientHeight / 2)]);
    return [nw.lng, se.lat, se.lng, nw.lat];
  }

  function drawMarkers() {
    const map = mapRef.current;
    const index = indexRef.current;
    if (!map || !index) return;
    const p = propsRef.current;
    const b = map.getBounds();
    const zoom = Math.floor(map.getZoom());
    const clusters = index.getClusters([b.getWest() - 0.01, b.getSouth() - 0.01, b.getEast() + 0.01, b.getNorth() + 0.01], zoom);
    const wanted = new Set<string>();
    const byId = new Map(p.results.map((r) => [r.restaurant.id, r]));

    for (const f of clusters) {
      const [lng, lat] = f.geometry.coordinates;
      const props = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; id?: string };
      if (props.cluster) {
        const key = `c-${props.cluster_id}-${props.point_count}-${zoom}`;
        wanted.add(key);
        if (!markers.current.has(key)) {
          const el = document.createElement('div');
          el.className = 'marker-wrap';
          el.innerHTML = `<button type="button" class="cluster" aria-label="${props.point_count} adresses, zoomer">${props.point_count}</button>`;
          el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const z = Math.min(index.getClusterExpansionZoom(props.cluster_id!), 17);
            map.easeTo({ center: [lng, lat], zoom: z, duration: prefersReducedMotion() ? 0 : 500 });
          });
          markers.current.set(key, new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map));
        }
      } else if (props.id) {
        const r = byId.get(props.id);
        if (!r) continue;
        const key = `p-${props.id}-${r.open.state}`;
        wanted.add(key);
        if (!markers.current.has(key)) {
          const el = document.createElement('div');
          el.className = 'marker-wrap';
          const closed = r.open.state === 'closed';
          el.innerHTML = `<button type="button" class="marker${closed ? ' is-closed' : ''}${r.sponsored ? ' is-sponsored' : ''}" aria-label="${escapeHtml(r.restaurant.name)}${closed ? ', fermé' : ''}">${svg(iconOf(r.restaurant))}</button>`;
          el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            propsRef.current.onSelect(props.id, 'map');
          });
          markers.current.set(key, new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map));
        }
      }
    }

    // La sélection, toujours visible, en pastille nommée.
    const sel = p.selectedId ? byId.get(p.selectedId) : undefined;
    if (sel) {
      const key = `s-${sel.restaurant.id}`;
      wanted.add(key);
      if (!markers.current.has(key)) {
        const el = document.createElement('div');
        el.className = 'marker-wrap is-selected';
        el.style.setProperty('--seed-h', String(hueOf(sel.restaurant)));
        el.innerHTML = `<div class="marker-pill" role="img" aria-label="Sélection : ${escapeHtml(sel.restaurant.name)}"><span class="dot">${svg(iconOf(sel.restaurant), 18)}</span>${escapeHtml(sel.restaurant.name)}</div>`;
        el.addEventListener('click', (ev) => ev.stopPropagation());
        markers.current.set(
          key,
          new maplibregl.Marker({ element: el, anchor: 'bottom-left', offset: [-22, -10] }).setLngLat([sel.restaurant.location.lng, sel.restaurant.location.lat]).addTo(map),
        );
      }
    }

    for (const [key, m] of markers.current) {
      if (!wanted.has(key)) {
        m.remove();
        markers.current.delete(key);
      }
    }
  }

  // Index des grappes : reconstruit à chaque nouvelle réponse ou sélection.
  useEffect(() => {
    const index = new Supercluster<{ id: string }>({ radius: 52, maxZoom: 16, minPoints: 3 });
    index.load(
      props.results
        .filter((r) => r.restaurant.id !== props.selectedId)
        .map((r) => ({
          type: 'Feature' as const,
          properties: { id: r.restaurant.id },
          geometry: { type: 'Point' as const, coordinates: [r.restaurant.location.lng, r.restaurant.location.lat] },
        })),
    );
    indexRef.current = index;
    if (loaded) drawMarkers();
  }, [props.results, props.selectedId, loaded]);

  // La sélection vient du carrousel ou de la liste : la garder dans la zone visible.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !props.selectedId) return;
    const r = props.results.find((x) => x.restaurant.id === props.selectedId);
    if (!r) return;
    const pt = map.project([r.restaurant.location.lng, r.restaurant.location.lat]);
    const c = map.getContainer();
    const inside = pt.x > 40 && pt.x < c.clientWidth - 40 && pt.y > props.padTop + 30 && pt.y < c.clientHeight - props.padBottom - 30;
    if (!inside) {
      map.easeTo({ center: [r.restaurant.location.lng, r.restaurant.location.lat], duration: prefersReducedMotion() ? 0 : 450, padding: { top: props.padTop, bottom: props.padBottom, left: 0, right: 0 } });
    }
  }, [props.selectedId, loaded]);

  // Vols demandés (ville choisie, position, collection).
  useEffect(() => {
    const map = mapRef.current;
    const cam = props.camera;
    if (!map || !loaded || !cam) return;
    const duration = prefersReducedMotion() ? 0 : 900;
    const padding = { top: props.padTop + 12, bottom: props.padBottom + 12, left: 24, right: 24 };
    if (cam.bbox) map.fitBounds(cam.bbox, { padding, duration, maxZoom: 15.5 });
    else if (cam.center) map.flyTo({ center: [cam.center.lng, cam.center.lat], zoom: cam.zoom ?? 15, padding, duration });
  }, [props.camera?.nonce, loaded]);

  // Position de la personne.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (!props.user) {
      userMarker.current?.remove();
      userMarker.current = undefined;
      return;
    }
    if (!userMarker.current) {
      const el = document.createElement('div');
      el.className = `me-dot${props.user.simulated ? ' is-simulated' : ''}`;
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', props.user.simulated ? 'Ta position (simulée)' : 'Ta position');
      userMarker.current = new maplibregl.Marker({ element: el }).setLngLat([props.user.position.lng, props.user.position.lat]).addTo(map);
    } else {
      userMarker.current.setLngLat([props.user.position.lng, props.user.position.lat]);
    }
  }, [props.user?.position.lat, props.user?.position.lng, loaded]);

  // Thème jour / nuit.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !sourcesRef.current) return;
    map.setStyle(buildStyle(props.dark ? NIGHT : DAY, sourcesRef.current));
  }, [props.dark, loaded]);

  // Marge basse : la feuille de résultats cache une partie de la carte.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    container.current?.style.setProperty('--map-pad-bottom', `${props.padBottom}px`);
    container.current?.style.setProperty('--map-pad-top', `${props.padTop}px`);
  }, [props.padBottom, props.padTop, loaded]);

  // Position en ligne : la feuille de style de MapLibre impose « relative » au conteneur.
  return <div ref={container} class="map" style={{ position: 'absolute', inset: 0 }} aria-label="Carte des restaurants" role="application" />;
}
