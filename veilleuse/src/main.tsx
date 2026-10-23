import { render } from 'preact';
import { App } from './components/App';
import { init } from './store';
import './styles.css';

render(<App />, document.getElementById('app')!);

init();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => console.error(error));
  });
}
