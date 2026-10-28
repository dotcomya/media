/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Deux points d'entrée : l'application mobile (index.html) et le back-office
// (admin.html). Le mode « artifact » produit un seul script IIFE (MapLibre
// chargé à part depuis un CDN, sous le nom global maplibregl) que
// scripts/artifact.mjs assemble en une page unique, tuiles comprises.
export default defineConfig(({ mode }) => ({
  base: './',
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  define: { __ARTIFACT__: JSON.stringify(mode === 'artifact') },
  build:
    mode === 'artifact'
      ? {
          target: 'es2022',
          outDir: 'dist-artifact',
          cssCodeSplit: false,
          lib: { entry: resolve(import.meta.dirname, 'src/main.tsx'), formats: ['iife'], name: 'YallaYum', fileName: () => 'app.js', cssFileName: 'app' },
          rollupOptions: { external: ['maplibre-gl'], output: { globals: { 'maplibre-gl': 'maplibregl' }, inlineDynamicImports: true } },
        }
      : {
          target: 'es2022',
          outDir: 'dist',
          chunkSizeWarningLimit: 1500,
          rollupOptions: { input: { app: resolve(import.meta.dirname, 'index.html'), admin: resolve(import.meta.dirname, 'admin.html') } },
        },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
