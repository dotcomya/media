import { render } from 'preact';
import { App } from './components/App';
import { init } from './store';
import './styles.css';

render(<App />, document.getElementById('app')!);

if (import.meta.env.VITE_DEMO) {
  // Aperçu (npm run build:apercu) : données d'exemple, ni stockage ni service worker.
  import('./demo').then(({ startDemo }) => startDemo());
} else {
  init();
  if ('serviceWorker' in navigator && import.meta.env.PROD) registerServiceWorker();
}

function registerServiceWorker(): void {
  const hadController = Boolean(navigator.serviceWorker.controller);
  // Une nouvelle version vient de prendre la main : on recharge pour l'afficher tout de suite.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        // Sur iPhone, l'app est souvent reprise sans être relancée : on vérifie à chaque retour.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {});
        });
      })
      .catch((error) => console.error(error));
  });
}
