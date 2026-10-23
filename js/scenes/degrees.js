import { buzz, fadeOut, play, sfx } from '../core/audio.js?v=6af64c95';
import { decorateReward, missionFrame } from '../core/mission.js?v=6af64c95';
import { esc, sleep } from '../core/util.js?v=6af64c95';

// Mission 04. A boarding pass prints; he tears off the stub; the flight
// draws itself from Lahore to Germany; years later the PhD is sealed and
// the name on the pass changes from MR to DR.
export async function degrees(el, ctx) {
  const data = ctx.manifest.story.degrees;
  el.classList.add('degrees');
  el.innerHTML = `
    <div class="pass-wrap">
      <article class="pass">
        <div class="pass__main">
          <header class="pass__band"><span>${esc(data.airline)}</span><span>${esc(data.ticketType)}</span></header>
          <div class="pass__grid">
            ${data.fields.map(([k, v], i) => `<div class="pass__f${i === 0 ? ' pass__f--name' : ''}"><span>${esc(k)}</span><b${i === 0 ? ' class="pass__name"' : ''}>${esc(v)}</b></div>`).join('')}
          </div>
          <svg class="pass__barcode" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">${barcode()}</svg>
        </div>
        <div class="pass__stub" tabindex="0" aria-label="Boarding pass stub. Drag right to tear it off.">
          <header class="pass__band pass__band--stub"><span>${esc(data.stub[0])}</span></header>
          ${data.stub.slice(1).map((s) => `<p class="pass__stubline">${esc(s)}</p>`).join('')}
          <span class="pass__grip" aria-hidden="true">Tear</span>
        </div>
      </article>
    </div>
    <svg class="flight" viewBox="0 0 1000 520" aria-hidden="true">
      <defs>
        <pattern id="fgrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="rgba(236,235,230,0.05)"/>
        </pattern>
      </defs>
      <rect width="1000" height="520" fill="url(#fgrid)"/>
      <path class="flight__path" d="M 820 400 C 700 120, 360 60, 190 150" fill="none"/>
      <path class="flight__trail" d="M 820 400 C 700 120, 360 60, 190 150" fill="none"/>
      <circle cx="820" cy="400" r="6" class="flight__city"/>
      <circle cx="190" cy="150" r="6" class="flight__city flight__city--to"/>
      <text x="840" y="430" class="flight__label">${esc(data.from)}</text>
      <text x="150" y="128" class="flight__label">${esc(data.to)}</text>
      <g class="flight__plane"><path d="M -14 0 L 10 -3 L 16 0 L 10 3 Z M -2 -1 L -8 -12 L -3 -12 L 6 -1 Z M -2 1 L -8 12 L -3 12 L 6 1 Z M -12 -1 L -16 -6 L -13 -6 L -9 -1 Z M -12 1 L -16 6 L -13 6 L -9 1 Z"/></g>
    </svg>
    <p class="flight__km" aria-live="polite"><b>0</b> km</p>
    <div class="certs">
      ${data.certs.map((c, i) => `
        <article class="cert" data-i="${i}">
          <p class="cert__kicker">${esc(c.kicker)}</p>
          <h3 class="cert__title">${esc(c.title)}</h3>
          <p class="cert__to">${esc(data.awardedTo)}</p>
          <p class="cert__name">${esc(data.name)}</p>
          <p class="cert__where">${esc(c.where)}</p>
          <span class="cert__seal" aria-hidden="true">${esc(c.seal)}</span>
        </article>`).join('')}
    </div>
    <p class="degrees__help" aria-live="polite"></p>`;

  let left = false;
  const leave = missionFrame(el, ctx).then(() => { left = true; });
  const $ = (s) => el.querySelector(s);
  const help = $('.degrees__help');
  const stub = $('.pass__stub');
  const race = (p) => Promise.race([p, leave]);

  // print the pass
  await sleep(100);
  for (let i = 0; i < 9; i++) setTimeout(() => sfx.tick(), i * 70);
  $('.pass-wrap').classList.add('is-printed');
  await race(sleep(900));
  if (left) return false;

  help.textContent = matchMedia('(pointer: fine)').matches
    ? 'Drag the stub to the right to tear it off.'
    : 'Swipe the stub to the right to tear it off.';
  stub.classList.add('is-ready');
  await race(tear(stub));
  if (left) return false;
  help.textContent = '';
  sfx.rip();
  play('swish', { gain: 0.4, rate: 0.5, cutoff: 1600 });
  buzz(40);
  stub.classList.add('is-gone');
  await race(sleep(450));

  // the flight
  el.classList.add('is-flying');
  await race(sleep(500));
  const engine = play('rumble', { gain: 0.35, rate: 0.9, fadeIn: 0.8, cutoff: 700 });
  await race(fly(el, data.km));
  fadeOut(engine, 1.2);
  if (left) return false;
  sfx.clunk();
  help.textContent = data.landed;
  await race(sleep(1100));
  help.textContent = '';

  // the degrees
  el.classList.remove('is-flying');
  el.classList.add('is-certs');
  const certs = el.querySelectorAll('.cert');
  for (const cert of certs) {
    if (left) return false;
    cert.classList.add('is-in');
    play('hiss', { gain: 0.15, rate: 1.8, cutoff: 1400 });
    await race(sleep(600));
    cert.classList.add('is-sealed');
    sfx.clunk();
    sfx.boom(0.45);
    buzz(50);
    await race(sleep(700));
  }
  if (left) return false;

  // MR becomes DR
  el.classList.add('is-title');
  const title = document.createElement('p');
  title.className = 'drtitle';
  title.innerHTML = `<span class="drtitle__old">${esc(data.before)}</span><span class="drtitle__new">${esc(data.after)}</span>`;
  el.append(title);
  await race(sleep(600));
  title.classList.add('is-struck');
  play('swish', { gain: 0.4, rate: 0.7, cutoff: 1400 });
  await race(sleep(450));
  title.classList.add('is-new');
  sfx.reveal(0.7);
  sfx.boom(0.7);
  buzz([40, 30, 120]);
  await race(sleep(1400));
  if (left) return false;

  const reward = document.createElement('div');
  reward.className = 'cases__reward';
  reward.innerHTML = `<p class="cases__gain">${esc(data.reward)}</p><button class="btn" type="button">Back to the map</button>`;
  decorateReward(reward, ctx);
  el.append(reward);
  await sleep(30);
  reward.classList.add('is-on');
  return race(new Promise((r) => reward.querySelector('button').addEventListener('click', () => { sfx.press(); r(true); })))
    .then((v) => v === true);
}

