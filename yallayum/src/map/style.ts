// Style de carte YallaYum, sur le schéma OpenMapTiles.
//
// Une carte calme pour que les adresses ressortent : pas de commerces ni de
// points d'intérêt concurrents, seulement l'eau (le lagon de la marque), les
// parcs, la voirie hiérarchisée, les noms de rues et de quartiers, et les
// stations comme repères. Deux variantes, jour et nuit, aux mêmes couches.

import type { StyleSpecification } from 'maplibre-gl';

export interface MapPalette {
  land: string;
  park: string;
  wood: string;
  water: string;
  waterLabel: string;
  landuse: string;
  roadMinor: string;
  roadMajor: string;
  roadMotorway: string;
  casing: string;
  casingMajor: string;
  rail: string;
  roadLabel: string;
  placeLabel: string;
  placeLabelStrong: string;
  halo: string;
  station: string;
  stationLabel: string;
}

export const DAY: MapPalette = {
  land: '#F2F5F3',
  park: '#DCEBDD',
  wood: '#D2E6D4',
  water: '#B4E1EA',
  waterLabel: '#155B67',
  landuse: '#EAEFEC',
  roadMinor: '#FFFFFF',
  roadMajor: '#FFFFFF',
  roadMotorway: '#FFF1E2',
  casing: '#E1E7E5',
  casingMajor: '#D3DCDA',
  rail: '#CDD5D4',
  roadLabel: '#56686C',
  placeLabel: '#4B5E63',
  placeLabelStrong: '#1F3238',
  halo: '#F2F5F3',
  station: '#3C6BEB',
  stationLabel: '#2D4F9E',
};

export const NIGHT: MapPalette = {
  land: '#0F1B20',
  park: '#13271F',
  wood: '#122A22',
  water: '#0B3440',
  waterLabel: '#4FB3C4',
  landuse: '#132228',
  roadMinor: '#1C2B31',
  roadMajor: '#26373E',
  roadMotorway: '#3A3328',
  casing: '#0F1B20',
  casingMajor: '#0A1418',
  rail: '#22333A',
  roadLabel: '#7F9599',
  placeLabel: '#90A6AB',
  placeLabelStrong: '#C9D8DB',
  halo: '#0F1B20',
  station: '#7FA1FF',
  stationLabel: '#A9BEFF',
};

export interface MapSources {
  /** URL TileJSON ou gabarit de tuiles {z}/{x}/{y}. */
  tiles: { url: string } | { tiles: string[]; minzoom: number; maxzoom: number; bounds?: [number, number, number, number] };
  glyphs: string;
  attribution: string;
}

const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];

const MAJOR = ['primary', 'trunk'];
const MEDIUM = ['secondary', 'tertiary'];

