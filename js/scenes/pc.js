import { buzz, play, sfx } from '../core/audio.js?v=6af64c95';
import { eggSticker } from '../core/egg.js?v=6af64c95';
import { decorateReward, missionFrame } from '../core/mission.js?v=6af64c95';
import { esc, sleep } from '../core/util.js?v=6af64c95';

// Mission 03. A cousin's beige PC, borrowed for a few hours. Power it on,
// follow the sticky note, and write the first line of code before the
// cousin wants it back.
export async function pc(el, ctx) {
  const data = ctx.manifest.story.pc;
  el.classList.add('pc');
  el.innerHTML = `
    <div class="pc__lamp" aria-hidden="true"></div>
    <p class="pc__intro">${esc(data.intro)}</p>
    <div class="crt">
      <div class="crt__screen" data-mode="off">
        <pre class="crt__text" aria-live="polite"></pre>
        <div class="crt__glass" aria-hidden="true"></div>
      </div>
      <div class="crt__chin">
        <span class="crt__brand">${esc(data.brand)}</span>
        <button class="crt__power" type="button" aria-label="Power"><span class="crt__led"></span></button>
      </div>
      <aside class="note" aria-live="polite"><p class="note__title">${esc(data.noteTitle)}</p><p class="note__line"></p></aside>
    </div>
    <p class="pc__clock" hidden><span>${esc(data.clockLabel)}</span> <b>--:--</b></p>
    <input class="pc__input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Type a command">`;

  let left = false;
  const leave = missionFrame(el, ctx).then(() => { left = true; });
  const $ = (s) => el.querySelector(s);
  const screen = $('.crt__screen');
  const out = $('.crt__text');
  const input = $('.pc__input');
  const noteLine = $('.note__line');
  const power = $('.crt__power');
  eggSticker($('.crt'), 'pc', 'left: 30%; bottom: 1.2%; --r: -4deg;', ctx.manifest.story.egg);

  const lines = [];
  let prompt = '';
  let typed = '';
  let cursorOn = true;

  function render() {
    const cur = cursorOn ? '█' : ' ';
    const body = lines.map(esc).join('\n');
    const live = prompt !== null ? `${esc(prompt)}${esc(typed)}<span class="crt__cur">${cur}</span>` : '';
    out.innerHTML = body + (body && live ? '\n' : '') + live;
  }
  const blink = setInterval(() => { cursorOn = !cursorOn; render(); }, 480);

  async function print(text, speed = 0) {
    for (const line of text.split('\n')) {
      if (speed) {
        lines.push('');
        for (let i = 1; i <= line.length; i++) {
          lines[lines.length - 1] = line.slice(0, i);
          render();
          await sleep(speed);
        }
      } else {
        lines.push(line);
      }
      render();
      if (lines.length > 12) lines.splice(0, lines.length - 12);
    }
  }

  // ---------- keyboard ----------

  let waiting = null;
  function readLine() {
    typed = '';
    render();
    input.value = '';
    input.focus({ preventScroll: true });
    return new Promise((resolve) => { waiting = resolve; leave.then(() => resolve(null)); });
  }

  function onKey(e) {
    if (!waiting) return;
    if (e.target !== input && e.target !== document.body) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const done = waiting;
      waiting = null;
      sfx.type();
      done(typed);
    }
  }
  window.addEventListener('keydown', onKey);
  input.addEventListener('input', () => {
    typed = input.value.slice(0, 60);
    sfx.type();
    render();
  });
  // keep the hidden input focused so typing always works
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.mbar, .sound, .cases__reward')) return;
    setTimeout(() => input.focus({ preventScroll: true }), 0);
  });

  // ---------- power on ----------

  power.classList.add('is-ready');
  prompt = null;
  render();
  await Promise.race([
    new Promise((r) => power.addEventListener('click', r, { once: true })),
    leave,
  ]);
  if (left) return cleanup(false);
  $('.pc__intro').classList.add('is-gone');
  power.classList.remove('is-ready');
  power.classList.add('is-on');
  play('clunk', { gain: 0.5, rate: 1.3, cutoff: 1600 });
  play('hiss', { gain: 0.25, rate: 0.5, cutoff: 900 });
  buzz(30);
  screen.dataset.mode = 'warming';
  await sleep(700);
  screen.dataset.mode = 'dos';
  for (const l of data.boot) {
    await print(l, 3);
    sfx.type();
    await sleep(70);
  }
  await sleep(400);
  lines.length = 0;

  // the cousin's clock starts
  const clock = $('.pc__clock');
  clock.hidden = false;
  let remaining = data.minutes * 60;
  const tick = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    if (remaining === 0) {
      // he never actually gets kicked off
      remaining = 120;
      noteLine.textContent = data.extraTime;
    }
    const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
    const ss = String(remaining % 60).padStart(2, '0');
    clock.querySelector('b').textContent = `${mm}:${ss}`;
    clock.dataset.low = remaining < 30 ? 'true' : 'false';
  }, 1000);

  // ---------- the steps ----------

  for (const step of data.steps) {
    if (left) break;
    if (step.mode) {
      screen.dataset.mode = step.mode;
      lines.length = 0;
      if (step.header) await print(step.header);
    }
    prompt = step.prompt;
    noteLine.textContent = step.note;
    $('.note').classList.remove('is-new');
    void $('.note').offsetWidth;
    $('.note').classList.add('is-new');
    render();

    for (;;) {
      const cmd = await readLine();
      if (cmd === null) break;
      lines.push(prompt + cmd);
      if (lines.length > 12) lines.splice(0, lines.length - 12);
      if (normalize(cmd) === normalize(step.expect)) {
        if (step.output) await print(step.output);
        sfx.press();
        break;
      }
      if (cmd.trim()) {
        await print(step.error || data.badCommand);
        sfx.denied();
        buzz(60);
      }
      render();
    }
  }
  clearInterval(tick);
  clock.hidden = true;
  if (left) return cleanup(false);

  // the moment
  prompt = null;
  noteLine.textContent = data.doneNote;
  screen.dataset.mode = 'dos';
  lines.length = 0;
  await sleep(300);
  screen.dataset.mode = 'run';
  await print(data.result, 30);
  sfx.granted();
  sfx.boom(0.5);
  buzz([40, 40, 100]);
  await sleep(1200);

  const knock = document.createElement('p');
  knock.className = 'pc__knock';
  knock.textContent = data.cousin;
  el.append(knock);
  play('stumps', { gain: 0.6, rate: 0.7, cutoff: 1400 });
  play('stumps', { gain: 0.6, rate: 0.75, at: 0.22, cutoff: 1400 });
  await sleep(1600);

  const reward = document.createElement('div');
  reward.className = 'cases__reward';
  reward.innerHTML = `
    <p class="cases__gain">${esc(data.reward)}</p>
    <p class="pc__epilogue">${esc(data.epilogue)}</p>
    <button class="btn" type="button">Back to the map</button>`;
  decorateReward(reward, ctx);
  el.append(reward);
  sfx.granted();
  await sleep(30);
  reward.classList.add('is-on');
  const finished = await Promise.race([
    new Promise((r) => reward.querySelector('button').addEventListener('click', () => { sfx.press(); r(true); })),
    leave.then(() => false),
  ]);
  return cleanup(finished);

  function cleanup(result) {
    clearInterval(blink);
    window.removeEventListener('keydown', onKey);
    return result;
  }
}

const normalize = (s) => s.toLowerCase().replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