// Drag the stub far enough to the right and it tears off.
function tear(stub) {
  return new Promise((resolve) => {
    let start = null;
    let dx = 0;
    const move = (e) => {
      if (start === null) return;
      dx = Math.max(0, e.clientX - start);
      stub.style.transform = `translateX(${dx}px) rotate(${dx * 0.05}deg)`;
      if (dx > 6 && !stub.dataset.ripping) {
        stub.dataset.ripping = '1';
        play('tick', { gain: 0.3, rate: 0.4, cutoff: 900 });
      }
    };
    const up = () => {
      if (start === null) return;
      start = null;
      if (dx > 90) return done();
      stub.style.transition = 'transform 0.25s ease';
      stub.style.transform = '';
      delete stub.dataset.ripping;
      setTimeout(() => { stub.style.transition = ''; }, 260);
    };
    const down = (e) => {
      start = e.clientX;
      dx = 0;
      stub.setPointerCapture(e.pointerId);
    };
    const key = (e) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') {
        e.preventDefault();
        done();
      }
    };
    function done() {
      stub.removeEventListener('pointerdown', down);
      stub.removeEventListener('pointermove', move);
      stub.removeEventListener('pointerup', up);
      stub.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
      stub.style.transform = '';
      resolve();
    }
    stub.addEventListener('pointerdown', down);
    stub.addEventListener('pointermove', move);
    stub.addEventListener('pointerup', up);
    stub.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key);
  });
}

function fly(el, km) {
  const path = el.querySelector('.flight__path');
  const trail = el.querySelector('.flight__trail');
  const plane = el.querySelector('.flight__plane');
  const counter = el.querySelector('.flight__km b');
  const len = path.getTotalLength();
  trail.style.strokeDasharray = `${len}`;
  trail.style.strokeDashoffset = `${len}`;
  const ms = 3000;
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const at = len * e;
      const p = path.getPointAtLength(at);
      const q = path.getPointAtLength(Math.min(len, at + 1));
      const angle = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
      plane.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${angle})`);
      trail.style.strokeDashoffset = `${len - at}`;
      counter.textContent = Math.round(km * e).toLocaleString('en-US');
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

function barcode() {
  let x = 0;
  let seed = 1983;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const bars = [];
  while (x < 300) {
    const w = 1 + Math.floor(rnd() * 4);
    if (rnd() > 0.35) bars.push(`<rect x="${x}" y="0" width="${w}" height="40"/>`);
    x += w + 1;
  }
  return bars.join('');
}
