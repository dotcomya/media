// Icônes au trait (24 × 24), toujours accompagnées d'un libellé dans l'interface.
// La classe « f » donne un léger remplissage de la couleur du trait.

const PATHS = {
  check: <path d="m4.5 12.5 5 5 10-10.5" />,
  alarm: (
    <>
      <circle class="f" cx="12" cy="13" r="7.5" />
      <path d="M12 9v4l2.5 2M4.5 4.5 2.5 6.5M19.5 4.5l2 2M7 19.5 5.5 21M17 19.5l1.5 1.5" />
    </>
  ),
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
