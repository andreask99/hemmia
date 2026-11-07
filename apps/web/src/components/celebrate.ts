/**
 * Small rewards for ticking things off: a confetti burst from the checkbox, and for the big
 * moments (day won, goal reached, all done) fireworks across the screen plus a short cheer.
 * Plain DOM, no dependency; styles use the CSSOM (allowed by the CSP's style-src 'self').
 * With "reduce motion" there are no particles, only the cheer.
 */

const COLORS = ['var(--forest)', '#d4a73a', '#e07a5f', '#6fa8c9', '#9bc59d', '#e9c46a'];

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** A burst of `count` particles from (x, y) in viewport pixels. */
function burst(layer: HTMLElement, x: number, y: number, count: number, reach: number) {
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'kc-particle';
    const angle = (i / count) * 2 * Math.PI + Math.random() * 0.4;
    const distance = reach * (0.6 + Math.random() * 0.4);
    const size = 5 + Math.random() * 4;
    p.style.setProperty('left', `${x}px`);
    p.style.setProperty('top', `${y}px`);
    p.style.setProperty('width', `${size}px`);
    p.style.setProperty('height', `${Math.random() < 0.5 ? size : size * 0.5}px`);
    p.style.setProperty('background', COLORS[i % COLORS.length] ?? '#d4a73a');
    p.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
    p.style.setProperty('--rot', `${Math.round(Math.random() * 720 - 360)}deg`);
    layer.append(p);
  }
}

/** The cheer: a short pill at the top, announced to screen readers. */
function cheer(layer: HTMLElement, text: string) {
  const note = document.createElement('div');
  note.className = 'kc-cheer';
  note.setAttribute('role', 'status');
  note.textContent = text;
  layer.append(note);
}

export interface CelebrateOptions {
  /** Where the burst starts (usually the checkbox). */
  from?: Element | null;
  /** Fireworks and a cheer instead of a small burst. */
  big?: boolean;
  /** Shown for big moments. */
  text?: string;
}

export function celebrate({ from, big = false, text }: CelebrateOptions = {}) {
  const layer = document.createElement('div');
  layer.className = 'kc-celebration';
  document.body.append(layer);
  const motion = !reducedMotion();

  if (motion) {
    const rect = from?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    burst(layer, x, y, big ? 24 : 14, big ? 110 : 60);
    if (big) {
      // Three rockets over the upper half of the screen, one after the other.
      for (let i = 0; i < 3; i++) {
        setTimeout(
          () => {
            burst(
              layer,
              window.innerWidth * (0.2 + 0.3 * i + Math.random() * 0.1),
              window.innerHeight * (0.15 + Math.random() * 0.25),
              28,
              90 + Math.random() * 50,
            );
          },
          250 + i * 300,
        );
      }
    }
  }
  if (big && text) cheer(layer, text);

  setTimeout(
    () => {
      layer.remove();
    },
    big ? 2800 : 1200,
  );
}
