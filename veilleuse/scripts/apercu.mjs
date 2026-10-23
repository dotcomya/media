// Assemble dist-apercu/ en un seul fichier autonome (styles et scripts en ligne), au format
// d'un artefact Claude : pas de <html>, <head> ni <body>, le lecteur d'artefacts les ajoute.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = 'dist-apercu';
const read = (file) => readFileSync(`${dir}/${file}`, 'utf8');
const index = read('index.html');
const pick = (pattern, what) => {
  const match = index.match(pattern);
  if (!match) throw new Error(`Introuvable dans index.html : ${what}`);
  return match[1];
};

const css = read(pick(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+)">/, 'feuille de style'));
const js = read(pick(/<script type="module" crossorigin src="\.\/(assets\/[^"]+)"><\/script>/, 'script')).replace(/<\/script/gi, '<\\/script');
const themeScript = pick(/<script>([\s\S]*?)<\/script>/, 'script du thème');

// Dans le lecteur, la page est déjà décalée des bords du téléphone : elle occupe 100 % de la hauteur.
const frame = `#app{height:100%}.app{height:100%;padding-top:0;background:none}.screen{padding-bottom:12px}`;

const html = `<title>Veilleuse</title>
<style>${css}${frame}</style>
<div id="app"></div>
<script>${themeScript}</script>
<script type="module">${js}</script>
`;
writeFileSync(`${dir}/veilleuse-apercu.html`, html);
console.log(`${dir}/veilleuse-apercu.html (${Math.round(html.length / 1024)} ko)`);
