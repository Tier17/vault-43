import { buzz, play, sfx } from '../core/audio.js?v=6af64c95';
import { eggSticker } from '../core/egg.js?v=6af64c95';
import { loadGeo } from '../core/geo.js?v=6af64c95';
import { rankFor } from '../core/progress.js?v=6af64c95';
import { esc, sleep } from '../core/util.js?v=6af64c95';

// The campaign map: his life as a run of missions on a dark map. The camera
// flies to wherever the selected mission happened. Resolves with the id of
// the mission he starts.
export async function map(el, ctx) {
  const { manifest, progress } = ctx;
  const story = manifest.story;
  const { missions, places } = story;
  const justDone = ctx.justDone;
  ctx.justDone = null;

  el.classList.add('map');
  el.innerHTML = `
    <canvas class="map__canvas" aria-hidden="true"></canvas>
    <aside class="map__side">
      <section class="rank" aria-label="Character">
        <div class="rank__top">
          <div>
            <p class="rank__who">${esc(story.name)}</p>
            <h1 class="rank__name">${esc(story.callsign)}</h1>
          </div>
          <p class="rank__level"><span class="rank__lvl-label">Level</span> <b class="rank__lvl">1</b></p>
        </div>
        <p class="rank__title"><span class="rank__now"></span><span class="rank__next"></span></p>
        <div class="rank__bar" role="progressbar" aria-valuemin="1" aria-valuemax="${story.age}">
          <span class="rank__fill"></span>
        </div>
        <dl class="rank__stats">
          ${story.stats.map((s, i) => `
            <div class="stat" data-i="${i}">
              <dt>${esc(s)}</dt>
              <dd><span class="stat__bar"><span class="stat__fill"></span></span><b class="stat__val">0</b></dd>
            </div>`).join('')}
        </dl>
      </section>
      <ol class="missions">
        ${missions.map((m, i) => `
          <li>
            <button class="mission" type="button" data-id="${m.id}">
              <span class="mission__n">${String(i + 1).padStart(2, '0')}</span>
              <span class="mission__body">
                <span class="mission__title" data-n="${String(i + 1).padStart(2, '0')}">${esc(m.title)}</span>
                <span class="mission__meta">${esc(places[m.place].name)} · ${esc(m.when)}</span>
              </span>
              <span class="mission__state"></span>
            </button>
          </li>`).join('')}
      </ol>
    </aside>
    <section class="brief" aria-live="polite">
      <p class="brief__n"></p>
      <h2 class="brief__title"></h2>
      <p class="brief__meta"></p>
      <p class="brief__teaser"></p>
      <p class="brief__reward"></p>
      <button class="btn brief__go" type="button">Start mission</button>
    </section>
    <div class="toast" hidden></div>`;

  const $ = (s) => el.querySelector(s);
  const canvas = $('.map__canvas');
  const c = canvas.getContext('2d');
  const side = $('.map__side');

  eggSticker(side, 'map', 'right: 18px; bottom: 16px; --r: 8deg;', ctx.manifest.story.egg);
  const geo = await loadGeo();
  const { d3, countries, borders, coast } = geo;
  const graticule = d3.geoGraticule10();
  const projection = d3.geoMercator();
  const path = d3.geoPath(projection, c);

  // ---------- character card ----------

  const before = new Set(progress.done);
  if (justDone) before.delete(justDone);

  function paintRank(doneSet, animateFrom) {
    const lvl = progress.level(doneSet);
    const stats = progress.stats(doneSet);
    $('.rank__lvl').textContent = String(lvl).padStart(2, '0');
    $('.rank__now').textContent = rankFor(lvl, story.ranks);
    const next = story.ranks.find(([min]) => min > lvl);
    $('.rank__next').textContent = next ? `${next[1]} at ${next[0]}` : 'Max rank';
    $('.rank__fill').style.transform = `scaleX(${(lvl - 1) / (story.age - 1)})`;
    $('.rank__bar').setAttribute('aria-valuenow', String(lvl));
    stats.forEach((v, i) => {
      const row = el.querySelector(`.stat[data-i="${i}"]`);
      row.querySelector('.stat__fill').style.transform = `scaleX(${Math.min(1, v / 100)})`;
      row.querySelector('.stat__val').textContent = String(v);
      if (animateFrom && animateFrom[i] !== v) row.classList.add('is-up');
    });
  }

  function paintList() {
    const current = progress.current;
    el.querySelectorAll('.mission').forEach((b) => {
      const m = missions.find((x) => x.id === b.dataset.id);
      const done = progress.done.has(m.id);
      const open = progress.isOpen(m);
      b.dataset.state = done ? 'done' : m === current ? 'current' : 'locked';
      b.disabled = !open;
      b.querySelector('.mission__state').textContent = done ? 'Done' : m === current ? 'Next' : 'Locked';
      b.setAttribute('aria-current', m === selected ? 'true' : 'false');
    });
  }

  // ---------- camera ----------

  const views = {
    local: (w) => w * 10,
    region: (w) => w * 0.5,
    world: (w) => w * 0.19,
  };
  const regionCenter = [44, 43];
  const worldCenter = [35, 28];

  let W = 0;
  let H = 0;
  let dpr = 1;
  let mapLeft = 0;
  let mapW = 0;
  let mapH = 0;
  let wideLayout = true;

  function measure() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const wide = window.matchMedia('(min-width: 900px)').matches;
    wideLayout = wide;
    mapLeft = wide ? side.offsetWidth : 0;
    mapW = W - mapLeft;
    mapH = wide ? H : H * 0.5;
  }

  function viewFor(m) {
    const at = places[m.place].at;
    const center = m.view === 'local' ? at : m.view === 'world' ? worldCenter : regionCenter;
    return { center, k: views[m.view](mapW) };
  }

  let cam = null; // { center, k }
  let marker = null; // [lon, lat]
  let flight = null;

  function flyTo(m, ms = 1200) {
    const to = viewFor(m);
    const target = places[m.place].at;
    if (!cam) {
      cam = to;
      marker = target;
      return Promise.resolve();
    }
    const from = { ...cam };
    const fromMarker = marker;
    const centers = d3.geoInterpolate(from.center, to.center);
    const markers = d3.geoInterpolate(fromMarker, target);
    const far = d3.geoDistance(from.center, to.center);
    return new Promise((resolve) => {
      flight = { t0: performance.now(), ms, step(t) {
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        // pull back mid-flight on long hops, like a camera rising
        const dip = 1 - Math.min(0.75, far * 1.4) * Math.sin(Math.PI * e);
        cam = {
          center: centers(e),
          k: Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e) * dip,
        };
        marker = markers(e);
      }, done: resolve };
    });
  }

  // ---------- drawing ----------

  const focusCountry = (at) => countries.find((f) => d3.geoContains(f, at));

  function draw(now) {
    if (flight) {
      const t = Math.min(1, (now - flight.t0) / flight.ms);
      flight.step(t);
      if (t >= 1) {
        const f = flight;
        flight = null;
        f.done();
      }
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#07080a';
    c.fillRect(0, 0, W, H);
    if (!cam) return;

    const fx = mapLeft + mapW * (wideLayout ? 0.4 : 0.5);
    const fy = mapH * (wideLayout ? 0.4 : 0.5);
    projection
      .scale(cam.k)
      .center(cam.center)
      // keep the focus up and left of the brief card
      .translate([fx, fy])
      .precision(0.5);

    // sea: a little lighter around the focus
    const sea = c.createRadialGradient(fx, fy, 0, fx, fy, Math.max(mapW, mapH) * 0.8);
    sea.addColorStop(0, '#0e1217');
    sea.addColorStop(1, '#07080a');
    c.fillStyle = sea;
    c.fillRect(mapLeft, 0, mapW, H);

    c.beginPath();
    path(graticule);
    c.strokeStyle = 'rgba(236,235,230,0.035)';
    c.lineWidth = 1;
    c.stroke();

    // land
    c.beginPath();
    for (const f of countries) path(f);
    c.fillStyle = '#16191d';
    c.fill();

    const focus = selected && focusCountry(places[selected.place].at);
    if (focus) {
      c.beginPath();
      path(focus);
      const g = c.createRadialGradient(fx, fy, 0, fx, fy, Math.max(mapW, mapH) * 0.5);
      g.addColorStop(0, '#2a2418');
      g.addColorStop(1, '#1e2126');
      c.fillStyle = g;
      c.fill();
    }

    // coastline: a soft wide glow under a crisp line
    c.beginPath();
    path(coast);
    c.strokeStyle = 'rgba(120,150,180,0.10)';
    c.lineWidth = 4;
    c.stroke();
    c.strokeStyle = 'rgba(170,190,210,0.35)';
    c.lineWidth = 0.9;
    c.stroke();

    c.beginPath();
    path(borders);
    c.setLineDash([2, 3]);
    c.strokeStyle = 'rgba(150,158,168,0.32)';
    c.lineWidth = 0.8;
    c.stroke();
    c.setLineDash([]);

    if (focus) {
      c.beginPath();
      path(focus);
      c.strokeStyle = 'rgba(255,178,30,0.45)';
      c.lineWidth = 1.2;
      c.stroke();
    }

    // context: country names when zoomed out, towns when close
    const zoomedIn = cam.k > views.local(mapW) * 0.4;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (!zoomedIn) {
      c.font = "600 10px 'JetBrains Mono', monospace";
      c.letterSpacing = '4px';
      c.fillStyle = 'rgba(236,235,230,0.18)';
      for (const [name, lon, lat] of story.mapLabels.countries) {
        const q = projection([lon, lat]);
        if (q && q[0] > mapLeft + 40 && q[0] < W - 40) c.fillText(name.toUpperCase(), q[0], q[1]);
      }
    }
    c.letterSpacing = '1px';
    c.font = "500 10px 'JetBrains Mono', monospace";
    for (const [name, lon, lat, near] of story.mapLabels.towns) {
      if (Boolean(near) !== zoomedIn) continue;
      const q = projection([lon, lat]);
      if (!q || q[0] < mapLeft + 30 || q[0] > W - 30) continue;
      c.fillStyle = 'rgba(236,235,230,0.28)';
      c.fillRect(q[0] - 1.5, q[1] - 1.5, 3, 3);
      c.fillStyle = 'rgba(236,235,230,0.32)';
      c.textAlign = 'left';
      c.fillText(name, q[0] + 7, q[1]);
      c.textAlign = 'center';
    }
    c.letterSpacing = '0px';

    // the road so far: glow, then dashes, and the newest leg flowing
    const trail = [];
    for (const m of missions) {
      if (!progress.done.has(m.id) && m !== progress.current) break;
      const at = places[m.place].at;
      const last = trail[trail.length - 1];
      if (!last || last[0] !== at[0] || last[1] !== at[1]) trail.push(at);
    }
    if (trail.length > 1) {
      const line = { type: 'LineString', coordinates: trail };
      c.beginPath();
      path(line);
      c.strokeStyle = 'rgba(255,178,30,0.12)';
      c.lineWidth = 7;
      c.lineCap = 'round';
      c.stroke();
      c.setLineDash([6, 7]);
      c.lineDashOffset = -now / 45;
      c.strokeStyle = 'rgba(255,178,30,0.85)';
      c.lineWidth = 1.6;
      c.stroke();
      c.setLineDash([]);
      c.lineDashOffset = 0;
    }

    // the places of his life
    c.font = "600 11px 'JetBrains Mono', monospace";
    c.textAlign = 'left';
    const seen = new Set();
    for (const m of missions) {
      if (seen.has(m.place)) continue;
      seen.add(m.place);
      // Chappa and Lahore sit on top of each other unless zoomed right in
      if (m.place === 'chappa' && !zoomedIn) continue;
      const q = projection(places[m.place].at);
      if (!q) continue;
      const visited = missions.some((x) => x.place === m.place && progress.done.has(x.id));
      c.fillStyle = visited ? '#ecebe6' : 'rgba(236,235,230,0.45)';
      c.beginPath();
      c.arc(q[0], q[1], 3.5, 0, Math.PI * 2);
      c.fill();
      if (selected && selected.place === m.place) continue; // the callout names it
      c.fillStyle = visited ? 'rgba(236,235,230,0.85)' : 'rgba(236,235,230,0.45)';
      c.letterSpacing = '2px';
      c.fillText(places[m.place].name.toUpperCase(), q[0] + 10, q[1] + (m.place === 'chappa' ? 12 : -10));
      c.letterSpacing = '0px';
    }

    // him: a beacon with a callout
    if (marker) {
      const q = projection(marker);
      if (q) {
        const pulse = (now / 1400) % 1;
        c.strokeStyle = `rgba(255,178,30,${0.75 * (1 - pulse)})`;
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(q[0], q[1], 7 + pulse * 26, 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = 'rgba(255,178,30,0.18)';
        c.beginPath();
        c.arc(q[0], q[1], 13, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#ffb21e';
        c.beginPath();
        c.arc(q[0], q[1], 6, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#07080a';
        c.beginPath();
        c.arc(q[0], q[1], 2.2, 0, Math.PI * 2);
        c.fill();

        if (selected && !flight) {
          const label = places[selected.place].name.toUpperCase();
          const n = String(missions.indexOf(selected) + 1).padStart(2, '0');
          c.font = "700 11px 'JetBrains Mono', monospace";
          c.letterSpacing = '2px';
          const tw = c.measureText(label).width + 44;
          c.letterSpacing = '0px';
          const bx = q[0] + 18;
          const by = q[1] - 44;
          c.strokeStyle = 'rgba(255,178,30,0.6)';
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(q[0] + 6, q[1] - 6);
          c.lineTo(bx, by + 13);
          c.stroke();
          c.fillStyle = '#0b0b0c';
          c.fillRect(bx, by, tw, 26);
          c.strokeRect(bx + 0.5, by + 0.5, tw - 1, 25);
          c.fillStyle = '#ffb21e';
          c.fillText(n, bx + 9, by + 13.5);
          c.fillStyle = '#ecebe6';
          c.letterSpacing = '2px';
          c.fillText(label, bx + 34, by + 13.5);
          c.letterSpacing = '0px';
        }
      }
    }

    // edges fall away into the dark
    const vig = c.createRadialGradient(fx, fy, Math.min(mapW, mapH) * 0.35, fx, fy, Math.max(mapW, mapH) * 0.85);
    vig.addColorStop(0, 'rgba(7,8,10,0)');
    vig.addColorStop(1, 'rgba(7,8,10,0.75)');
    c.fillStyle = vig;
    c.fillRect(mapLeft, 0, mapW, H);

    // a live position readout
    if (marker && wideLayout) {
      const [lon, lat] = marker;
      const text = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
      c.font = "500 11px 'JetBrains Mono', monospace";
      c.letterSpacing = '2px';
      c.fillStyle = 'rgba(236,235,230,0.4)';
      c.textAlign = 'left';
      c.fillText(text, mapLeft + 28, H - 28);
      c.letterSpacing = '0px';
    }
  }

  let raf = 0;
  const loop = (now) => {
    draw(now);
    raf = requestAnimationFrame(loop);
  };

  // ---------- brief ----------

  let selected = null;
  function brief(m) {
    selected = m;
    const i = missions.indexOf(m);
    $('.brief__n').textContent = String(i + 1).padStart(2, '0');
    $('.brief__title').textContent = m.title;
    $('.brief__meta').textContent = `${places[m.place].name} · ${m.when}`;
    $('.brief__teaser').textContent = m.teaser;
    const gains = story.stats.map((s, k) => (m.gain[k] ? `${s} +${m.gain[k]}` : '')).filter(Boolean);
    $('.brief__reward').textContent = m.xp
      ? [`+${m.xp} ${m.xp === 1 ? 'level' : 'levels'}`, ...gains].join('   ·   ')
      : 'The last one.';
    $('.brief__go').textContent = progress.done.has(m.id) ? 'Play again' : 'Start mission';
    paintList();
  }

  // ---------- run ----------

  measure();
  const onResize = () => measure();
  window.addEventListener('resize', onResize);

  const current = progress.current || missions[missions.length - 1];
  const lastDone = justDone ? missions.find((m) => m.id === justDone) : null;

  paintRank(justDone ? before : progress.done);
  selected = lastDone || current;
  brief(selected);
  await flyTo(selected);
  raf = requestAnimationFrame(loop);

  if (lastDone) {
    // reward first, then travel to what's next
    await sleep(250);
    const oldLvl = progress.level(before);
    const oldRank = rankFor(oldLvl, story.ranks);
    sfx.granted();
    buzz(40);
    paintRank(progress.done, progress.stats(before));
    const newLvl = progress.level();
    await countUp($('.rank__lvl'), oldLvl, newLvl);
    const newRank = rankFor(newLvl, story.ranks);
    if (newRank !== oldRank) { sfx.reveal(0.6); await toast(`Rank up: ${newRank}`, true); }
    await sleep(200);
    if (progress.current) {
      brief(progress.current);
      sfx.whoosh(0.35);
      await flyTo(progress.current, 1500);
    }
  }

  // ---------- input ----------

  const chosen = await new Promise((resolve) => {
    el.querySelector('.missions').addEventListener('click', async (e) => {
      const b = e.target.closest('.mission');
      if (!b || b.disabled) return;
      const m = missions.find((x) => x.id === b.dataset.id);
      if (m === selected) return;
      sfx.tick();
      brief(m);
      await flyTo(m, 900);
    });
    $('.brief__go').addEventListener('click', () => {
      sfx.press();
      resolve(selected.id);
    });
  });

  window.removeEventListener('resize', onResize);
  await sleep(120);
  cancelAnimationFrame(raf);
  return chosen;

  async function toast(text, big) {
    const t = $('.toast');
    t.textContent = text;
    t.dataset.big = big ? 'true' : 'false';
    t.hidden = false;
    sfx.boom(0.5);
    await sleep(1400);
    t.hidden = true;
  }
}

async function countUp(node, from, to) {
  for (let v = from; v <= to; v++) {
    node.textContent = String(v).padStart(2, '0');
    sfx.tick();
    await sleep(55);
  }
}
