// Ressort amorti pour les feuilles et les cartes : un léger dépassement, puis
// le repos. Plus vivant qu'une courbe de Bézier, et la vitesse du geste est
// conservée au lâcher.

export interface SpringOptions {
  stiffness?: number;
  damping?: number;
  mass?: number;
  velocity?: number;
}

export function animateSpring(
  from: number,
  to: number,
  onUpdate: (v: number) => void,
  { stiffness = 420, damping = 36, mass = 1, velocity = 0 }: SpringOptions = {},
  reduced = false,
): () => void {
  if (reduced) {
    onUpdate(to);
    return () => {};
  }
  let x = from;
  let v = velocity;
  let last = performance.now();
  let raf = 0;
  const step = (t: number) => {
    const dt = Math.min(0.032, (t - last) / 1000);
    last = t;
    const force = -stiffness * (x - to) - damping * v;
    v += (force / mass) * dt;
    x += v * dt;
    if (Math.abs(v) < 4 && Math.abs(x - to) < 0.4) {
      onUpdate(to);
      return;
    }
    onUpdate(x);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

export function prefersReducedMotion(): boolean {
  return document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
}
