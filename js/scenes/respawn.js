import { buzz, play, sfx } from '../core/audio.js?v=6af64c95';
import { decorateReward, missionFrame } from '../core/mission.js?v=6af64c95';
import { esc, sleep } from '../core/util.js?v=6af64c95';

// Mission 07. Back from the road with nothing: GAME OVER. He continues,
// rebuilds the stack word by word, and then the machines arrive and he
// takes command of them.
export async function respawn(el, ctx) {
  const data = ctx.manifest.story.respawn;
  el.classList.add('respawn');
  el.innerHTML = `
    <section class="rs rs--over" data-step="over">
      <h1 class="rs__over">${esc(data.gameOver)}</h1>
      <ul class="rs__status">${data.status.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      <p class="rs__continue">${esc(data.continue)}</p>
      <p class="rs__count">5</p>
      <button class="btn rs__btn" type="button">${esc(data.continueButton)}</button>
    </section>
    <section class="rs rs--drill" data-step="drill" hidden>
      <p class="rs__kicker">${esc(data.drillTitle)}</p>
      <p class="rs__help">${esc(data.drillHelp)}</p>
      <div class="rain" aria-live="polite"></div>
      <p class="rs__score"><b>0</b> / ${data.words.length}</p>
    </section>
    <section class="rs rs--ai" data-step="ai" hidden>
      <p class="rs__kicker">${esc(data.aiTitle)}</p>
      <div class="term">
        <pre class="term__out"></pre>
        <div class="term__prompt"><span class="term__chev">&gt;</span><span class="term__typed"></span><span class="term__cur"></span></div>
      </div>
      <p class="rs__help rs__help--ai"></p>
    </section>
    <section class="rs rs--title" data-step="title" hidden>
      <p class="rs__kicker">${esc(data.unlocked)}</p>
      <h2 class="rs__title">${esc(data.title)}</h2>
      <p class="rs__line">${esc(data.line)}</p>
    </section>
    <input class="pc__input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Type here">`;

  let left = false;
  const leave = missionFrame(el, ctx).then(() => { left = true; });
  const $ = (s) => el.querySelector(s);
  const input = $('.pc__input');
  const show = (step) => el.querySelectorAll('.rs').forEach((s) => { s.hidden = s.dataset.step !== step; });
  const race = (p) => Promise.race([p, leave]);
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.mbar, .sound, button, .cases__reward')) return;
    setTimeout(() => input.focus({ preventScroll: true }), 0);
  });

  // ---------- game over ----------

  sfx.slam(0.9);
  play('denied', { gain: 0.4, rate: 0.5, cutoff: 900 });
  buzz(200);
  const count = $('.rs__count');
  let n = 5;
  const pressed = new Promise((r) => $('.rs__btn').addEventListener('click', r, { once: true }));
  await race(sleep(1000));
  el.querySelector('.rs--over').classList.add('is-asking');
  while (!left) {
    const tick = await race(Promise.race([pressed.then(() => 'go'), sleep(1000).then(() => 'tick')]));
    if (tick === 'go' || left) break;
    n -= 1;
    count.textContent = String(Math.max(0, n));
    sfx.tick();
    if (n <= 0) {
      $('.rs__continue').textContent = data.autoContinue;
      await race(sleep(1400));
      break;
    }
  }
  if (left) return false;
  sfx.press();
  play('warp', { gain: 0.3, rate: 1.8, duration: 0.8, cutoff: 1800 });

  // ---------- the drill ----------

  show('drill');
  await drill(el, data, input, () => left);
  if (left) return false;
  await race(sleep(600));

  // ---------- the machines ----------

  show('ai');
  const out = $('.term__out');
  const typedEl = $('.term__typed');
  const aiHelp = $('.rs__help--ai');
  for (const turn of data.ai) {
    if (left) return false;
    aiHelp.textContent = data.aiHelp;
    // he types the prompt; any key types the next letter of it
    await typePrompt(turn.prompt, typedEl, input, () => left);
    if (left) return false;
    out.textContent += `> ${turn.prompt}\n`;
    typedEl.textContent = '';
    aiHelp.textContent = '';
    await pour(out, turn, () => left);
    out.textContent += `${turn.done}\n\n`;
    out.scrollTop = out.scrollHeight;
    sfx.granted();
    await race(sleep(600));
  }
  if (left) return false;

  // ---------- the title ----------

  show('title');
  sfx.slam(0.9);
  sfx.reveal(0.6);
  play('granted', { gain: 0.5, rate: 0.7, cutoff: 2400 });
  buzz([60, 40, 60, 40, 220]);
  await race(sleep(2600));
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

