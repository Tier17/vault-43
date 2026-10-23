import { unlockAudio, sfx } from '../core/audio.js?v=6af64c95';
import { startMusic } from '../core/music.js?v=6af64c95';
import { sleep, reducedMotion } from '../core/util.js?v=6af64c95';

// The first screen: a file header that types itself out, then one button.
// The button tap also unlocks audio for everything after it.
export async function intro(el, { gate }) {
  el.classList.add('intro');
  el.innerHTML = `
    <div class="intro__file">
      <div class="intro__rows" role="status" aria-live="polite"></div>
      <button class="btn intro__go" type="button">Open the vault</button>
    </div>`;
  const rows = el.querySelector('.intro__rows');
  const go = el.querySelector('.intro__go');

  let skip = reducedMotion();
  const onSkip = () => { skip = true; };
  el.addEventListener('pointerdown', onSkip);

  const caret = document.createElement('span');
  caret.className = 'intro__caret';

  for (const [key, val] of gate.intro) {
    const row = document.createElement('div');
    row.className = 'intro__row';
    row.innerHTML = `<span class="intro__key"></span><span class="intro__dots"></span><span class="intro__val"></span>`;
    const v = row.querySelector('.intro__val');
    if (val === 'LOCKED') v.dataset.tone = 'locked';
    if (val === gate.recipient) v.dataset.tone = 'name';
    rows.append(row);
    await typeInto(row.querySelector('.intro__key'), key, 12, () => skip, caret);
    if (!skip) await sleep(60);
    await typeInto(v, val, 26, () => skip, caret);
    if (!skip) await sleep(140);
  }
  el.removeEventListener('pointerdown', onSkip);

  go.classList.add('is-ready');
  go.focus({ preventScroll: true });

  await new Promise((resolve) => {
    go.addEventListener('click', () => {
      unlockAudio();
      startMusic();
      sfx.press();
      resolve();
    }, { once: true });
  });
  caret.remove();
}

async function typeInto(node, text, speed, skipped, caret) {
  node.after(caret);
  if (skipped()) {
    node.textContent = text;
    return;
  }
  for (let i = 1; i <= text.length; i++) {
    if (skipped()) {
      node.textContent = text;
      return;
    }
    node.textContent = text.slice(0, i);
    await sleep(speed);
  }
}
