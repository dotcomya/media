/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Fichiers de public/ qui ne doivent pas être mis en cache par le service worker
// (les écrans de lancement iOS ne sont lus qu'à l'installation).
const NOT_PRECACHED = /^splash\//;

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/**
 * Génère dist/sw.js à partir de src/sw.js : injecte la liste des fichiers
 * à précharger et une version dérivée de leur contenu. Toute modification
 * du code produit donc un nouveau service worker, que le navigateur installe.
 */
function serviceWorker(): Plugin {
  return {
    name: 'veilleuse-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const publicFiles = listFiles('public')
        .map((path) => relative('public', path).split('\\').join('/'))
        .filter((path) => !NOT_PRECACHED.test(path));
      const files = ['./', ...Object.keys(bundle).filter((f) => f !== 'index.html'), ...publicFiles];

      const hash = createHash('sha256');
      for (const chunk of Object.values(bundle)) {
        hash.update(chunk.fileName);
        hash.update(chunk.type === 'chunk' ? chunk.code : chunk.source);
      }
      for (const path of publicFiles) hash.update(readFileSync(join('public', path)));
      const version = hash.digest('hex').slice(0, 12);

      const source = readFileSync('src/sw.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  plugins: [serviceWorker()],
  build: { target: 'es2020' },
  test: {
    environment: 'node',
    // Les tests de bornes de journée supposent le fuseau de Paris (changement d'heure inclus).
    env: { TZ: 'Europe/Paris' },
  },
});
