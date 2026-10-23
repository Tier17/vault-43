import { buzz, play, sfx } from '../core/audio.js?v=6af64c95';
import { eggSticker } from '../core/egg.js?v=6af64c95';
import { decorateReward, missionFrame } from '../core/mission.js?v=6af64c95';
import { esc, sleep } from '../core/util.js?v=6af64c95';

// Mission 02. Evening on the Chappa grounds, seen from behind the stumps.
// The bowler runs in; he times the swing. One six ends the mission.

const CAM_BACK = 3.4; // camera distance behind the batting crease (m)
const CAM_H = 1.35;
const CAM_X = 0.55; // a little to the off side so the stumps don't block the view
const STUMPS_Z = -1.22;
const STUMP_W = 0.23;
const STUMP_H = 0.71;
const CONTACT_Z = 0.45;
const G = 9.8;

export async function cricket(el, ctx) {
  const data = ctx.manifest.story.cricket;
  el.classList.add('cricket');
  el.innerHTML = `
    <canvas class="cricket__canvas" aria-label="Cricket ground at dusk, bowler running in"></canvas>
    <div class="board" aria-live="polite">
      <p class="board__team">${esc(data.team)}</p>
      <p class="board__score"><b class="board__runs">0</b><span>/</span><b class="board__wkts">0</b></p>
      <p class="board__row"><span>Ball</span><b class="board__ball">1</b><span>of 6</span></p>
      <p class="board__row board__need">${esc(data.target)}</p>
    </div>
    <div class="call" aria-live="assertive"><p class="call__big"></p><p class="call__small"></p></div>
    <p class="cricket__help"></p>`;

  let left = false;
  const leave = missionFrame(el, ctx).then(() => { left = true; });
  const $ = (s) => el.querySelector(s);
  const canvas = $('.cricket__canvas');
  const c = canvas.getContext('2d');
  const help = $('.cricket__help');
  eggSticker($('.board'), 'cricket', 'right: -18px; bottom: -22px; --r: 12deg; pointer-events: auto;', ctx.manifest.story.egg);
  const fine = matchMedia('(pointer: fine)').matches;
  help.textContent = fine ? 'Click or press space to swing' : 'Tap to swing';

  // ---------- sizing and projection ----------

  let W = 0;
  let H = 0;
  let dpr = 1;
  let F = 0;
  let horizon = 0;
  let backdrop = null;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    F = Math.min(W * 0.62, H * 1.05);
    horizon = H * 0.47;
    backdrop = paintBackdrop();
  }

  function proj(x, y, z) {
    const depth = z + CAM_BACK;
    if (depth < 0.15) return null;
    const s = F / depth;
    return { x: W / 2 + (x - CAM_X) * s, y: horizon + (CAM_H - y) * s, s };
  }

  // ---------- the village behind the bowler (painted once per size) ----------

  function paintBackdrop() {
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const b = off.getContext('2d');
    b.scale(dpr, dpr);

    const sky = b.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#1f2a44');
    sky.addColorStop(0.55, '#7a4b45');
    sky.addColorStop(0.85, '#d8834e');
    sky.addColorStop(1, '#f3b26a');
    b.fillStyle = sky;
    b.fillRect(0, 0, W, horizon + 2);

    // low sun
    const sx = W * 0.7;
    const sy = horizon - H * 0.035;
    const glow = b.createRadialGradient(sx, sy, 0, sx, sy, H * 0.35);
    glow.addColorStop(0, 'rgba(255,214,150,0.75)');
    glow.addColorStop(0.15, 'rgba(255,190,120,0.35)');
    glow.addColorStop(1, 'rgba(255,170,100,0)');
    b.fillStyle = glow;
    b.fillRect(0, 0, W, horizon);
    b.fillStyle = '#ffe1b0';
    b.beginPath();
    b.arc(sx, sy, H * 0.03, 0, Math.PI * 2);
    b.fill();

    const rnd = seeded(83);
    // far haze layer, then the near layer
    village(b, rnd, horizon, 0.055, '#5b3a35', 1.0);
    village(b, rnd, horizon, 0.09, '#2a1d19', 1.35);

    // ground
    const ground = b.createLinearGradient(0, horizon, 0, H);
    ground.addColorStop(0, '#4f3b2b');
    ground.addColorStop(0.35, '#6b5038');
    ground.addColorStop(1, '#8a6a47');
    b.fillStyle = ground;
    b.fillRect(0, horizon, W, H - horizon);

    // worn patches in the outfield
    for (let i = 0; i < 70; i++) {
      const z = 2 + rnd() * 60;
      const x = (rnd() - 0.5) * 40;
      const p = proj(x, 0, z);
      if (!p) continue;
      b.fillStyle = rnd() > 0.5 ? 'rgba(40,28,18,0.18)' : 'rgba(150,120,80,0.12)';
      b.beginPath();
      b.ellipse(p.x, p.y, (0.8 + rnd() * 2.5) * p.s, (0.2 + rnd() * 0.5) * p.s, 0, 0, Math.PI * 2);
      b.fill();
    }

    // the pitch
    const corners = [[-1.5, -2.2], [1.5, -2.2], [1.5, 21.8], [-1.5, 21.8]].map(([x, z]) => proj(x, 0, z));
    b.fillStyle = '#a9835a';
    b.beginPath();
    corners.forEach((p, i) => (i ? b.lineTo(p.x, p.y) : b.moveTo(p.x, p.y)));
    b.closePath();
    b.fill();
    const strip = [[-0.6, -2.2], [0.6, -2.2], [0.6, 21.8], [-0.6, 21.8]].map(([x, z]) => proj(x, 0, z));
    b.fillStyle = 'rgba(214,180,130,0.35)';
    b.beginPath();
    strip.forEach((p, i) => (i ? b.lineTo(p.x, p.y) : b.moveTo(p.x, p.y)));
    b.closePath();
    b.fill();

    // creases
    b.strokeStyle = 'rgba(245,240,225,0.75)';
    const line = (x0, z0, x1, z1) => {
      const a = proj(x0, 0, z0);
      const d = proj(x1, 0, z1);
      b.lineWidth = Math.max(1, 0.05 * ((a.s + d.s) / 2));
      b.beginPath();
      b.moveTo(a.x, a.y);
      b.lineTo(d.x, d.y);
      b.stroke();
    };
    line(-1.45, 0, 1.45, 0);
    line(-1.32, 0, -1.32, -1.8);
    line(1.32, 0, 1.32, -1.8);
    line(-1.45, 20.1, 1.45, 20.1);
    line(-1.32, 20.1, -1.32, 21.3);
    line(1.32, 20.1, 1.32, 21.3);

    // far stumps
    drawStumps(b, 21.3, 0);
    return off;
  }

  function village(b, rnd, base, scale, colour, lift) {
    b.fillStyle = colour;
    b.strokeStyle = colour;
    const u = H * scale;
    let x = -u;
    while (x < W + u) {
      const kind = rnd();
      if (kind < 0.45) {
        // flat-roofed house, maybe with a water tank
        const w = u * (1 + rnd() * 1.6);
        const h = u * (0.55 + rnd() * 0.6) * lift;
        b.fillRect(x, base - h, w, h + 1);
        if (rnd() > 0.55) b.fillRect(x + w * (0.2 + rnd() * 0.5), base - h - u * 0.22, u * 0.3, u * 0.22);
        if (rnd() > 0.7) b.fillRect(x + w * 0.1, base - h - u * 0.08, w * 0.8, u * 0.08);
        x += w + u * rnd() * 0.3;
      } else if (kind < 0.85) {
        // tree: a few overlapping crowns on a trunk
        const r = u * (0.45 + rnd() * 0.5);
        const cx = x + r;
        const top = base - u * (0.9 + rnd() * 0.9) * lift;
        b.fillRect(cx - u * 0.05, top, u * 0.1, base - top);
        for (let k = 0; k < 5; k++) {
          b.beginPath();
          b.arc(cx + (rnd() - 0.5) * r * 1.4, top + (rnd() - 0.6) * r * 0.7, r * (0.45 + rnd() * 0.4), 0, Math.PI * 2);
          b.fill();
        }
        x += r * 2 + u * rnd() * 0.4;
      } else if (kind < 0.93) {
        // electric pole and its wire
        const h = u * 2.2 * lift;
        b.fillRect(x, base - h, Math.max(1.5, u * 0.05), h);
        b.fillRect(x - u * 0.25, base - h + u * 0.1, u * 0.55, Math.max(1, u * 0.03));
        b.lineWidth = Math.max(0.6, u * 0.012);
        b.beginPath();
        b.moveTo(x, base - h + u * 0.12);
        b.quadraticCurveTo(x + u * 2.5, base - h + u * 0.6, x + u * 5, base - h + u * 0.12);
        b.stroke();
        x += u * 0.6;
      } else {
        // a minaret
        const h = u * 3 * lift;
        const w = u * 0.22;
        b.fillRect(x, base - h, w, h);
        b.fillRect(x - w * 0.4, base - h * 0.72, w * 1.8, u * 0.08);
        b.beginPath();
        b.arc(x + w / 2, base - h, w * 0.75, Math.PI, 0);
        b.fill();
        b.fillRect(x + w / 2 - 0.5, base - h - w * 1.6, 1.2, w * 0.9);
        x += u * 1.2;
      }
    }
  }

  function drawStumps(b, z, knock) {
    for (let i = -1; i <= 1; i++) {
      const xs = i * (STUMP_W / 2 - 0.02);
      const foot = proj(xs, 0, z);
      if (!foot) continue;
      const lean = i * knock * 0.9 + knock * 0.4;
      const top = proj(xs + Math.sin(lean) * STUMP_H, Math.cos(lean) * STUMP_H, z + knock * 0.6);
      b.strokeStyle = '#efe6cf';
      b.lineWidth = Math.max(1, 0.035 * foot.s);
      b.lineCap = 'round';
      b.beginPath();
      b.moveTo(foot.x, foot.y);
      b.lineTo(top.x, top.y);
      b.stroke();
    }
    if (!knock) {
      const l = proj(-STUMP_W / 2, STUMP_H + 0.01, z);
      const r = proj(STUMP_W / 2, STUMP_H + 0.01, z);
      b.lineWidth = Math.max(1, 0.02 * l.s);
      b.beginPath();
      b.moveTo(l.x, l.y);
      b.lineTo(r.x, r.y);
      b.stroke();
    }
  }

  // ---------- state ----------

  let runs = 0;
  let wkts = 0;
  let ball = 1;
  let won = false;
  let d = null; // current delivery
  let swing = null; // { t } when the bat started moving
  let knock = 0; // stumps flying, 0..1

  function newDelivery(now) {
    const speed = 23 + Math.random() * 5;
    const bounceZ = 3.8 + Math.random() * 3.6;
    const startX = 0.35 + Math.random() * 0.25;
    const bounceX = -0.28 + Math.random() * 0.6;
    const endX = bounceX + (Math.random() - 0.5) * 0.2;
    const endY = 0.42 + Math.random() * 0.5;
    d = {
      phase: 'runup',
      t0: now,
      runup: 1.3,
      speed,
      start: { x: startX, y: 2.15, z: 19.6 },
      bounceZ,
      bounceX,
      endX,
      endY,
      released: 0,
      bounced: false,
      result: null,
      hit: null,
    };
    swing = null;
    knock = 0;
  }

  function ballAt(z) {
    const { start, bounceZ, bounceX, endX, endY } = d;
    if (z >= bounceZ) {
      const k = (z - bounceZ) / (start.z - bounceZ);
      return { x: bounceX + (start.x - bounceX) * k, y: start.y * Math.pow(k, 1.25), z };
    }
    const k = (bounceZ - z) / bounceZ; // 0 at bounce, 1 at the crease
    return { x: bounceX + (endX - bounceX) * k, y: endY * Math.min(1.35, k) * (1 - 0.15 * k * k), z };
  }

  const idealTime = () => d.released + (d.start.z - CONTACT_Z) / d.speed;

  function onSwing(now) {
    if (won || !d || swing || d.phase === 'done' || d.phase === 'result') return;
    swing = { t: now };
    play('swish', { gain: 0.35, rate: 0.6, cutoff: 1200 });
    if (d.phase !== 'flight') {
      judge(now, -Infinity);
      return;
    }
    judge(now, now - idealTime());
  }

  function judge(now, err) {
    const a = Math.abs(err);
    if (a <= 0.05) d.result = 'six';
    else if (a <= 0.095) d.result = 'four';
    else if (a <= 0.14) d.result = 'two';
    else d.result = err < 0 ? 'early' : 'late';
  }

  function strike(now, kind) {
    const p = ballAt(CONTACT_Z);
    const side = (Math.random() - 0.5) * 2;
    const v = {
      six: { z: 27, y: 17, x: side * 7 },
      four: { z: 30, y: 3.2, x: side * 9 },
      two: { z: 13, y: 4, x: side * 11 },
    }[kind];
    d.hit = { t0: now, p, v };
    d.phase = 'hit';
    play('bat', { gain: kind === 'six' ? 1 : 0.8, rate: kind === 'six' ? 0.8 : 0.9, cutoff: 3500 });
    if (kind === 'six') { sfx.boom(0.55); sfx.whoosh(0.4); }
    buzz(kind === 'six' ? [40, 30, 90] : 40);
  }

  async function call(big, small, tone) {
    const box = $('.call');
    $('.call__big').textContent = big;
    $('.call__small').textContent = small || '';
    box.dataset.tone = tone || '';
    box.classList.remove('is-on');
    void box.offsetWidth;
    box.classList.add('is-on');
  }

  function paintBoard() {
    $('.board__runs').textContent = String(runs);
    $('.board__wkts').textContent = String(wkts);
    $('.board__ball').textContent = String(ball);
  }

  // ---------- frame ----------

  let raf = 0;
  let resultAt = 0;

  function frame(now) {
    const t = now / 1000;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.drawImage(backdrop, 0, 0, W, H);

    if (!d) newDelivery(t);

    // bowler
    const runT = Math.min(1, (t - d.t0) / d.runup);
    const bowlerZ = 29 - 8.6 * easeOut(runT);
    drawBowler(bowlerZ, t, runT);

    if (d.phase === 'runup' && runT >= 1) {
      d.phase = 'flight';
      d.released = t;
      play('step', { gain: 0.25, rate: 0.7, cutoff: 1200 });
    }

    // the ball
    let b = null;
    if (d.phase === 'flight') {
      const z = d.start.z - (t - d.released) * d.speed;
      if (!d.bounced && z <= d.bounceZ) {
        d.bounced = true;
        play('bounce', { gain: 0.5, rate: 1.1, cutoff: 1500 });
      }
      // contact
      if (['six', 'four', 'two'].includes(d.result) && z <= CONTACT_Z) {
        strike(t, d.result);
      } else if (z <= STUMPS_Z) {
        const at = ballAt(STUMPS_Z);
        const bowled = Math.abs(at.x) < STUMP_W / 2 + 0.04 && at.y < STUMP_H;
        d.phase = 'result';
        resultAt = t;
        if (bowled) {
          knock = 0.001;
          wkts += 1;
          play('stumps', { gain: 0.8, rate: 0.85, cutoff: 2600 });
          buzz([80, 40, 80]);
          call('Bowled', pick(data.bowled), 'bad');
        } else {
          const text = d.result === 'early' ? 'Too early' : d.result === 'late' ? 'Too late' : 'Left it';
          call(text, swing ? pick(data.missed) : '', 'bad');
        }
        finishBall();
      } else {
        b = ballAt(z);
      }
    }

    if (d.phase === 'hit') {
      const h = d.hit;
      const dt = t - h.t0;
      const y = h.p.y + h.v.y * dt - 0.5 * G * dt * dt;
      b = { x: h.p.x + h.v.x * dt, y: Math.max(0, y), z: h.p.z + h.v.z * dt };
      if (!h.called) {
        h.called = true;
        const kind = d.result;
        const add = { six: 6, four: 4, two: 2 }[kind];
        runs += add;
        if (kind === 'six') {
          won = true;
          call(data.six[0], data.six[1], 'good');
        } else if (kind === 'four') {
          call('Four', pick(data.four), 'good');
        } else {
          call('Two runs', pick(data.two), '');
        }
        paintBoard();
      }
      if (dt > (d.result === 'six' ? 2.2 : 1.2)) {
        d.phase = 'result';
        resultAt = t;
        finishBall();
      }
    }

    if (b) drawBall(b);
    if (knock) knock = Math.min(1, knock + 0.06);
    drawStumps(c, STUMPS_Z, knock ? easeOut(knock) : 0);
    drawBat(t);

    if (d.phase === 'done' && t - resultAt > 1.1 && !won) {
      if (ball > 6) {
        ball = 1;
        call('New over', data.newOver, '');
      }
      paintBoard();
      newDelivery(t + 0.6);
    }
    raf = requestAnimationFrame(frame);
  }

  function finishBall() {
    d.phase = 'done';
    if (!won) ball += 1;
  }

  function drawBall(b) {
    const shadow = proj(b.x, 0, b.z);
    const p = proj(b.x, b.y, b.z);
    if (!p || !shadow) return;
    const r = Math.max(1.4, 0.036 * p.s);
    c.fillStyle = `rgba(20,12,6,${Math.max(0, 0.35 - b.y * 0.04)})`;
    c.beginPath();
    c.ellipse(shadow.x, shadow.y, r * 1.1, r * 0.35, 0, 0, Math.PI * 2);
    c.fill();
    // a taped tennis ball, the village standard
    c.fillStyle = '#e9d64e';
    c.beginPath();
    c.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#c4362a';
    c.lineWidth = Math.max(1, r * 0.45);
    c.beginPath();
    c.arc(p.x, p.y, r * 0.78, -0.4, Math.PI - 0.4);
    c.stroke();
  }

  function drawBowler(z, t, runT) {
    const foot = proj(-0.15, 0, z);
    if (!foot) return;
    const s = foot.s;
    const hgt = 1.75 * s;
    const stride = runT < 1 ? Math.sin(t * 15) : 0;
    const x = foot.x;
    const y = foot.y;
    c.strokeStyle = '#1b1411';
    c.fillStyle = '#1b1411';
    c.lineCap = 'round';
    c.lineWidth = Math.max(2, 0.12 * s);
    // legs
    c.beginPath();
    c.moveTo(x, y - hgt * 0.5);
    c.lineTo(x + stride * hgt * 0.16, y);
    c.moveTo(x, y - hgt * 0.5);
    c.lineTo(x - stride * hgt * 0.16, y);
    c.stroke();
    // body
    c.lineWidth = Math.max(2.5, 0.2 * s);
    c.beginPath();
    c.moveTo(x, y - hgt * 0.5);
    c.lineTo(x, y - hgt * 0.84);
    c.stroke();
    // arms: the bowling arm windmills over at the end of the run-up
    const over = runT > 0.82 ? (runT - 0.82) / 0.18 : 0;
    const armA = over ? -Math.PI / 2 - over * Math.PI * 1.1 : Math.PI * 0.6 + stride * 0.5;
    c.lineWidth = Math.max(1.5, 0.09 * s);
    c.beginPath();
    c.moveTo(x, y - hgt * 0.8);
    c.lineTo(x + Math.cos(armA) * hgt * 0.36, y - hgt * 0.8 + Math.sin(armA) * hgt * 0.36);
    c.moveTo(x, y - hgt * 0.8);
    c.lineTo(x - Math.cos(armA * 0.6) * hgt * 0.3, y - hgt * 0.8 + Math.abs(Math.sin(armA)) * hgt * 0.3);
    c.stroke();
    c.beginPath();
    c.arc(x, y - hgt * 0.93, hgt * 0.075, 0, Math.PI * 2);
    c.fill();
  }

  function drawBat(t) {
    // first person: the bat comes in from the bottom right
    const pivotX = W * 0.8;
    const pivotY = H * 1.04;
    let a = 0.62; // back-lift, raised over the right shoulder
    if (swing) {
      const k = Math.min(1, (t * 1000 - swing.t * 1000) / 200);
      a = 0.62 - easeOut(k) * 2.3;
    }
    const len = H * 0.44;
    const wid = H * 0.068;
    c.save();
    c.translate(pivotX, pivotY);
    c.rotate(a);
    // handle
    c.fillStyle = '#1f1d1c';
    c.fillRect(-wid * 0.18, -len * 0.42, wid * 0.36, len * 0.42);
    // blade
    const g = c.createLinearGradient(-wid / 2, 0, wid / 2, 0);
    g.addColorStop(0, '#b8925f');
    g.addColorStop(0.5, '#e4c995');
    g.addColorStop(1, '#a98252');
    c.fillStyle = g;
    c.beginPath();
    c.roundRect(-wid / 2, -len, wid, len * 0.6, wid * 0.18);
    c.fill();
    c.fillStyle = 'rgba(80,40,20,0.35)';
    c.fillRect(-wid / 2, -len * 0.5, wid, len * 0.035);
    c.restore();
  }

  // ---------- run ----------

  resize();
  window.addEventListener('resize', resize);
  const onDown = (e) => {
    if (e.target.closest('.mbar, .sound, button')) return;
    onSwing(performance.now() / 1000);
  };
  const onKey = (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      onSwing(performance.now() / 1000);
    }
  };
  el.addEventListener('pointerdown', onDown);
  window.addEventListener('keydown', onKey);
  if (location.hostname === 'localhost') window.__cricket = { get d() { return d; }, ideal: () => d && d.released && idealTime() };
  paintBoard();
  raf = requestAnimationFrame(frame);

  while (!won && !left) await sleep(100);
  if (!left) await Promise.race([sleep(2200), leave]);

  let finished = false;
  if (!left) {
    help.textContent = '';
    const out = document.createElement('div');
    out.className = 'cases__reward cricket__reward';
    out.innerHTML = `<p class="cases__gain">${esc(data.reward)}</p><button class="btn" type="button">Back to the map</button>`;
    decorateReward(out, ctx);
    el.append(out);
    sfx.granted();
    await sleep(30);
    out.classList.add('is-on');
    finished = await Promise.race([
      new Promise((r) => out.querySelector('button').addEventListener('click', () => { sfx.press(); r(true); })),
      leave.then(() => false),
    ]);
  }

  cancelAnimationFrame(raf);
  window.removeEventListener('resize', resize);
  window.removeEventListener('keydown', onKey);
  return finished;
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}
