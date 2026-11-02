// Assemble la version « artefact » : une seule page HTML, sans serveur.
//
//   npm run tiles            (une fois : télécharge et filtre les tuiles)
//   npm run build:artifact   → dist-artifact/yallayum.html
//
// Contenu : styles et script de l'application en ligne, MapLibre chargé
// depuis cdnjs (version figée), tuiles et polices de la carte embarquées
// (window.__YY_MAP__). Le fichier n'a pas de <html>/<head>/<body> : la
// plateforme d'hébergement des artefacts ajoute ce squelette.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { buildPack } from './pack.mjs';

const MAPLIBRE = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.24.0/maplibre-gl.js';
const FONTS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Kaushan+Script&display=swap';
const dist = new URL('../dist-artifact/', import.meta.url);

buildPack();
const pack = readFileSync(new URL('../.cache/mappack.js', import.meta.url), 'utf8');
const js = readFileSync(new URL('app.js', dist), 'utf8');
const cssFile = readdirSync(dist).find((f) => f.endsWith('.css'));
const css = cssFile ? readFileSync(new URL(cssFile, dist), 'utf8') : '';

// Un « </script> » dans le code casserait la page : on l'échappe.
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');

const html = `<title>YallaYum</title>
<meta name="description" content="YallaYum, le GPS de la restauration halal : prototype mobile et back-office.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${css}</style>
<div id="app"></div>
<script>${pack}</script>
<script src="${MAPLIBRE}"></script>
<script>${safe(js)}</script>
`;
const out = new URL('yallayum.html', dist);
writeFileSync(out, html);
console.log(`dist-artifact/yallayum.html : ${(html.length / 1e6).toFixed(2)} Mo`);
