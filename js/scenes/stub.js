import { sfx } from '../core/audio.js?v=6af64c95';
import { esc } from '../core/util.js?v=6af64c95';

// Placeholder for a mission that isn't built yet. "Complete" lets the whole
// campaign be walked through while chapters are still being made.
export async function stub(el, { mission }) {
  el.classList.add('stub');
  el.innerHTML = `
    <div class="stub__box">
      <h1 class="stub__title">${esc(mission.title)}</h1>
      <p class="stub__note">This mission is still being built.</p>
      <div class="stub__row">
        <button class="btn" type="button" data-act="back">Back to map</button>
        <button class="btn" type="button" data-act="done">Mark complete</button>
      </div>
    </div>`;
  return new Promise((resolve) => {
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      sfx.press();
      resolve(act === 'done');
    });
  });
}
