import { sfx, buzz } from '../core/audio.js?v=6af64c95';
import { contentKey, openBlob, tryLock } from '../core/crypto.js?v=6af64c95';
import { angleDiff, easeInOut, esc, picker, sleep } from '../core/util.js?v=6af64c95';
import { Door } from './vault-door.js?v=6af64c95';

// Chapter 1. Each lock: stop the needle inside the red mark, then answer the
// clue. The answers are the key; a wrong one simply fails to decrypt.
export async function vault(el, { vault: data }) {
  const { gate, locks } = data;
  el.classList.add('vault');
  el.innerHTML = `
    <div class="vault__bar">
      <b>${esc(gate.title)}</b>
      <span class="vault__count">Locks 0 / ${locks.length}</span>
    </div>
    <div class="vault__stage">
      <div class="vault__light" hidden></div>
      <div class="door"><canvas role="img" aria-label="Vault door with a spinning dial"></canvas></div>
    </div>
    <div class="vault__panel">
      <p class="vault__msg" aria-live="polite"></p>
      <p class="vault__keys">Tap the door or press space</p>
      <form class="vault__form" hidden autocomplete="off">
        <label class="vault__clue" for="vault-answer"></label>
        <div class="vault__prompt">
          <span class="vault__chev" aria-hidden="true">&gt;</span>
          <input id="vault-answer" class="vault__input" type="text" inputmode="text"
            autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
            enterkeyhint="go" maxlength="40" placeholder="answer">
          <button class="btn vault__enter" type="submit">Enter</button>
        </div>
      </form>
    </div>
    <div class="vault__flood"></div>`;

  const $ = (s) => el.querySelector(s);
  const stage = $('.vault__stage');
  const doorEl = $('.door');
  const msg = $('.vault__msg');
  const keys = $('.vault__keys');
  const form = $('.vault__form');
  const clue = $('.vault__clue');
  const prompt = $('.vault__prompt');
  const input = $('.vault__input');
  const count = $('.vault__count');

  await document.fonts.load("600 20px 'JetBrains Mono'").catch(() => {});
  const door = new Door($('canvas'), { engraving: 'CHAPPA IRONWORKS  ·  LAHORE  ·  EST. 1983' });
  const st = door.state;
  if (location.hostname === 'localhost') window.__vault = st; // test hook, local only

  const wrong = picker(gate.wrong);
  const early = picker(gate.misses.early);
  const late = picker(gate.misses.late);
  const shares = [];

  let mode = 'spin';
  let speed = 0;
  let current = 0;
  let stunUntil = 0;
  let lastTick = 0;
  let raf = 0;
  let prev = performance.now();

  const howTo = matchMedia('(pointer: fine)').matches
    ? 'Click the door or press space'
    : 'Tap the door';
  keys.textContent = howTo;

  const say = (text, tone = '') => {
    msg.textContent = text;
    if (tone) msg.dataset.tone = tone;
    else delete msg.dataset.tone;
  };

  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    st.time = now / 1000;
    if (mode === 'spin' && now > stunUntil) {
      st.angle = (st.angle + speed * dt + 360) % 360;
      const tickIndex = Math.floor(st.angle / 30);
      if (tickIndex !== lastTick) {
        lastTick = tickIndex;
        sfx.tick();
      }
    }
    st.zoneFlash = Math.max(0, st.zoneFlash - dt * 2.5);
    door.draw();
    raf = requestAnimationFrame(frame);
  }

  function startLock(i) {
    current = i;
    const lock = locks[i];
    const dir = i % 2 === 0 ? 1 : -1;
    speed = lock.speed * dir;
    // put the zone well ahead of the needle so the first pass is fair
    const ahead = 140 + Math.random() * 150;
    st.zone = { center: (st.angle + ahead * dir + 360) % 360, width: lock.zone };
    st.zoneTone = 'red';
    st.showZone = true;
    st.lamps = st.lamps.map((m, j) => (j === i ? 'active' : m));
    form.hidden = true;
    keys.hidden = false;
    keys.textContent = howTo;
    delete keys.dataset.tone;
    say(i === 0 ? 'Stop the needle inside the red mark.' : `Lock ${i + 1}. Faster this time.`);
    mode = 'spin';
  }

  function tap() {
    if (mode !== 'spin' || performance.now() < stunUntil) return;
    const diff = angleDiff(st.angle, st.zone.center);
    if (Math.abs(diff) <= st.zone.width / 2) {
      caught();
    } else {
      const isEarly = speed > 0 ? diff < 0 : diff > 0;
      stunUntil = performance.now() + 420;
      st.zoneFlash = 1;
      sfx.miss();
      buzz(70);
      doorEl.classList.remove('is-shaking');
      void doorEl.offsetWidth;
      doorEl.classList.add('is-shaking');
      say(isEarly ? early() : late(), 'bad');
    }
  }

  async function caught() {
    mode = 'caught';
    sfx.clunk();
    buzz([30, 40, 30]);
    const from = st.angle;
    const to = from + angleDiff(st.zone.center, from);
    await animate(180, (t) => { st.angle = from + (to - from) * t; });
    st.zoneTone = 'amber';
    say(`Lock ${current + 1} caught. Now prove it's you.`, 'good');
    keys.hidden = true;
    clue.textContent = locks[current].clue;
    input.value = '';
    input.disabled = false;
    form.hidden = false;
    form.dataset.wrong = '0';
    input.focus({ preventScroll: true });
    mode = 'answer';
  }

  async function submit(e) {
    e.preventDefault();
    if (mode !== 'answer') return;
    const value = input.value;
    if (!value.trim()) {
      input.focus();
      return;
    }
    mode = 'verify';
    input.disabled = true;
    let dots = 0;
    const timer = setInterval(() => {
      dots = (dots + 1) % 4;
      say(`Verifying${'.'.repeat(dots)}`);
    }, 180);
    say('Verifying');
    const [share] = await Promise.all([
      tryLock(locks[current], value, data.iterations),
      sleep(450),
    ]);
    clearInterval(timer);

    if (share) {
      shares[current] = share;
      sfx.granted();
      setTimeout(() => sfx.bolt(), 120);
      buzz(40);
      st.zoneTone = 'green';
      st.lamps[current] = 'on';
      count.textContent = `Locks ${current + 1} / ${locks.length}`;
      say(`Lock ${current + 1} open.`, 'good');
      form.hidden = true;
      input.blur();
      await sleep(700);
      if (current + 1 < locks.length) startLock(current + 1);
      else await finish();
      return;
    }

    sfx.denied();
    buzz([90, 50, 90]);
    const misses = Number(form.dataset.wrong) + 1;
    form.dataset.wrong = String(misses);
    say(wrong(), 'bad');
    if (misses >= 2 && locks[current].hint) {
      keys.hidden = false;
      keys.dataset.tone = 'hint';
      keys.textContent = `Hint: ${locks[current].hint}`;
    }
    prompt.classList.remove('is-shaking');
    void prompt.offsetWidth;
    prompt.classList.add('is-shaking');
    input.disabled = false;
    input.select();
    input.focus({ preventScroll: true });
    mode = 'answer';
  }

  let result = null;
  async function finish() {
    mode = 'opening';
    say('All locks open.', 'good');
    keys.hidden = true;
    count.dataset.done = 'true';

    let key;
    let manifest;
    try {
      key = await contentKey(shares, data);
      manifest = JSON.parse(new TextDecoder().decode(await openBlob(key, data.manifest)));
    } catch (err) {
      console.error(err);
      say('The vault is jammed. The file needs rebuilding.', 'bad');
      return;
    }

    st.showZone = false;
    sfx.rumble(2.6);
    buzz([60, 80, 60, 80, 200]);
    const from = st.angle;
    await animate(1200, (t) => { st.angle = from + 900 * easeInOut(t); });
    sfx.hiss();
    $('.vault__light').hidden = false;
    doorEl.classList.add('is-open');
    $('.vault__flood').classList.add('is-on');
    await sleep(1700);
    result = { shares, key, manifest };
  }

  // input
  const onPointer = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    tap();
  };
  const onKey = (e) => {
    if (e.code === 'Space' && document.activeElement !== input) {
      e.preventDefault();
      tap();
    }
  };
  const onType = (e) => {
    if (e.key === 'Enter') sfx.press();
    else if (e.key.length === 1 || e.key === 'Backspace') sfx.type();
  };
  stage.addEventListener('pointerdown', onPointer);
  window.addEventListener('keydown', onKey);
  input.addEventListener('keydown', onType);
  form.addEventListener('submit', submit);

  startLock(0);
  raf = requestAnimationFrame(frame);

  while (!result) await sleep(100);

  cancelAnimationFrame(raf);
  stage.removeEventListener('pointerdown', onPointer);
  window.removeEventListener('keydown', onKey);
  door.destroy();
  return result;
}

function animate(ms, step) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const loop = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      step(t);
      if (t < 1) requestAnimationFrame(loop);
      else resolve();
    };
    requestAnimationFrame(loop);
  });
}