// Words fall; type each before it lands. Missing one is fine, the drill
// always ends after the last word.
function drill(el, data, input, stopped) {
  const rain = el.querySelector('.rain');
  const score = el.querySelector('.rs__score b');
  const H = () => rain.clientHeight;
  const words = data.words.map((w, i) => ({ w, i, y: -40 - i * 100, x: 12 + ((i * 37) % 70), el: null, done: false }));
  for (const word of words) {
    const s = document.createElement('span');
    s.className = 'rain__w';
    s.innerHTML = `<i></i><em>${esc(word.w)}</em>`;
    s.style.left = `${word.x}%`;
    rain.append(s);
    word.el = s;
  }
  let typed = '';
  let hits = 0;
  input.value = '';
  input.focus({ preventScroll: true });

  const live = () => words.filter((w) => !w.done && w.y > -30);
  // any word on screen can be typed; the lowest matching one wins
  const target = (prefix) => live().filter((w) => w.w.startsWith(prefix)).sort((a, b) => b.y - a.y)[0];
  const paint = () => {
    const t = typed ? target(typed) : null;
    for (const w of live()) {
      const n = w === t ? typed.length : 0;
      w.el.querySelector('i').textContent = w.w.slice(0, n);
      w.el.querySelector('em').textContent = w.w.slice(n);
    }
  };

  const onInput = () => {
    typed = input.value.toLowerCase().replace(/\s+/g, ' ');
    const t = target(typed);
    if (!t) {
      // nothing on screen starts like that: drop what was typed
      if (typed) sfx.miss();
      input.value = '';
      typed = '';
    } else {
      sfx.type();
    }
    paint();
    if (t && typed === t.w) {
      t.done = true;
      t.el.classList.add('is-hit');
      hits += 1;
      score.textContent = String(hits);
      play('granted', { gain: 0.25, rate: 1.2 + hits * 0.05, cutoff: 2600 });
      input.value = '';
      typed = '';
      paint();
    }
  };
  input.addEventListener('input', onInput);

  return new Promise((resolve) => {
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const speed = H() / 6;
      for (const w of words) {
        if (w.done) continue;
        w.y += speed * dt;
        w.el.style.transform = `translateY(${w.y}px)`;
        if (w.y > H() - 30) {
          w.done = true;
          w.el.classList.add('is-miss');
          sfx.miss();
          if (typed && !target(typed)) { input.value = ''; typed = ''; paint(); }
        }
      }
      if (stopped() || words.every((w) => w.done)) {
        input.removeEventListener('input', onInput);
        resolve(hits);
      } else {
        requestAnimationFrame(loop);
      }
    };
    requestAnimationFrame(loop);
  });
}

// Any key types the next letter of the prompt, so it always comes out right.
function typePrompt(text, typedEl, input, stopped) {
  return new Promise((resolve) => {
    let i = 0;
    typedEl.textContent = '';
    input.value = '';
    input.focus({ preventScroll: true });
    const step = () => {
      if (stopped()) return finish();
      if (i < text.length) {
        i = Math.min(text.length, i + 2);
        typedEl.textContent = text.slice(0, i);
        sfx.type();
      }
    };
    const onKey = (e) => {
      if (e.key === 'Enter') {
        if (i >= text.length) return finish();
        typedEl.textContent = text;
        i = text.length;
        return;
      }
      if (e.key.length === 1 || e.key === 'Backspace') step();
      input.value = '';
    };
    const onTap = () => step();
    const area = typedEl.parentElement;
    function finish() {
      window.removeEventListener('keydown', onKey);
      area.removeEventListener('pointerdown', onTap);
      sfx.press();
      resolve();
    }
    window.addEventListener('keydown', onKey);
    area.addEventListener('pointerdown', onTap);
  });
}

// The machine writes: lines pour into the terminal faster than anyone types.
async function pour(out, turn, stopped) {
  const lines = turn.code;
  const total = turn.lines || 60;
  for (let k = 0; k < total; k++) {
    if (stopped()) return;
    out.textContent += `${lines[k % lines.length]}\n`;
    out.scrollTop = out.scrollHeight;
    if (k % 3 === 0) play('type', { gain: 0.06, rate: 1.4 + Math.random() * 0.3, cutoff: 2000 });
    await sleep(14);
  }
}
