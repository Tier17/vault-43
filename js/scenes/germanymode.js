import { buzz, play, sfx } from '../core/audio.js?v=6af64c95';
import { mediaUrl, preload } from '../core/media.js?v=6af64c95';
import { decorateReward, missionFrame } from '../core/mission.js?v=6af64c95';
import { duckMusic } from '../core/music.js?v=6af64c95';
import { esc, sleep } from '../core/util.js?v=6af64c95';

// Mission 08. He's home from Germany, so the house gets fixed: hold each
// hotspot on the floor plan until it's done. Last on the list is Sameer's
// bike, which gets turned into his dream build.
export async function germanymode(el, ctx) {
  const data = ctx.manifest.story.germanymode;
  preload(ctx, data.evidence.map((e) => e.video));
  el.classList.add('gm');
  el.innerHTML = `
    <aside class="gm__list">
      <span class="gm__flag" aria-hidden="true"><i></i><i></i><i></i></span>
      <h1 class="gm__title">${esc(data.title)}</h1>
      <p class="gm__status">${esc(data.status)}</p>
      <ol class="gm__tasks">
        ${data.fixes.map((f) => `<li data-id="${f.id}"><span class="gm__box"></span><span class="gm__task">${esc(f.task)}</span><span class="gm__note"></span></li>`).join('')}
      </ol>
      <p class="gm__help">${esc(data.help)}</p>
    </aside>
    <div class="plan">
      <svg class="plan__svg" viewBox="0 0 1000 620" aria-hidden="true">${planSvg(data.rooms)}</svg>
      ${data.fixes.map((f) => `
        <button class="spot" type="button" data-id="${f.id}" style="left:${f.x / 10}%;top:${(f.y / 620) * 100}%" ${f.last ? 'disabled' : ''}>
          <span class="spot__ring"></span><span class="spot__dot"></span><span class="spot__label">${esc(f.label)}</span>
        </button>`).join('')}
    </div>`;

  let left = false;
  const leave = missionFrame(el, ctx).then(() => { left = true; });
  const $ = (s) => el.querySelector(s);
  const race = (p) => Promise.race([p, leave]);

  const done = new Set();
  const regular = data.fixes.filter((f) => !f.last);
  const last = data.fixes.find((f) => f.last);

  // hold a hotspot until its ring fills
  const finishedAll = new Promise((resolveAll) => {
    el.querySelectorAll('.spot').forEach((spot) => {
      const fix = data.fixes.find((f) => f.id === spot.dataset.id);
      let raf = 0;
      let t0 = 0;
      let holding = false;
      const start = (e) => {
        if (spot.disabled || done.has(fix.id) || holding) return;
        if (e) e.preventDefault();
        holding = true;
        t0 = performance.now();
        spot.classList.add('is-holding');
        play('bolt', { gain: 0.35, rate: 1.3, cutoff: 2000 });
        const loop = (now) => {
          if (!holding) return;
          const p = Math.min(1, (now - t0) / (fix.hold * 1000));
          spot.style.setProperty('--p', String(p));
          if (Math.floor(p * 8) !== Math.floor(((now - 16 - t0) / (fix.hold * 1000)) * 8)) sfx.tick();
          if (p >= 1) return complete();
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      };
      const stop = () => {
        if (!holding) return;
        holding = false;
        cancelAnimationFrame(raf);
        spot.classList.remove('is-holding');
        if (!done.has(fix.id)) spot.style.setProperty('--p', '0');
      };
      const complete = () => {
        holding = false;
        done.add(fix.id);
        spot.classList.remove('is-holding');
        spot.classList.add('is-done');
        spot.disabled = true;
        sfx.clunk();
        buzz(40);
        const li = el.querySelector(`.gm__tasks li[data-id="${fix.id}"]`);
        li.classList.add('is-done');
        li.querySelector('.gm__note').textContent = fix.done;
        if (!fix.last && regular.every((f) => done.has(f.id))) {
          const lastSpot = el.querySelector(`.spot[data-id="${last.id}"]`);
          lastSpot.disabled = false;
          lastSpot.classList.add('is-boss');
          $('.gm__help').textContent = data.lastHelp;
          play('granted', { gain: 0.3, rate: 0.9, cutoff: 2400 });
        }
        if (fix.last) resolveAll();
      };
      spot.addEventListener('pointerdown', start);
      spot.addEventListener('pointerup', stop);
      spot.addEventListener('pointerleave', stop);
      spot.addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) start(e); });
      spot.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'Enter') stop(); });
    });
  });

  await race(finishedAll);
  if (left) return false;
  await race(sleep(300));

  // ---------- Sameer's bike ----------

  const mod = document.createElement('div');
  mod.className = 'mod';
  mod.innerHTML = `
    <div class="mod__box">
      <h2 class="mod__title">${esc(data.bike.title)}</h2>
      <svg class="bike" viewBox="0 0 600 340" role="img" aria-label="Motorbike being modified">${bikeSvg()}</svg>
      <p class="mod__said" aria-live="polite"></p>
      <div class="mod__steps">
        ${data.bike.steps.map((s, i) => `<button class="btn mod__step" type="button" data-i="${i}" ${i ? 'disabled' : ''}>${esc(s.label)}</button>`).join('')}
      </div>
    </div>`;
  el.append(mod);
  await sleep(30);
  mod.classList.add('is-on');
  const bike = mod.querySelector('.bike');
  const said = mod.querySelector('.mod__said');
  for (const [i, step] of data.bike.steps.entries()) {
    const btn = mod.querySelector(`.mod__step[data-i="${i}"]`);
    btn.disabled = false;
    btn.focus({ preventScroll: true });
    await race(new Promise((r) => btn.addEventListener('click', r, { once: true })));
    if (left) return false;
    btn.disabled = true;
    btn.classList.add('is-done');
    if (step.sound === 'paint') play('hiss', { gain: 0.6, rate: 0.9, cutoff: 3000 });
    else { play('bolt', { gain: 0.6, rate: 0.8, cutoff: 2200 }); sfx.clunk(); }
    buzz(50);
    bike.classList.add(`is-${step.state}`);
    said.textContent = `${data.bike.who}: "${step.said}"`;
    said.classList.remove('is-new');
    void said.offsetWidth;
    said.classList.add('is-new');
    await race(sleep(650));
  }
  if (left) return false;
  sfx.granted();
  await race(sleep(1100));
  mod.remove();

  // ---------- the evidence ----------

  const ev = document.createElement('div');
  ev.className = 'vehicles evidence';
  ev.innerHTML = `
    <div class="evidence__box">
      <h2 class="vehicles__title">${esc(data.evidenceTitle)}</h2>
      <div class="evidence__clips">
        ${data.evidence.map((e) => `<figure><video playsinline muted loop preload="auto"></video><figcaption>${esc(e.caption)}</figcaption></figure>`).join('')}
      </div>
      <div class="vehicles__row">
        <button class="btn evidence__sound" type="button">Sound on</button>
        <button class="btn evidence__go" type="button">Continue</button>
      </div>
    </div>`;
  el.append(ev);
  const videos = [...ev.querySelectorAll('video')];
  await Promise.all(data.evidence.map(async (e, i) => {
    try {
      videos[i].src = await mediaUrl(ctx, e.video);
      videos[i].play().catch(() => {});
    } catch {
      videos[i].closest('figure').hidden = true;
    }
  }));
  ev.querySelector('.evidence__sound').addEventListener('click', (e) => {
    duckMusic(true);
    for (const v of videos) { v.muted = false; v.currentTime = 0; v.play().catch(() => {}); }
    e.currentTarget.hidden = true;
  });
  await sleep(30);
  ev.classList.add('is-on');
  const go = await race(new Promise((r) => ev.querySelector('.evidence__go').addEventListener('click', () => r(true))));
  videos.forEach((v) => v.pause());
  duckMusic(false);
  if (go !== true) return false;
  sfx.press();
  ev.remove();

  const reward = document.createElement('div');
  reward.className = 'cases__reward';
  reward.innerHTML = `<p class="cases__gain">${esc(data.reward)}</p><button class="btn" type="button">Back to the map</button>`;
  decorateReward(reward, ctx);
  el.append(reward);
  sfx.granted();
  await sleep(30);
  reward.classList.add('is-on');
  return race(new Promise((r) => reward.querySelector('button').addEventListener('click', () => { sfx.press(); r(true); })))
    .then((v) => v === true);
}

