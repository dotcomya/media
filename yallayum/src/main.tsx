import { render } from 'preact';
import './app/styles.css';

// Un seul point d'entrée pour l'artefact : #admin ouvre le back-office.
const root = document.getElementById('app')!;
if (location.hash === '#admin') {
  import('./admin/Admin').then(({ Admin }) => render(<Admin />, root));
} else {
  import('./app/App').then(({ App }) => render(<App />, root));
}
window.addEventListener('hashchange', () => {
  if ((location.hash === '#admin') !== !!document.querySelector('.admin')) location.reload();
});
