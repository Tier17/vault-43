import { buzz, fadeOut, play, sfx } from '../core/audio.js?v=6af64c95';
import { decorateReward, missionFrame } from '../core/mission.js?v=6af64c95';
import { esc, sleep } from '../core/util.js?v=6af64c95';

// Mission 05. Hold to work, the tank fills. Temptations pop up; say no
// fast or they take a bite out of the savings. A full tank starts the bike.
export async function saving(el, ctx) {
  const data = ctx.manifest.story.saving;
  el.classList.add('saving');
  el.innerHTML = `
    <div class="saving__stage">
      <svg class="tank" viewBox="0 0 520 300" role="img" aria-label="Fuel tank filling with savings">
        <defs>
          <clipPath id="tankShape">
            <path d="M40 210 C 30 150, 70 90, 150 70 C 230 50, 330 48, 410 70 C 470 88, 500 130, 490 190 C 484 226, 450 246, 400 248 L 120 252 C 75 252, 46 238, 40 210 Z"/>
          </clipPath>
          <linearGradient id="fuel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffcf5a"/>
            <stop offset="1" stop-color="#d98a12"/>
          </linearGradient>
          <linearGradient id="tankBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#3a3d42"/>
            <stop offset="1" stop-color="#1c1e21"/>
          </linearGradient>
        </defs>
        <path d="M40 210 C 30 150, 70 90, 150 70 C 230 50, 330 48, 410 70 C 470 88, 500 130, 490 190 C 484 226, 450 246, 400 248 L 120 252 C 75 252, 46 238, 40 210 Z" fill="url(#tankBody)"/>
        <g clip-path="url(#tankShape)">
          <rect class="tank__fuel" x="0" y="300" width="520" height="300" fill="url(#fuel)"/>
          <path class="tank__wave" d="M0 0 Q 32 -8 65 0 T 130 0 T 195 0 T 260 0 T 325 0 T 390 0 T 455 0 T 520 0 T 585 0 V 20 H 0 Z" fill="#ffd978"/>
        </g>
        <path d="M40 210 C 30 150, 70 90, 150 70 C 230 50, 330 48, 410 70 C 470 88, 500 130, 490 190 C 484 226, 450 246, 400 248 L 120 252 C 75 252, 46 238, 40 210 Z" fill="none" stroke="#5c6067" stroke-width="3"/>
        <path d="M120 92 C 200 70, 320 66, 400 86" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="6" stroke-linecap="round"/>
        <ellipse cx="300" cy="62" rx="46" ry="10" fill="#2b2e33" stroke="#6a6f76" stroke-width="3"/>
        <text x="270" y="190" class="tank__label">${esc(data.label)}</text>
      </svg>
      <div class="gauge" aria-live="polite">
        <span class="gauge__e">E</span>
        <span class="gauge__bar"><span class="gauge__fill"></span></span>
        <span class="gauge__f">F</span>
      </div>
      <p class="saving__stats"><span>${esc(data.monthsLabel)} <b class="saving__months">0</b></span><span><b class="saving__pct">0</b>%</span></p>
      <button class="btn saving__work" type="button">${esc(data.button)}</button>
      <p class="saving__help">${esc(data.help)}</p>
    </div>
    <div class="tempt" hidden>
      <p class="tempt__kicker">${esc(data.temptKicker)}</p>
      <p class="tempt__what"></p>
      <p class="tempt__cost"></p>
      <button class="btn tempt__no" type="button">${esc(data.no)}</button>
      <span class="tempt__timer"><span></span></span>
    </div>`;

  let left = false;
  const leave = missionFrame(el, ctx).then(() => { left = true; });
  const $ = (s) => el.querySelector(s);
  const work = $('.saving__work');
  const tempt = $('.tempt');
  const fuel = $('.tank__fuel');
  const wave = $('.tank__wave');

  let level = 0; // 0..1
  let months = 0;
  let holding = false;
  let paused = false;
  let lastTempt = performance.now();
  let nextTempt = 1800;
  const pool = [...data.temptations].sort(() => Math.random() - 0.5);

  const press = (on) => {
    if (paused && on) return;
    holding = on;
    work.classList.toggle('is-held', on);
    if (on) sfx.press();
  };
  work.addEventListener('pointerdown', (e) => { e.preventDefault(); press(true); });
  window.addEventListener('pointerup', () => press(false));
  work.addEventListener('pointerleave', () => press(false));
  const onKey = (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    if (e.type === 'keydown') press(true);
    else press(false);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  function paint(t) {
    const y = 252 - level * 205;
    fuel.setAttribute('y', String(y));
    wave.setAttribute('transform', `translate(${-((t / 12) % 130)} ${y - 6})`);
    $('.gauge__fill').style.transform = `scaleX(${level})`;
    $('.saving__pct').textContent = String(Math.round(level * 100));
    $('.saving__months').textContent = String(months);
  }

  async function temptation() {
    paused = true;
    press(false);
    const t = pool.length ? pool.shift() : data.temptations[Math.floor(Math.random() * data.temptations.length)];
    $('.tempt__what').textContent = t.what;
    $('.tempt__cost').textContent = t.cost;
    tempt.hidden = false;
    tempt.style.setProperty('--decide', `${data.decideSeconds}s`);
    tempt.classList.remove('is-on');
    void tempt.offsetWidth;
    tempt.classList.add('is-on');
    play('granted', { gain: 0.25, rate: 1.5, cutoff: 2600 });
    const said = await Promise.race([
      new Promise((r) => $('.tempt__no').addEventListener('click', () => r(true), { once: true })),
      sleep(data.decideSeconds * 1000).then(() => false),
      leave.then(() => false),
    ]);
    tempt.hidden = true;
    if (said) {
      sfx.press();
      flash(data.saidNo, 'good');
    } else if (!left) {
      level = Math.max(0, level - 0.12);
      sfx.denied();
      buzz(80);
      flash(data.gaveIn, 'bad');
    }
    paused = false;
    lastTempt = performance.now();
    nextTempt = 2000 + Math.random() * 1400;
  }

  function flash(text, tone) {
    const help = $('.saving__help');
    help.textContent = text;
    help.dataset.tone = tone;
    clearTimeout(flash.t);
    flash.t = setTimeout(() => { help.textContent = data.help; delete help.dataset.tone; }, 1600);
  }

  let last = performance.now();
  let monthAcc = 0;
  let raf = 0;
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (holding && !paused) {
      level = Math.min(1, level + dt / data.secondsToFill);
      monthAcc += dt;
      if (monthAcc > data.secondsToFill / data.months) {
        monthAcc = 0;
        months += 1;
        sfx.tick();
      }
    }
    paint(now);
    if (!paused && holding && level < 1 && now - lastTempt > nextTempt) temptation();
    if (level < 1 && !left) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  while (level < 1 && !left) await sleep(80);
  cancelAnimationFrame(raf);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  if (left) return false;

  // full tank: start the engine
  paint(performance.now());
  work.disabled = true;
  work.textContent = data.full;
  el.classList.add('is-full');
  sfx.clunk();
  await sleep(300);
  const engine = play('rumble', { gain: 0.6, rate: 1.1, fadeIn: 0.15, cutoff: 1200 });
  sfx.boom(0.6);
  buzz([60, 40, 60, 40, 200]);
  await sleep(1300);
  fadeOut(engine, 1);

  const reward = document.createElement('div');
  reward.className = 'cases__reward';
  reward.innerHTML = `<p class="cases__gain">${esc(data.reward)}</p><p class="pc__epilogue">${esc(data.epilogue)}</p><button class="btn" type="button">Back to the map</button>`;
  decorateReward(reward, ctx);
  el.append(reward);
  sfx.granted();
  await sleep(30);
  reward.classList.add('is-on');
  return Promise.race([
    new Promise((r) => reward.querySelector('button').addEventListener('click', () => { sfx.press(); r(true); })),
    leave.then(() => false),
  ]);
}