export function buildStyle(p: MapPalette, src: MapSources): StyleSpecification {
  const width = (stops: [number, number][]) => ['interpolate', ['exponential', 1.6], ['zoom'], ...stops.flat()] as unknown as number;
  return {
    version: 8,
    glyphs: src.glyphs,
    sources: {
      omt: { type: 'vector', ...src.tiles, attribution: src.attribution },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': p.land } },
      {
        id: 'landuse',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landuse',
        filter: ['in', ['get', 'class'], ['literal', ['cemetery', 'hospital', 'university', 'stadium']]],
        paint: { 'fill-color': p.landuse },
      },
      {
        id: 'wood',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'wood'],
        paint: { 'fill-color': p.wood },
      },
      {
        id: 'grass',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'grass'],
        paint: { 'fill-color': p.park, 'fill-opacity': 0.8 },
      },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': p.park } },
      {
        id: 'waterway',
        type: 'line',
        source: 'omt',
        'source-layer': 'waterway',
        filter: ['!=', ['get', 'brunnel'], 'tunnel'],
        paint: { 'line-color': p.water, 'line-width': width([[12, 1], [16, 4]]) },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'omt',
        'source-layer': 'water',
        filter: ['!=', ['get', 'brunnel'], 'tunnel'],
        paint: { 'fill-color': p.water },
      },
      {
        id: 'rail',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['all', ['==', ['get', 'class'], 'rail'], ['!=', ['get', 'brunnel'], 'tunnel']],
        minzoom: 13,
        paint: { 'line-color': p.rail, 'line-width': width([[13, 0.6], [17, 2]]), 'line-dasharray': [3, 2] },
      },
      {
        id: 'road-minor-casing',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['all', ['==', ['get', 'class'], 'minor'], ['!=', ['get', 'brunnel'], 'tunnel']],
        minzoom: 14,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': p.casing, 'line-width': width([[14, 2.5], [18, 18]]) },
      },
      {
        id: 'road-medium-casing',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['all', ['in', ['get', 'class'], ['literal', MEDIUM]], ['!=', ['get', 'brunnel'], 'tunnel']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': p.casingMajor, 'line-width': width([[11, 1], [14, 5], [18, 26]]) },
      },
      {
        id: 'road-major-casing',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['all', ['in', ['get', 'class'], ['literal', [...MAJOR, 'motorway']]], ['!=', ['get', 'brunnel'], 'tunnel']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': p.casingMajor, 'line-width': width([[10, 1.2], [14, 7], [18, 32]]) },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['all', ['==', ['get', 'class'], 'minor'], ['!=', ['get', 'brunnel'], 'tunnel']],
        minzoom: 14,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': p.roadMinor, 'line-width': width([[14, 1.5], [18, 15]]) },
      },
      {
        id: 'road-medium',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['all', ['in', ['get', 'class'], ['literal', MEDIUM]], ['!=', ['get', 'brunnel'], 'tunnel']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': p.roadMajor, 'line-width': width([[11, 0.6], [14, 3.6], [18, 22]]) },
      },
      {
        id: 'road-major',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['all', ['in', ['get', 'class'], ['literal', MAJOR]], ['!=', ['get', 'brunnel'], 'tunnel']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': p.roadMajor, 'line-width': width([[10, 0.8], [14, 5.5], [18, 28]]) },
      },
      {
        id: 'road-motorway',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['all', ['==', ['get', 'class'], 'motorway'], ['!=', ['get', 'brunnel'], 'tunnel']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': p.roadMotorway, 'line-width': width([[10, 1], [14, 6], [18, 30]]) },
      },
      {
        id: 'water-label',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'waterway',
        filter: ['has', 'name'],
        minzoom: 13,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-font': FONT,
          'text-size': 12,
          'text-letter-spacing': 0.15,
        },
        paint: { 'text-color': p.waterLabel, 'text-halo-color': p.water, 'text-halo-width': 1 },
      },
      {
        id: 'road-label',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'transportation_name',
        filter: ['has', 'name'],
        minzoom: 14,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-font': FONT,
          'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10.5, 18, 14],
          'text-max-angle': 30,
          'symbol-spacing': 320,
        },
        paint: { 'text-color': p.roadLabel, 'text-halo-color': p.halo, 'text-halo-width': 1.4 },
      },
      {
        id: 'station-dot',
        type: 'circle',
        source: 'omt',
        'source-layer': 'poi',
        minzoom: 14,
        paint: {
          'circle-color': p.halo,
          'circle-stroke-color': p.station,
          'circle-stroke-width': 2,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 3, 17, 5],
        },
      },
      {
        id: 'station-label',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'poi',
        minzoom: 15,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': FONT_BOLD,
          'text-size': 11,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: { 'text-color': p.stationLabel, 'text-halo-color': p.halo, 'text-halo-width': 1.4 },
      },
      {
        id: 'place-neighbourhood',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['neighbourhood', 'quarter']]],
        minzoom: 14,
        maxzoom: 17,
        layout: {
          'text-field': ['upcase', ['get', 'name']],
          'text-font': FONT_BOLD,
          'text-size': 10.5,
          'text-letter-spacing': 0.18,
          'text-max-width': 8,
        },
        paint: { 'text-color': p.placeLabel, 'text-halo-color': p.halo, 'text-halo-width': 1.6, 'text-opacity': 0.8 },
      },
      {
        id: 'place-suburb',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        filter: ['==', ['get', 'class'], 'suburb'],
        minzoom: 11,
        maxzoom: 15,
        layout: {
          'text-field': ['upcase', ['get', 'name']],
          'text-font': FONT_BOLD,
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 14, 12.5],
          'text-letter-spacing': 0.16,
          'text-max-width': 7,
        },
        paint: { 'text-color': p.placeLabel, 'text-halo-color': p.halo, 'text-halo-width': 1.6 },
      },
      {
        id: 'place-town',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['town', 'village', 'city']]],
        maxzoom: 14,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': FONT_BOLD,
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, 13, 15],
          'text-max-width': 8,
        },
        paint: { 'text-color': p.placeLabelStrong, 'text-halo-color': p.halo, 'text-halo-width': 1.8 },
      },
    ],
  };
}

export const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Données © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs OpenStreetMap</a>';
