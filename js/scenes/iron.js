import { buzz, play, sfx } from '../core/audio.js?v=6af64c95';
import { mediaUrl, preload } from '../core/media.js?v=6af64c95';
import { decorateReward, missionFrame } from '../core/mission.js?v=6af64c95';
import { esc, sleep } from '../core/util.js?v=6af64c95';

// Mission 10. Ramadan, after iftar. Load the bar to 170 kg, then pull: hold
// to add tension and keep the needle in the green while the bar rises.

const PLATE_COLOURS = { 25: '#c8302c', 20: '#2a5bd7', 15: '#e8b923', 10: '#2f9e55', 5: '#ecebe6', 2.5: '#555a61' };
const PLATE_H = { 25: 200, 20: 200, 15: 176, 10: 150, 5: 110, 2.5: 84 };
const PLATE_W = { 25: 26, 20: 22, 15: 20, 10: 18, 5: 14, 2.5: 10 };

export async function iron(el, ctx) {
  const data = ctx.manifest.story.iron;
  preload(ctx, data.photos.map((p) => p.src));
  el.classList.add('iron');
  el.innerHTML = `
    <header class="iron__head">
      <p class="iron__when"><span class="iron__moon" aria-hidden="true"></span>${esc(data.when)}</p>
      <h1 class="iron__title">${esc(data.title)}</h1>
    </header>
    <aside class="iron__board">
      ${data.board.map(([who, lift]) => `<p><span>${esc(who)}</span><b>${esc(lift)}</b></p>`).join('')}
    </aside>
    <div class="iron__stage">
      <svg class="bar" viewBox="0 0 1000 420" aria-label="Barbell">
        <line x1="40" y1="380" x2="960" y2="380" class="bar__floor"/>
        <g class="bar__lift">
          <rect x="70" y="268" width="860" height="12" rx="6" class="bar__rod"/>
          <rect x="230" y="262" width="20" height="24" rx="3" class="bar__collar"/>
          <rect x="750" y="262" width="20" height="24" rx="3" class="bar__collar"/>
          <g class="bar__left"></g>
          <g class="bar__right"></g>
        </g>
      </svg>
      <p class="iron__weight"><b>20</b> kg</p>
    </div>
    <div class="iron__controls">
      <div class="iron__plates">
        ${data.plates.map((p) => `<button class="plate-btn" type="button" data-kg="${p}" style="--c:${PLATE_COLOURS[p]}">${p}</button>`).join('')}
        <button class="plate-btn plate-btn--undo" type="button" data-kg="undo">Undo</button>
      </div>
      <div class="tension" hidden>
        <span class="tension__zone"></span>
        <span class="tension__needle"></span>
      </div>
      <button class="btn iron__pull" type="button" hidden>${esc(data.pull)}</button>
      <p class="iron__help" aria-live="polite">${esc(data.loadHelp)}</p>
    </div>`;

  let left = false;
  const leave = missionFrame(el, ctx).then(() => { left = true; });
  const $ = (s) => el.querySelector(s);
  const race = (p) => Promise.race([p, leave]);
  const help = $('.iron__help');

  // ---------- load the bar ----------

  const side = [];
  const kg = () => 20 + side.reduce((a, b) => a + b, 0) * 2;
  function drawPlates() {
    for (const [sel, dir, x0] of [['.bar__left', -1, 230], ['.bar__right', 1, 770]]) {
      let x = x0;
      $(sel).innerHTML = side.map((p) => {
        const w = PLATE_W[p];
        const h = PLATE_H[p];
        const px = dir < 0 ? x - w : x;
        x += dir * (w + 2);
        return `<rect x="${px}" y="${274 - h / 2}" width="${w}" height="${h}" rx="3" fill="${PLATE_COLOURS[p]}" class="bar__plate"/>`;
      }).join('');
    }
    $('.iron__weight b').textContent = String(kg());
    $('.iron__weight').dataset.ok = kg() === data.target ? 'true' : 'false';
  }
  drawPlates();

  await race(new Promise((resolve) => {
    $('.iron__plates').addEventListener('click', (e) => {
      const b = e.target.closest('.plate-btn');
      if (!b) return;
      if (b.dataset.kg === 'undo') {
        side.pop();
        sfx.tick();
      } else {
        const p = Number(b.dataset.kg);
        if (kg() + p * 2 > data.target) {
          help.textContent = data.tooHeavy;
          sfx.denied();
          return;
        }
        side.push(p);
        play('plate', { gain: 0.7, rate: 0.9 + Math.random() * 0.1, cutoff: 2600 });
        buzz(25);
      }
      drawPlates();
      help.textContent = kg() === data.target ? data.loaded : data.loadHelp;
      if (kg() === data.target) resolve();
    });
  }));
  if (left) return false;
  await race(sleep(700));

  // ---------- the pull ----------

  $('.iron__plates').hidden = true;
  const tension = $('.tension');
  const needle = $('.tension__needle');
  const zone = $('.tension__zone');
  const pull = $('.iron__pull');
  tension.hidden = false;
  pull.hidden = false;
  help.textContent = data.pullHelp;

  let holding = false;
  const hold = (on) => { holding = on; pull.classList.toggle('is-held', on); };
  pull.addEventListener('pointerdown', (e) => { e.preventDefault(); hold(true); });
  const off = () => hold(false);
  window.addEventListener('pointerup', off);
  const onKey = (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    hold(e.type === 'keydown');
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  const lift = $('.bar__lift');
  let n = 0.15; // needle position 0..1
  let v = 0;
  let height = 0; // 0 floor .. 1 lockout
  let zoneAt = 0.55;
  let warned = 0;
  let last = performance.now();
  await race(new Promise((resolve) => {
    const loop = (now) => {
      if (left) return resolve();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // the sweet spot drifts as the bar moves, so it never sits still
      zoneAt = 0.55 + Math.sin(now / 900) * 0.16 + Math.sin(now / 370) * 0.05;
      v += (holding ? 2.6 : -2.2) * dt;
      v *= 0.9;
      n = Math.max(0, Math.min(1, n + v * dt * 6));
      const inZone = Math.abs(n - zoneAt) < 0.12;
      if (inZone) height = Math.min(1, height + dt / data.pullSeconds);
      else if (n > zoneAt) {
        height = Math.max(0, height - dt * 0.12);
        if (now - warned > 1400) { warned = now; help.textContent = data.tooMuch; }
      } else {
        height = Math.max(0, height - dt * 0.06);
      }
      needle.style.left = `${n * 100}%`;
      zone.style.left = `${(zoneAt - 0.12) * 100}%`;
      tension.dataset.ok = inZone ? 'true' : 'false';
      const shake = inZone ? (Math.random() - 0.5) * 2 : (Math.random() - 0.5) * 4;
      lift.setAttribute('transform', `translate(${shake.toFixed(1)} ${(-height * 120).toFixed(1)})`);
      if (height >= 1) return resolve();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }));
  window.removeEventListener('pointerup', off);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  if (left) return false;

  // lockout
  hold(false);
  tension.hidden = true;
  pull.hidden = true;
  lift.setAttribute('transform', 'translate(0 -120)');
  sfx.slam(1);
  sfx.reveal(0.5);
  buzz([80, 40, 200]);
  el.classList.add('is-lockout');
  help.textContent = '';
  const call = document.createElement('p');
  call.className = 'iron__call';
  call.innerHTML = `<b>${esc(data.lockout[0])}</b><span>${esc(data.lockout[1])}</span>`;
  el.append(call);
  await race(sleep(1600));
  lift.setAttribute('transform', 'translate(0 0)');
  play('drop', { gain: 0.8, rate: 0.7, cutoff: 1600 });
  play('plate', { gain: 0.6, rate: 0.6, at: 0.05, cutoff: 1400 });
  buzz(120);
  await race(sleep(900));
  call.remove();
  if (left) return false;

  // the crew
  const crew = document.createElement('div');
  crew.className = 'vehicles crew';
  crew.innerHTML = `
    <div class="crew__box">
      <h2 class="vehicles__title">${esc(data.crewTitle)}</h2>
      <div class="crew__photos">
        ${data.photos.map((p) => `<figure><img alt="${esc(p.caption)}"><figcaption>${esc(p.caption)}</figcaption></figure>`).join('')}
      </div>
      <p class="crew__line">${esc(data.crewLine)}</p>
      <button class="btn" type="button">Continue</button>
    </div>`;
  el.append(crew);
  await Promise.all(data.photos.map(async (p, i) => {
    try { crew.querySelectorAll('img')[i].src = await mediaUrl(ctx, p.src); } catch { /* skip */ }
  }));
  await sleep(30);
  crew.classList.add('is-on');
  const go = await race(new Promise((r) => crew.querySelector('button').addEventListener('click', () => r(true))));
  if (go !== true) return false;
  sfx.press();
  crew.remove();

  const reward = document.createElement('div');
  reward.className = 'cases__reward';
  reward.innerHTML = `<p class="cases__gain">${esc(data.reward)}</p><button class="btn" type="button">Back to the map</button>`;
  decorateReward(reward, ctx);
  el.append(reward);
  sfx.granted();
  await sleep(30);
  reward.classList.add('is-on');
  return race(new Promise((r) => reward.querySelector('button').addEventListener('click', () => { sfx.press(); r(true); })))
    .then((x) => x === true);
}
