import { buzz, play } from './audio.js?v=6af64c95';

// The easter egg: little stickers hidden around the missions. Peel them
// all and the post-credits scene changes. The sticker's words come from
// the encrypted story, so this file gives nothing away.

const KEY = 'egg-pieces';
export const EGG_TOTAL = 5;

function load() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export function eggFound() {
  return load().size;
}

/**
 * Sticks a sticker into `el`. `style` positions it (CSS text, absolute);
 * `egg` is story.egg: { label, sub, toast, toastLast }.
 */
export function eggSticker(el, id, style, egg) {
  const found = load();
  if (found.has(id)) return;
  const s = document.createElement('button');
  s.type = 'button';
  s.className = 'egg-sticker';
  s.setAttribute('aria-label', egg.label);
  s.style.cssText = style;
  s.innerHTML = `<b>${egg.label}</b><i>${egg.sub}</i>`;
  s.addEventListener('pointerdown', (e) => e.stopPropagation());
  s.addEventListener('click', (e) => {
    e.stopPropagation();
    const now = load();
    now.add(id);
    try {
      localStorage.setItem(KEY, JSON.stringify([...now]));
    } catch {
      // ignore
    }
    s.classList.add('is-peeled');
    play('swish', { gain: 0.4, rate: 0.8, cutoff: 1800 });
    play('granted', { gain: 0.3, rate: 1.4, cutoff: 2600 });
    buzz(30);
    const toast = document.createElement('p');
    toast.className = 'egg-toast';
    toast.textContent = (now.size >= EGG_TOTAL ? egg.toastLast : egg.toast)
      .replace('{n}', String(now.size)).replace('{total}', String(EGG_TOTAL));
    document.body.append(toast);
    setTimeout(() => toast.remove(), 2600);
    setTimeout(() => s.remove(), 600);
  });
  el.append(s);
}
