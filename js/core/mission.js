import { sfx } from './audio.js?v=6af64c95';
import { esc } from './util.js?v=6af64c95';

// Shared frame for every mission: a small header with the mission name and
// a way back to the map. Returns a promise that resolves if he leaves early.
export function missionFrame(el, { mission, manifest }) {
  const i = manifest.story.missions.indexOf(mission) + 1;
  const bar = document.createElement('header');
  bar.className = 'mbar';
  bar.innerHTML = `
    <span class="mbar__n">${String(i).padStart(2, '0')}</span>
    <span class="mbar__title">${esc(mission.title)}</span>
    <button class="mbar__back" type="button">Map</button>`;
  el.append(bar);
  return new Promise((resolve) => {
    bar.querySelector('.mbar__back').addEventListener('click', () => {
      sfx.press();
      resolve(false);
    });
  });
}

/**
 * Dresses a mission's reward overlay the same way everywhere: which mission,
 * the levels gained and every stat that went up, around the scene's own
 * headline and lines.
 */
export function decorateReward(box, { mission, manifest }) {
  const story = manifest.story;
  const i = story.missions.indexOf(mission) + 1;
  const kicker = document.createElement('p');
  kicker.className = 'rw__kicker';
  kicker.textContent = `Mission ${String(i).padStart(2, '0')} complete`;
  box.prepend(kicker);
  const chips = document.createElement('ul');
  chips.className = 'rw__chips';
  const items = [];
  if (mission.xp) items.push(`<li class="rw__lvl">+${mission.xp} ${mission.xp === 1 ? 'level' : 'levels'}</li>`);
  story.stats.forEach((s, k) => {
    if (mission.gain[k]) items.push(`<li>${esc(s)} <b>+${mission.gain[k]}</b></li>`);
  });
  chips.innerHTML = items.join('');
  const button = box.querySelector('button');
  box.insertBefore(chips, button);
  box.classList.add('rw');
}
