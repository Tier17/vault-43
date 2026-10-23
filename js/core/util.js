export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Signed shortest difference a - b in degrees, in [-180, 180). */
export const angleDiff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

/** Picks from a list without repeating the previous pick. */
export function picker(list) {
  let last = -1;
  return () => {
    if (list.length < 2) return list[0];
    let i;
    do i = Math.floor(Math.random() * list.length); while (i === last);
    last = i;
    return list[i];
  };
}

export const storage = {
  get(key) {
    try { return sessionStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { sessionStorage.setItem(key, value); } catch { /* blocked */ }
  },
  remove(key) {
    try { sessionStorage.removeItem(key); } catch { /* blocked */ }
  },
};
