// Icônes au trait (24 × 24), toujours accompagnées d'un libellé dans l'interface.
// La classe « f » donne un léger remplissage de la couleur du trait.

const PATHS = {
  breast: (
    <>
      <path class="f" d="M3.5 9.5a8.5 8.5 0 0 0 17 0" />
      <circle cx="12" cy="13.5" r="1.6" fill="currentColor" />
    </>
  ),
  bottle: (
    <>
      <path class="f" d="M8 9.5 10 6V3h4v3l2 3.5V20a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 20Z" />
      <path d="M9 3h6M8 13h3M8 16.5h3" />
    </>
  ),
  pee: <path class="f" d="M12 3c3.6 4.6 6 8 6 11a6 6 0 0 1-12 0c0-3 2.4-6.4 6-11Z" />,
  poop: (
    <>
      <rect class="f" x="3.5" y="15" width="17" height="5.5" rx="2.75" />
      <rect class="f" x="6" y="10" width="12" height="5" rx="2.5" />
      <path class="f" d="M8.8 10a3.2 3.2 0 0 1 3.2-3.2c.4-1.2.2-2.3-.5-3.3 2.6.3 4.2 2.4 3.6 5a3 3 0 0 1 .3 1.5" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-10.5" />,
  share: <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />,
  download: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14" />,
  settings: (
    <>
      <path d="M4 7h9M19 7h1M4 17h2M12 17h8" />
      <circle cx="16" cy="7" r="2.5" />
      <circle cx="9" cy="17" r="2.5" />
    </>
  ),
  next: <path d="m9 5 7 7-7 7" />,
  trash: <path d="M4.5 7h15M10 7V4h4v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  moon: <path class="f" d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10Z" />,
  sun: (
    <>
      <circle class="f" cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
