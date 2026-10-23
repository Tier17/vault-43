import { buzz, play, sfx } from '../core/audio.js?v=6af64c95';
import { decorateReward, missionFrame } from '../core/mission.js?v=6af64c95';
import { esc, sleep } from '../core/util.js?v=6af64c95';

// Mission 11. A top-down extraction raid with his real squad. He moves,
// the other two follow. Grab every piece of loot, avoid the patrols, get
// to the exfil before the clock runs out.

const WORLD = { w: 1200, h: 750 };
const R = 13; // operator radius

export async function squad(el, ctx) {
  const data = ctx.manifest.story.squad;
  el.classList.add('raid');
  el.innerHTML = `
    <canvas class="raid__canvas" aria-label="Top-down raid map"></canvas>
    <div class="raid__hud">
      <p class="raid__timer"><span>${esc(data.timerLabel)}</span><b>--</b></p>
      <p class="raid__loot"><span>${esc(data.lootLabel)}</span><b>0 / ${data.loot.length}</b></p>
    </div>
    <ol class="raid__squad">
      ${data.squad.map((s, i) => `<li style="--c:${s.colour}"><b>${esc(s.tag)}</b>${i ? '' : ' <span>(you)</span>'}</li>`).join('')}
    </ol>
    <p class="raid__comms" aria-live="polite"></p>
    <p class="raid__help">${esc(matchMedia('(pointer: fine)').matches ? data.helpKeys : data.helpTouch)}</p>
    <div class="raid__banner" hidden><b></b><span></span></div>`;

  let left = false;
  const leave = missionFrame(el, ctx).then(() => { left = true; });
  const $ = (s) => el.querySelector(s);
  const canvas = $('.raid__canvas');
  const c = canvas.getContext('2d');
  const race = (p) => Promise.race([p, leave]);

  // ---------- sizing ----------

  let dpr = 1;
  let scale = 1;
  let ox = 0;
  let oy = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    scale = Math.min((W - 48) / WORLD.w, (H - 150) / WORLD.h);
    ox = (W - WORLD.w * scale) / 2;
    oy = (H - WORLD.h * scale) / 2 + 24;
  }
  resize();
  window.addEventListener('resize', resize);

  // ---------- input ----------

  const keys = new Set();
  const onKey = (e) => {
    const k = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' }[e.code];
    if (!k) return;
    e.preventDefault();
    if (e.type === 'keydown') keys.add(k);
    else keys.delete(k);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  let pointer = null;
  const toWorld = (e) => {
    const box = canvas.getBoundingClientRect();
    return { x: (e.clientX - box.left - ox) / scale, y: (e.clientY - box.top - oy) / scale };
  };
  canvas.addEventListener('pointerdown', (e) => { pointer = toWorld(e); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (pointer) pointer = toWorld(e); });
  const clearPointer = () => { pointer = null; };
  canvas.addEventListener('pointerup', clearPointer);
  canvas.addEventListener('pointercancel', clearPointer);

  // ---------- one attempt ----------

  const walls = data.walls.map(([x, y, w, h]) => ({ x, y, w, h }));
  const blocked = (x, y) => x < R || y < R || x > WORLD.w - R || y > WORLD.h - R
    || walls.some((b) => x > b.x - R && x < b.x + b.w + R && y > b.y - R && y < b.y + b.h + R);

  function say(line) {
    const p = $('.raid__comms');
    p.innerHTML = `<b style="color:${line.colour}">${esc(line.tag)}:</b> ${esc(line.text)}`;
    p.classList.remove('is-new');
    void p.offsetWidth;
    p.classList.add('is-new');
    play('tick', { gain: 0.3, rate: 1.6, cutoff: 3000 });
  }
  const sayFrom = (i, text) => say({ tag: data.squad[i].tag, colour: data.squad[i].colour, text });

  async function attempt() {
    const me = { x: data.spawn[0], y: data.spawn[1], a: 0 };
    const trail = [];
    const loot = data.loot.map((l) => ({ ...l, got: false }));
    const patrols = data.patrols.map((p) => ({ path: p, t: Math.random(), dir: 1, x: p[0][0], y: p[0][1], pause: 0, a: 0 }));
    let time = data.seconds;
    let got = 0;
    let state = 'play';
    let last = performance.now();
    let hitCool = 0;

    sayFrom(1, data.comms.start);
    return new Promise((resolve) => {
      const frame = (now) => {
        if (left) return resolve('left');
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        if (state === 'play') {
          time -= dt;
          // movement
          let dx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
          let dy = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0);
          if (pointer && !dx && !dy) {
            const vx = pointer.x - me.x;
            const vy = pointer.y - me.y;
            const d = Math.hypot(vx, vy);
            if (d > 6) { dx = vx / d; dy = vy / d; }
          }
          const len = Math.hypot(dx, dy);
          if (len) {
            dx /= len;
            dy /= len;
            const step = data.speed * dt;
            if (!blocked(me.x + dx * step, me.y)) me.x += dx * step;
            if (!blocked(me.x, me.y + dy * step)) me.y += dy * step;
            me.a = Math.atan2(dy, dx);
            const tail = trail[trail.length - 1];
            if (!tail || Math.hypot(tail.x - me.x, tail.y - me.y) > 3) trail.push({ x: me.x, y: me.y, a: me.a });
            if (trail.length > 200) trail.shift();
          }

          // patrols walk their lines
          for (const p of patrols) {
            if (p.pause > 0) { p.pause -= dt; continue; }
            const [a, b] = p.path;
            const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
            p.t += (p.dir * data.patrolSpeed * dt) / segLen;
            if (p.t >= 1 || p.t <= 0) { p.dir *= -1; p.t = Math.max(0, Math.min(1, p.t)); p.pause = 0.6; }
            p.x = a[0] + (b[0] - a[0]) * p.t;
            p.y = a[1] + (b[1] - a[1]) * p.t;
            p.a = Math.atan2((b[1] - a[1]) * p.dir, (b[0] - a[0]) * p.dir);
          }

          // spotted
          hitCool -= dt;
          for (const p of patrols) {
            if (hitCool <= 0 && Math.hypot(p.x - me.x, p.y - me.y) < R * 2.6) {
              hitCool = 1.6;
              time -= data.hitPenalty;
              p.pause = 1.4;
              sfx.miss();
              play('drop', { gain: 0.4, rate: 1.4, cutoff: 1800 });
              buzz([60, 30, 60]);
              sayFrom(2, data.comms.hit);
              el.classList.remove('is-hit');
              void el.offsetWidth;
              el.classList.add('is-hit');
            }
          }

          // loot
          for (const l of loot) {
            if (!l.got && Math.hypot(l.x - me.x, l.y - me.y) < R + 16) {
              l.got = true;
              got += 1;
              sfx.granted();
              buzz(30);
              $('.raid__loot b').textContent = `${got} / ${loot.length}`;
              say({ tag: data.squad[got % 3].tag, colour: data.squad[got % 3].colour, text: l.line });
              if (got === loot.length) setTimeout(() => sayFrom(1, data.comms.exfil), 1400);
            }
          }

          // exfil
          const ex = data.exfil;
          if (got === loot.length && Math.hypot(ex[0] - me.x, ex[1] - me.y) < 46) {
            state = 'out';
            resolve({ ok: true, time: Math.round(data.seconds - time), got });
          }
          if (time <= 0) {
            state = 'out';
            resolve({ ok: false, got });
          }
          $('.raid__timer b').textContent = `${String(Math.max(0, Math.ceil(time))).padStart(2, '0')}s`;
          $('.raid__timer').dataset.low = time < 15 ? 'true' : 'false';
        }

        draw(now, me, trail, loot, patrols, got === loot.length);
        if (state === 'play') requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  // ---------- drawing ----------

  function draw(now, me, trail, loot, patrols, exfilOpen) {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#0c0e10';
    c.fillRect(0, 0, W, H);
    c.save();
    c.translate(ox, oy);
    c.scale(scale, scale);

    // ground and grid
    c.fillStyle = '#15191c';
    c.fillRect(0, 0, WORLD.w, WORLD.h);
    c.strokeStyle = 'rgba(236,235,230,0.035)';
    c.lineWidth = 1 / scale;
    for (let x = 0; x <= WORLD.w; x += 50) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, WORLD.h); c.stroke(); }
    for (let y = 0; y <= WORLD.h; y += 50) { c.beginPath(); c.moveTo(0, y); c.lineTo(WORLD.w, y); c.stroke(); }
    c.strokeStyle = '#2b3036';
    c.lineWidth = 3;
    c.strokeRect(0, 0, WORLD.w, WORLD.h);

    // walls with a lit top edge
    for (const b of walls) {
      c.fillStyle = '#262a30';
      c.fillRect(b.x, b.y, b.w, b.h);
      c.fillStyle = '#353a42';
      c.fillRect(b.x, b.y, b.w, 4);
      c.strokeStyle = '#0a0b0d';
      c.lineWidth = 2;
      c.strokeRect(b.x, b.y, b.w, b.h);
    }

    // exfil
    const [ex, ey] = data.exfil;
    const pulse = (now / 900) % 1;
    c.strokeStyle = exfilOpen ? `rgba(69,212,108,${1 - pulse})` : 'rgba(236,235,230,0.15)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(ex, ey, 30 + (exfilOpen ? pulse * 30 : 0), 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = exfilOpen ? 'rgba(69,212,108,0.18)' : 'rgba(236,235,230,0.04)';
    c.beginPath();
    c.arc(ex, ey, 30, 0, Math.PI * 2);
    c.fill();
    c.font = "700 13px 'JetBrains Mono', monospace";
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = exfilOpen ? '#45d46c' : 'rgba(236,235,230,0.35)';
    c.fillText('EXFIL', ex, ey);

    // loot
    for (const l of loot) {
      if (l.got) continue;
      const bob = Math.sin(now / 300 + l.x) * 2;
      c.fillStyle = '#ffb21e';
      c.save();
      c.translate(l.x, l.y + bob);
      c.rotate(Math.PI / 4);
      c.fillRect(-8, -8, 16, 16);
      c.restore();
      c.font = "500 11px 'JetBrains Mono', monospace";
      c.fillStyle = 'rgba(255,178,30,0.85)';
      c.fillText(l.name.toUpperCase(), l.x, l.y - 22);
    }

    // patrols with a sweeping view cone
    for (const p of patrols) {
      const sweep = Math.sin(now / 500) * 0.35;
      c.fillStyle = 'rgba(226,59,44,0.10)';
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.arc(p.x, p.y, 90, p.a + sweep - 0.5, p.a + sweep + 0.5);
      c.closePath();
      c.fill();
      c.fillStyle = '#e23b2c';
      c.beginPath();
      c.arc(p.x, p.y, R - 1, 0, Math.PI * 2);
      c.fill();
    }

    // the squad: two followers walk his trail
    const bodies = [{ x: me.x, y: me.y, a: me.a }];
    for (let i = 1; i < data.squad.length; i++) {
      const k = trail.length - 1 - i * 20;
      const p = k >= 0 ? trail[k] : { x: me.x - i * 22, y: me.y + i * 6, a: me.a };
      bodies.push(p);
    }
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      const s = data.squad[i];
      c.fillStyle = s.colour;
      c.beginPath();
      c.arc(b.x, b.y, R, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#0c0e10';
      c.beginPath();
      c.moveTo(b.x + Math.cos(b.a) * (R - 2), b.y + Math.sin(b.a) * (R - 2));
      c.lineTo(b.x + Math.cos(b.a + 2.4) * 6, b.y + Math.sin(b.a + 2.4) * 6);
      c.lineTo(b.x + Math.cos(b.a - 2.4) * 6, b.y + Math.sin(b.a - 2.4) * 6);
      c.closePath();
      c.fill();
      c.font = "700 11px 'JetBrains Mono', monospace";
      c.fillStyle = s.colour;
      c.fillText(s.tag, b.x, b.y + R + 12);
    }
    c.restore();
  }

  // ---------- run ----------

  let result;
  for (;;) {
    keys.clear();
    $('.raid__loot b').textContent = `0 / ${data.loot.length}`;
    result = await attempt();
    if (result === 'left' || left) break;
    if (result.ok) break;
    // out of time: one more go
    banner(data.fail[0], data.fail[1], 'bad');
    sfx.denied();
    await race(sleep(2600));
    $('.raid__banner').hidden = true;
    if (left) break;
  }

  let finished = false;
  if (!left && result && result.ok) {
    sfx.slam(0.9);
    sfx.reveal(0.6);
    buzz([60, 40, 60, 40, 200]);
    banner(data.success, data.successSub.replace('{time}', String(result.time)), 'good');
    await race(sleep(2400));
    if (!left) {
      const reward = document.createElement('div');
      reward.className = 'cases__reward';
      reward.innerHTML = `<p class="cases__gain">${esc(data.reward)}</p><button class="btn" type="button">Back to the map</button>`;
      decorateReward(reward, ctx);
      el.append(reward);
      await sleep(30);
      reward.classList.add('is-on');
      finished = await race(new Promise((r) => reward.querySelector('button').addEventListener('click', () => { sfx.press(); r(true); })))
        .then((v) => v === true);
    }
  }

  window.removeEventListener('resize', resize);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  return finished;

  function banner(big, small, tone) {
    const b = $('.raid__banner');
    b.querySelector('b').textContent = big;
    b.querySelector('span').textContent = small;
    b.dataset.tone = tone;
    b.hidden = false;
  }
}
