import { buzz, play, sfx } from '../core/audio.js?v=6af64c95';
import { mediaUrl, preload } from '../core/media.js?v=6af64c95';
import { decorateReward, missionFrame } from '../core/mission.js?v=6af64c95';
import { esc, sleep } from '../core/util.js?v=6af64c95';

// Mission 09. The old house in Lahore, late. Sameer's code keeps breaking;
// he spots the bug each time. The clock runs to 4 AM, the chai keeps
// coming, the photos from those nights go up on the wall. The project: not done.
export async function nights(el, ctx) {
  const data = ctx.manifest.story.nights;
  preload(ctx, data.photos.map((p) => p.src));
  el.classList.add('nights');
  el.innerHTML = `
    <aside class="nights__wall">
      <p class="nights__place">${esc(data.place)}</p>
      <p class="nights__clock" aria-live="polite">${esc(data.start)}</p>
      <p class="nights__chai"><span>${esc(data.chaiLabel)}</span> <b>0</b></p>
      <div class="nights__photos"></div>
    </aside>
    <section class="nights__desk">
      <p class="nights__msg" aria-live="polite"></p>
      <div class="editor">
        <header class="editor__tab"></header>
        <ol class="editor__lines"></ol>
      </div>
      <p class="nights__help">${esc(data.help)}</p>
    </section>`;

  let left = false;
  const leave = missionFrame(el, ctx).then(() => { left = true; });
  const $ = (s) => el.querySelector(s);
  const race = (p) => Promise.race([p, leave]);
  const msg = $('.nights__msg');
  const lines = $('.editor__lines');
  const wall = $('.nights__photos');
  let chai = 0;

  async function pin(photo, i) {
    const fig = document.createElement('figure');
    fig.className = 'polaroid';
    fig.style.setProperty('--r', `${[-5, 4, -2, 6][i % 4]}deg`);
    fig.innerHTML = `<img alt="${esc(photo.caption)}"><figcaption>${esc(photo.caption)}</figcaption>`;
    try {
      fig.querySelector('img').src = await mediaUrl(ctx, photo.src);
    } catch {
      return;
    }
    wall.append(fig);
    play('tick', { gain: 0.4, rate: 0.6, cutoff: 1200 });
  }

  for (const [i, bug] of data.bugs.entries()) {
    if (left) return false;
    msg.innerHTML = `<b>${esc(data.who)}:</b> ${esc(bug.ask)}`;
    msg.classList.remove('is-new');
    void msg.offsetWidth;
    msg.classList.add('is-new');
    play('granted', { gain: 0.2, rate: 1.6, cutoff: 2400 });
    $('.editor__tab').textContent = bug.file;
    lines.innerHTML = bug.code.map((l, n) => `<li><button type="button" data-n="${n}"><span class="editor__n">${n + 1}</span><code>${highlight(l)}</code></button></li>`).join('');

    // click the line with the bug
    await race(new Promise((resolve) => {
      lines.addEventListener('click', function onClick(e) {
        const b = e.target.closest('button');
        if (!b) return;
        const n = Number(b.dataset.n);
        if (![].concat(bug.line).includes(n)) {
          b.classList.add('is-wrong');
          sfx.denied();
          buzz(50);
          setTimeout(() => b.classList.remove('is-wrong'), 500);
          return;
        }
        lines.removeEventListener('click', onClick);
        b.classList.add('is-bug');
        resolve();
      });
    }));
    if (left) return false;

    sfx.clunk();
    buzz(40);
    // the fix replaces the line
    const fixAt = bug.fixLine ?? bug.line;
    const fixed = lines.querySelector(`button[data-n="${fixAt}"] code`);
    await race(sleep(350));
    fixed.innerHTML = highlight(bug.fix);
    fixed.closest('button').classList.add('is-fixed');
    sfx.granted();
    msg.innerHTML = `<b>${esc(data.who)}:</b> ${esc(bug.after)}`;
    await race(sleep(800));

    // time passes, more chai
    chai += bug.chai;
    $('.nights__chai b').textContent = String(chai);
    await tickClock($('.nights__clock'), bug.time);
    if (data.photos[i]) await pin(data.photos[i], i);
    await race(sleep(350));
  }
  if (left) return false;

  // 4 AM: the project board
  for (const p of data.photos.slice(data.bugs.length)) await pin(p, data.photos.indexOf(p));
  const board = document.createElement('div');
  board.className = 'proj';
  board.innerHTML = `
    <div class="proj__box">
      <h2 class="proj__title">${esc(data.project.title)}</h2>
      <div class="proj__cols">
        ${data.project.cols.map(([name, count]) => `<div class="proj__col"><span>${esc(name)}</span><b data-to="${count}">0</b></div>`).join('')}
      </div>
      <p class="proj__eta">${esc(data.project.eta)}</p>
      <p class="proj__ammi">${esc(data.project.ammi)}</p>
      <button class="btn" type="button">${esc(data.project.button)}</button>
    </div>`;
  el.append(board);
  await sleep(30);
  board.classList.add('is-on');
  for (const b of board.querySelectorAll('.proj__col b')) {
    const to = Number(b.dataset.to);
    for (let v = 0; v <= to; v += Math.max(1, Math.round(to / 18))) {
      b.textContent = String(v);
      await sleep(20);
    }
    b.textContent = String(to);
    sfx.tick();
  }
  await race(sleep(600));
  board.querySelector('.proj__ammi').classList.add('is-on');
  play('denied', { gain: 0.3, rate: 0.6, cutoff: 900 });
  const go = await race(new Promise((r) => board.querySelector('button').addEventListener('click', () => r(true))));
  if (go !== true) return false;
  sfx.press();
  board.remove();

  const reward = document.createElement('div');
  reward.className = 'cases__reward';
  reward.innerHTML = `<p class="cases__gain">${esc(data.reward)}</p><p class="pc__epilogue">${esc(data.epilogue)}</p><button class="btn" type="button">Back to the map</button>`;
  decorateReward(reward, ctx);
  el.append(reward);
  sfx.granted();
  await sleep(30);
  reward.classList.add('is-on');
  return race(new Promise((r) => reward.querySelector('button').addEventListener('click', () => { sfx.press(); r(true); })))
    .then((v) => v === true);
}

async function tickClock(node, to) {
  const [h0, m0] = node.textContent.split(':').map(Number);
  const [h1, m1] = to.split(':').map(Number);
  let a = h0 * 60 + m0;
  let b = h1 * 60 + m1;
  if (b < a) b += 24 * 60;
  const steps = 24;
  for (let k = 1; k <= steps; k++) {
    const t = Math.round(a + ((b - a) * k) / steps) % (24 * 60);
    node.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    if (k % 6 === 0) sfx.tick();
    await sleep(18);
  }
}

// Tiny highlighter: strings, numbers, comments and a few keywords.
function highlight(line) {
  const kw = /\b(def|return|for|in|let|const|if|else|import|from|function|UPDATE|SET|WHERE|SELECT|await|async)\b/g;
  const out = [];
  let rest = line;
  const comment = rest.match(/(#|--|\/\/).*$/);
  let tail = '';
  if (comment) {
    tail = `<span class="hl-c">${esc(comment[0])}</span>`;
    rest = rest.slice(0, comment.index);
  }
  rest.split(/('[^']*'|"[^"]*")/).forEach((part, i) => {
    if (i % 2) out.push(`<span class="hl-s">${esc(part)}</span>`);
    else out.push(esc(part).replace(kw, '<span class="hl-k">$1</span>').replace(/\b(\d+)\b/g, '<span class="hl-n">$1</span>'));
  });
  return out.join('') + tail || '&nbsp;';
}
