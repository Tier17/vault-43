import { buzz, play, sfx } from '../core/audio.js?v=6af64c95';
import { eggSticker } from '../core/egg.js?v=6af64c95';
import { decorateReward, missionFrame } from '../core/mission.js?v=6af64c95';
import { esc, sleep } from '../core/util.js?v=6af64c95';

// Mission 01. Complaint files from the village land on the desk one at a
// time; he stamps each one. The last file closes the case.
export async function troublemaker(el, ctx) {
  const data = ctx.manifest.story.troublemaker;
  el.classList.add('cases');
  el.innerHTML = `
    <div class="cases__lamp" aria-hidden="true"></div>
    <p class="cases__intro">${esc(data.intro)}</p>
    <div class="cases__pile" aria-hidden="true"></div>
    <div class="cases__slot"></div>
    <p class="cases__help" aria-live="polite"></p>
    <div class="cases__count"><b>0</b> / ${data.files.length}</div>`;

  let left = false;
  const leave = missionFrame(el, ctx).then(() => { left = true; return 'left'; });
  const $ = (s) => el.querySelector(s);
  const slot = $('.cases__slot');
  const pile = $('.cases__pile');
  const help = $('.cases__help');
  eggSticker(el, 'cases', 'right: 7%; top: 24%; --r: -11deg;', ctx.manifest.story.egg);

  await race(sleep(1000), leave);
  $('.cases__intro').classList.add('is-gone');

  for (const [i, f] of data.files.entries()) {
    if (left) return false;
    const last = i === data.files.length - 1;
    const paper = document.createElement('article');
    paper.className = 'paper';
    paper.style.setProperty('--r', `${(Math.random() * 3 - 1.5).toFixed(2)}deg`);
    paper.innerHTML = `
      <header class="paper__head">
        <span>${esc(data.register)}</span>
        <span>Case ${String(i + 1).padStart(2, '0')}</span>
      </header>
      <dl class="paper__fields">
        ${[['Date', f.date], ['Complainant', f.complainant], ['Accused', f.accused], ['Offence', f.offence], ['Remarks', f.remarks]]
          .map(([k, v]) => `<div class="paper__row"><dt>${k}</dt><dd data-text="${esc(v)}"></dd></div>`).join('')}
      </dl>
      <footer class="paper__foot">
        <span>Verdict</span>
        <span class="paper__sign">${esc(data.signed)}</span>
      </footer>`;
    slot.append(paper);
    play('hiss', { gain: 0.18, rate: 1.6, cutoff: 1400 });
    await sleep(30);
    paper.classList.add('is-in');
    await race(sleep(350), leave);

    // type the file out
    for (const dd of paper.querySelectorAll('dd')) {
      const text = dd.dataset.text;
      for (let k = 1; k <= text.length; k++) {
        if (left) return false;
        dd.textContent = text.slice(0, k);
        if (k % 2 === 0) sfx.type();
        await sleep(text[k - 1] === ' ' ? 4 : 8);
      }
    }

    help.textContent = last ? 'One more stamp. Close the case.' : 'Click anywhere on the file to stamp it.';
    paper.classList.add('is-ready');
    const hit = await race(stampClick(paper), leave);
    if (hit === 'left') return false;
    help.textContent = '';

    const stamp = document.createElement('div');
    stamp.className = `stamp${last ? ' stamp--closed' : ''}`;
    stamp.textContent = f.stamp;
    stamp.style.left = `${hit.x}px`;
    stamp.style.top = `${hit.y}px`;
    stamp.style.setProperty('--r', `${(Math.random() * 14 - 10).toFixed(1)}deg`);
    paper.append(stamp);
    paper.classList.remove('is-ready');
    await sleep(90);
    sfx.clunk();
    sfx.boom(last ? 0.8 : 0.45);
    buzz(last ? [60, 40, 120] : 50);
    paper.classList.add('is-hit');
    $('.cases__count b').textContent = String(i + 1);
    await race(sleep(last ? 1000 : 550), leave);

    if (!last) {
      // into the pile on the left
      paper.classList.add('is-out');
      await sleep(420);
      paper.classList.remove('is-in', 'is-out', 'is-hit');
      paper.classList.add('is-piled');
      paper.style.setProperty('--pr', `${(Math.random() * 16 - 8).toFixed(1)}deg`);
      paper.style.setProperty('--px', `${Math.round(Math.random() * 30 - 15)}px`);
      paper.style.setProperty('--py', `${Math.round(Math.random() * 24 - 12)}px`);
      pile.append(paper);
    }
  }

  // reward
  const out = document.createElement('div');
  out.className = 'cases__reward';
  out.innerHTML = `
    <p class="cases__gain">${esc(data.reward)}</p>
    <button class="btn" type="button">Back to the map</button>`;
  decorateReward(out, ctx);
  el.append(out);
  sfx.granted();
  await sleep(30);
  out.classList.add('is-on');
  const done = await race(new Promise((r) => out.querySelector('button').addEventListener('click', () => r(true))), leave);
  if (done === 'left') return false;
  sfx.press();
  return true;
}

function race(p, leave) {
  return Promise.race([p, leave]);
}

function stampClick(paper) {
  return new Promise((resolve) => {
    const onDown = (e) => {
      const box = paper.getBoundingClientRect();
      // keep the stamp inside the paper
      const x = Math.min(box.width - 110, Math.max(110, e.clientX - box.left));
      const y = Math.min(box.height - 50, Math.max(50, e.clientY - box.top));
      paper.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      resolve({ x, y });
    };
    const onKey = (e) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      e.preventDefault();
      paper.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      const box = paper.getBoundingClientRect();
      resolve({ x: box.width * 0.62, y: box.height * 0.7 });
    };
    paper.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
  });
}