function planSvg(rooms) {
  const walls = rooms.map((r) => `
    <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" class="plan__room${r.open ? ' plan__room--open' : ''}"/>
    <text x="${r.x + 16}" y="${r.y + 28}" class="plan__name">${esc(r.name)}</text>`).join('');
  return `
    <defs>
      <pattern id="pgrid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M20 0H0V20" fill="none" stroke="rgba(236,235,230,0.04)"/>
      </pattern>
    </defs>
    <rect width="1000" height="620" fill="url(#pgrid)"/>
    ${walls}
    <path d="M 40 40 H 960 V 580 H 40 Z" class="plan__outer"/>
    <path d="M 440 560 v 20 M 560 560 v 20" class="plan__door"/>`;
}

function bikeSvg() {
  const spokes = (cx, cy) => Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(a) * 52}" y2="${cy + Math.sin(a) * 52}"/>`;
  }).join('');
  return `
    <g class="bike__wheel"><circle cx="150" cy="255" r="64" class="bike__tyre"/><circle cx="150" cy="255" r="52" class="bike__rim"/><g class="bike__spokes">${spokes(150, 255)}</g><circle cx="150" cy="255" r="8" class="bike__hub"/></g>
    <g class="bike__wheel"><circle cx="455" cy="255" r="64" class="bike__tyre"/><circle cx="455" cy="255" r="52" class="bike__rim"/><g class="bike__spokes">${spokes(455, 255)}</g><circle cx="455" cy="255" r="8" class="bike__hub"/></g>
    <path d="M 150 255 L 250 180 L 380 150 L 420 105 M 250 180 L 300 245 L 150 255 M 300 245 L 380 150 M 420 105 L 455 255" class="bike__frame"/>
    <path class="bike__fender-r" d="M 70 240 A 82 82 0 0 1 200 185 L 206 195 A 70 70 0 0 0 84 246 Z"/>
    <path class="bike__fender-f" d="M 400 215 A 64 64 0 0 1 505 205 L 500 214 A 54 54 0 0 0 408 222 Z"/>
    <rect x="255" y="190" width="80" height="58" rx="10" class="bike__engine"/>
    <path class="bike__exhaust-low" d="M 290 246 C 250 262, 170 266, 96 258 L 96 270 C 170 278, 255 274, 296 256 Z"/>
    <path class="bike__exhaust-up" d="M 290 240 C 250 236, 220 222, 196 196 L 186 204 C 210 232, 248 250, 294 252 Z"/>
    <path class="bike__seat-long" d="M 160 150 C 180 136, 250 132, 290 138 L 290 152 C 250 150, 190 154, 162 164 Z"/>
    <path class="bike__seat-short" d="M 214 146 C 230 138, 262 136, 290 140 L 290 154 C 260 152, 232 156, 214 162 Z M 176 160 C 180 140, 200 136, 214 146 L 214 162 C 200 164, 184 166, 176 160 Z"/>
    <path class="bike__tank" d="M 285 140 C 300 112, 360 106, 395 118 C 404 124, 404 140, 396 150 C 360 156, 310 158, 285 156 Z"/>
    <path class="bike__stripe" d="M 300 132 C 330 122, 370 120, 392 126"/>
    <path d="M 420 105 L 404 82 L 440 76" class="bike__bars"/>
    <circle cx="452" cy="118" r="18" class="bike__lamp"/>`;
}
