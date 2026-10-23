import { buzz, fadeOut, play, sfx } from '../core/audio.js?v=6af64c95';
import { loadGeo } from '../core/geo.js?v=6af64c95';
import { mediaUrl, preload } from '../core/media.js?v=6af64c95';
import { eggSticker } from '../core/egg.js?v=6af64c95';
import { decorateReward, missionFrame } from '../core/mission.js?v=6af64c95';
import { duckMusic } from '../core/music.js?v=6af64c95';
import { esc, sleep } from '../core/util.js?v=6af64c95';

// Mission 06. The world trip on a spinning globe: the route draws itself
// from Berlin, countries light up as he reaches them, the day counter runs
// to 1,168. Holding the throttle rides faster.
export async function karakoram(el, ctx) {
  const data = ctx.manifest.story.karakoram;
  preload(ctx, [data.vehicles.video]);
  el.classList.add('globe');
  el.innerHTML = `
    <canvas class="globe__canvas" aria-label="Globe showing the route of the world trip"></canvas>
    <header class="globe__head">
      <h1 class="globe__title">${esc(data.title)}</h1>
      <p class="globe__sub">${esc(data.bike)} · ${esc(data.start)}</p>
    </header>
    <aside class="hud" aria-live="polite">
      <div class="hud__row"><span>Day</span><b class="hud__day">0001</b><i>/ ${data.days}</i></div>
      <div class="hud__row"><span>Countries</span><b class="hud__countries">01</b></div>
      <div class="hud__row"><span>Odometer</span><b class="hud__km">${data.odometerStart.toLocaleString('en-US')}</b><i>km</i></div>
      <ol class="hud__feed"></ol>
    </aside>
    <div class="globe__controls">
      <button class="btn globe__throttle" type="button">${esc(data.throttle)}</button>
      <p class="globe__help">${esc(data.help)}</p>
    </div>
    <div class="globe__finish" hidden>
      ${data.finish.map((f) => `<p>${esc(f)}</p>`).join('')}
      <small>${esc(data.routeNote)}</small>
    </div>`;

  let left = false;
  const leave = missionFrame(el, ctx).then(() => { left = true; });
  const $ = (s) => el.querySelector(s);
  const canvas = $('.globe__canvas');
  eggSticker($('.hud'), 'globe', 'right: -16px; top: -18px; --r: 9deg;', ctx.manifest.story.egg);
  const c = canvas.getContext('2d');

  const { d3, countries, borders } = await loadGeo();
  const projection = d3.geoOrthographic().clipAngle(90).precision(0.4);
  const path = d3.geoPath(projection, c);
  const graticule = d3.geoGraticule10();
  const sphere = { type: 'Sphere' };

  // ---------- route ----------

  const stops = data.route.map(([name, country, lon, lat, how]) => ({ name, country, at: [lon, lat], hop: how === 'hop' }));
  const legs = [];
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    const km = d3.geoDistance(a.at, b.at) * 6371;
    // hops (shipping, flights) move fast; riding is what takes the time
    const weight = b.hop ? 900 : km;
    legs.push({ a, b, km, weight, start: total, interp: d3.geoInterpolate(a.at, b.at) });
    total += weight;
  }
  const rideKm = legs.filter((l) => !l.b.hop).reduce((s, l) => s + l.km, 0);

  const visited = new Set([stops[0].country]);
  const litShapes = new Set();
  const shapeFor = (at) => countries.find((f) => d3.geoContains(f, at));
  const lightUp = (stop) => {
    const f = shapeFor(stop.at);
    if (f) litShapes.add(f);
  };
  lightUp(stops[0]);

  // ---------- sizing ----------

  let W = 0;
  let H = 0;
  let dpr = 1;
  let R = 0;
  let cx = 0;
  let cy = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const wide = W >= 900;
    R = wide ? Math.min(W * 0.3, H * 0.4) : Math.min(W * 0.44, H * 0.3);
    cx = wide ? W * 0.44 : W / 2;
    cy = wide ? H * 0.52 : H * 0.4;
  }
  resize();
  window.addEventListener('resize', resize);

  // ---------- state ----------

  let s = 0; // progress along the route, in weight units
  let rot = [-stops[0].at[0], -stops[0].at[1] * 0.7];
  let zoom = 1.75; // close in while riding, pull back for the reveal
  let throttle = false;
  let finished = false;
  let reached = 0;
  let marker = stops[0].at;
  let label = stops[0].name;

  const feed = $('.hud__feed');
  function addFeed(text, isNew) {
    const li = document.createElement('li');
    li.textContent = text;
    if (isNew) li.className = 'is-new';
    feed.prepend(li);
    while (feed.children.length > 7) feed.lastChild.remove();
  }
  addFeed(`${stops[0].name}, ${stops[0].country}`, true);

  const btn = $('.globe__throttle');
  const setThrottle = (on) => {
    throttle = on && !finished;
    btn.classList.toggle('is-held', throttle);
  };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); setThrottle(true); });
  const offThrottle = () => setThrottle(false);
  window.addEventListener('pointerup', offThrottle);
  const onKey = (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    setThrottle(e.type === 'keydown');
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  const engine = play('rumble', { gain: 0.32, rate: 0.7, fadeIn: 1.2, cutoff: 800, loop: true });

  // ---------- frame ----------

  let last = performance.now();
  let raf = 0;
  const base = total / 32; // about 32 seconds at cruising speed

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (!finished) {
      s = Math.min(total, s + base * (throttle ? 3.6 : 1) * dt);
      if (engine) engine.source.playbackRate.setTargetAtTime(throttle ? 1.05 : 0.7, 0, 0.25);

      // which leg are we on?
      let leg = legs[legs.length - 1];
      for (const l of legs) if (s < l.start + l.weight) { leg = l; break; }
      const k = Math.min(1, (s - leg.start) / leg.weight);
      marker = leg.interp(k);

      // arrivals
      const idx = legs.indexOf(leg);
      const arrivedUpTo = k >= 1 ? idx + 1 : idx;
      while (reached < arrivedUpTo) {
        reached += 1;
        const stop = stops[reached];
        label = stop.name;
        const isNew = !visited.has(stop.country);
        visited.add(stop.country);
        lightUp(stop);
        addFeed(isNew ? `+ ${stop.country}` : stop.name, isNew);
        if (isNew) {
          play('tick', { gain: 0.5, rate: 0.9, cutoff: 1800 });
          play('granted', { gain: 0.16, rate: 1.3, cutoff: 2200 });
        } else {
          sfx.tick();
        }
      }

      const day = Math.max(1, Math.round(1 + (data.days - 1) * (s / total)));
      $('.hud__day').textContent = String(day).padStart(4, '0');
      $('.hud__countries').textContent = String(visited.size).padStart(2, '0');
      const ridden = legs.reduce((sum, l) => {
        if (l.b.hop) return sum;
        const part = Math.max(0, Math.min(1, (s - l.start) / l.weight));
        return sum + l.km * part;
      }, 0);
      $('.hud__km').textContent = Math.round(data.odometerStart + ridden * 1.3).toLocaleString('en-US');

      // follow the bike, leaning the globe a little
      const target = [-marker[0], -marker[1] * 0.7];
      rot = [lerpAngle(rot[0], target[0], Math.min(1, dt * 2.2)), rot[1] + (target[1] - rot[1]) * Math.min(1, dt * 2.2)];
      if (s >= total) finish();
    } else {
      // swing round to Eurasia, where most of the road was, then drift
      const drift = -48 + ((now - doneAt) / 1000) * 2.5;
      rot = [lerpAngle(rot[0], drift, Math.min(1, dt * 1.1)), rot[1] + (-30 - rot[1]) * Math.min(1, dt)];
      zoom += (0.9 - zoom) * Math.min(1, dt * 1.2);
    }

    draw(now);
    raf = requestAnimationFrame(frame);
  }

  function draw(now) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    projection.scale(R * zoom).translate([cx, cy]).rotate(rot);

    // atmosphere
    const glow = c.createRadialGradient(cx, cy, R * zoom * 0.96, cx, cy, R * zoom * 1.22);
    glow.addColorStop(0, 'rgba(255,178,30,0.10)');
    glow.addColorStop(1, 'rgba(255,178,30,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, W, H);

    // ocean with a light falling from the top left
    const sea = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * zoom);
    sea.addColorStop(0, '#16202b');
    sea.addColorStop(1, '#080b10');
    c.beginPath();
    path(sphere);
    c.fillStyle = sea;
    c.fill();

    c.beginPath();
    path(graticule);
    c.strokeStyle = 'rgba(236,235,230,0.05)';
    c.lineWidth = 0.8;
    c.stroke();

    c.beginPath();
    for (const f of countries) path(f);
    c.fillStyle = '#1c2026';
    c.fill();

    c.beginPath();
    for (const f of litShapes) path(f);
    c.fillStyle = '#4a3511';
    c.fill();

    c.beginPath();
    path(borders);
    c.strokeStyle = 'rgba(120,128,138,0.35)';
    c.lineWidth = 0.6;
    c.stroke();

    // the road so far
    const ridden = [];
    const hops = [];
    for (const l of legs) {
      if (s <= l.start) break;
      const k = Math.min(1, (s - l.start) / l.weight);
      const line = { type: 'LineString', coordinates: [l.a.at, k >= 1 ? l.b.at : l.interp(k)] };
      (l.b.hop ? hops : ridden).push(line);
    }
    c.lineCap = 'round';
    c.beginPath();
    for (const g of ridden) path(g);
    c.strokeStyle = '#ffb21e';
    c.lineWidth = 2.2;
    c.stroke();
    c.beginPath();
    for (const g of hops) path(g);
    c.setLineDash([3, 6]);
    c.strokeStyle = 'rgba(255,178,30,0.6)';
    c.lineWidth = 1.5;
    c.stroke();
    c.setLineDash([]);

    // stops reached
    c.fillStyle = '#ecebe6';
    for (let i = 0; i <= reached; i++) {
      const p = visible(stops[i].at);
      if (!p) continue;
      c.beginPath();
      c.arc(p[0], p[1], 2, 0, Math.PI * 2);
      c.fill();
    }

    // him
    const p = visible(marker);
    if (p && !finished) {
      const pulse = (now / 1100) % 1;
      c.strokeStyle = `rgba(255,178,30,${0.8 * (1 - pulse)})`;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(p[0], p[1], 5 + pulse * 20, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#ffb21e';
      c.beginPath();
      c.arc(p[0], p[1], 5, 0, Math.PI * 2);
      c.fill();
      c.font = "600 12px 'JetBrains Mono', monospace";
      c.letterSpacing = '1.5px';
      c.fillStyle = '#ecebe6';
      c.textBaseline = 'middle';
      c.fillText(label.toUpperCase(), p[0] + 14, p[1] - 12);
      c.letterSpacing = '0px';
    }

    // a soft highlight on the glass of the globe
    const shine = c.createRadialGradient(cx - R * 0.45, cy - R * 0.5, 0, cx - R * 0.45, cy - R * 0.5, R * 1.1);
    shine.addColorStop(0, 'rgba(255,255,255,0.07)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    c.beginPath();
    path(sphere);
    c.fillStyle = shine;
    c.fill();
  }

  function visible(at) {
    // only points on the near side of the globe
    const r = projection.rotate();
    const centre = [-r[0], -r[1]];
    if (d3.geoDistance(at, centre) > Math.PI / 2) return null;
    return projection(at);
  }

  let doneAt = 0;
  function finish() {
    if (finished) return;
    finished = true;
    doneAt = performance.now();
    setThrottle(false);
    btn.disabled = true;
    fadeOut(engine, 1.5);
    sfx.boom(0.8);
    sfx.granted();
    buzz([60, 40, 160]);
    $('.globe__controls').hidden = true;
  }

  raf = requestAnimationFrame(frame);
  while (!finished && !left) await sleep(100);

  if (!left) {
    await Promise.race([sleep(800), leave]);
    const fin = $('.globe__finish');
    fin.hidden = false;
    await sleep(30);
    fin.classList.add('is-on');
    await Promise.race([sleep(3200), leave]);
  }

  // the other vehicles
  let result = false;
  if (!left) {
    const v = data.vehicles;
    const card = document.createElement('div');
    card.className = 'vehicles';
    card.innerHTML = `
      <div class="vehicles__box">
        <h2 class="vehicles__title">${esc(v.title)}</h2>
        <ol class="vehicles__list">
          ${v.rows.map(([a, b], i) => `<li style="--i:${i}"><b>${esc(a)}</b><span>${esc(b)}</span></li>`).join('')}
        </ol>
        <figure class="vehicles__clip">
          <video playsinline muted loop preload="auto"></video>
          <figcaption>${esc(v.caption)}</figcaption>
        </figure>
        <div class="vehicles__row">
          <button class="btn vehicles__sound" type="button">Play with sound</button>
          <button class="btn vehicles__go" type="button">Continue</button>
        </div>
      </div>`;
    el.append(card);
    const video = card.querySelector('video');
    try {
      video.src = await mediaUrl(ctx, v.video);
      video.play().catch(() => {});
    } catch {
      card.querySelector('.vehicles__clip').hidden = true;
    }
    card.querySelector('.vehicles__sound').addEventListener('click', (e) => {
      duckMusic(true);
      video.muted = false;
      video.currentTime = 0;
      video.play().catch(() => {});
      e.currentTarget.hidden = true;
    });
    await sleep(30);
    card.classList.add('is-on');
    const go = await Promise.race([
      new Promise((r) => card.querySelector('.vehicles__go').addEventListener('click', () => r(true))),
      leave.then(() => false),
    ]);
    video.pause();
    duckMusic(false);
    if (go) {
      sfx.press();
      card.remove();
      const reward = document.createElement('div');
      reward.className = 'cases__reward';
      reward.innerHTML = `<p class="cases__gain">${esc(data.reward)}</p><button class="btn" type="button">Back to the map</button>`;
      decorateReward(reward, ctx);
      el.append(reward);
      sfx.granted();
      await sleep(30);
      reward.classList.add('is-on');
      result = await Promise.race([
        new Promise((r) => reward.querySelector('button').addEventListener('click', () => { sfx.press(); r(true); })),
        leave.then(() => false),
      ]);
    }
  }

  cancelAnimationFrame(raf);
  fadeOut(engine, 0.3);
  window.removeEventListener('resize', resize);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  window.removeEventListener('pointerup', offThrottle);
  return result;
}

function lerpAngle(a, b, t) {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
}
