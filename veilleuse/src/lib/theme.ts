export type Theme = 'dark' | 'light';

// Couleurs de fond, reprises dans index.html et le manifeste pour éviter tout flash blanc.
const BACKGROUND: Record<Theme, string> = { dark: '#17110e', light: '#f7efe6' };

export function getTheme(): Theme {
  try {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // Stockage indisponible (navigation privée) : le thème vaut pour la session.
  }
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BACKGROUND[theme]);
}
