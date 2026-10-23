import { buzz, fadeOut, play, sfx } from '../core/audio.js?v=6af64c95';
import { mediaUrl, preload } from '../core/media.js?v=6af64c95';
import { missionFrame } from '../core/mission.js?v=6af64c95';
import { rankFor } from '../core/progress.js?v=6af64c95';
import { EGG_TOTAL, eggFound } from '../core/egg.js?v=6af64c95';
import { esc, sleep } from '../core/util.js?v=6af64c95';

// Mission 12. Level 43. A few plain lines from Sameer, then the credits
// roll beside the family photos, then the post-credits scene, then a
// Level 43 card to keep.
export async function finale(el, ctx) {
  const story = ctx.manifest.story;
  const data = story.finale;
  preload(ctx, data.montage.map((m) => m.src));
  el.classList.add('fin');
  el.innerHTML = `
    <section class="fin__level">
      <p class="fin__lvl-label">Level</p>
      <p class="fin__lvl">42</p>
      <p class="fin__rank"></p>
    </section>
    <section class="fin__words" hidden></section>
    <section class="fin__credits" hidden>
      <div class="fin__photos"></div>
      <div class="fin__roll"><div class="fin__roll-inner"></div></div>
    </section>
    <section class="fin__post" hidden>
      <p class="fin__post-kicker">${esc(data.post.kicker)}</p>
      <h2 class="fin__post-title">${esc(data.post.title)}</h2>
      <p class="fin__post-sub">${esc(data.post.sub)}</p>
    </section>
    <section class="fin__card" hidden>
      <canvas class="fin__canvas" width="1080" height="1350" aria-label="Level 43 card"></canvas>
      <div class="fin__actions">
        <a class="btn fin__save">Save the card</a>
        <button class="btn fin__done" type="button">Back to the map</button>
      </div>
    </section>`;

  let left = false;
  const leave = missionFrame(el, ctx).then(() => { left = true; });
  const $ = (s) => el.querySelector(s);
  const race = (p) => Promise.race([p, leave]);
  const show = (sel) => {
    for (const s of el.querySelectorAll('section')) s.hidden = !s.matches(sel);
  };

  // ---------- level 43 ----------

  const lvl = $('.fin__lvl');
  await race(sleep(800));
  lvl.textContent = '43';
  lvl.classList.add('is-up');
  $('.fin__rank').textContent = rankFor(43, story.ranks);
  sfx.slam(0.9);
  sfx.reveal(0.7);
  play('granted', { gain: 0.5, rate: 0.7, cutoff: 2600 });
  buzz([80, 40, 80, 40, 240]);
  await race(sleep(2400));
  if (left) return false;

  // ---------- a few lines ----------

  show('.fin__words');
  const words = $('.fin__words');
  for (const line of data.words) {
    if (left) return false;
    const p = document.createElement('p');
    p.className = `fin__line${line.big ? ' fin__line--big' : ''}${line.sign ? ' fin__line--sign' : ''}`;
    p.textContent = line.text;
    words.append(p);
    await sleep(30);
    p.classList.add('is-on');
    if (line.big) sfx.boom(0.4);
    await race(sleep((line.hold || 2200) * 0.78));
  }
  await race(sleep(800));
  if (left) return false;

  // ---------- credits ----------

  show('.fin__credits');
  const roll = $('.fin__roll-inner');
  roll.innerHTML = data.credits.map((c) => (c.gap
    ? '<div class="cr__gap"></div>'
    : `<div class="cr"><p class="cr__role">${esc(c.role)}</p>${c.names.map((n) => `<p class="cr__name">${esc(n)}</p>`).join('')}</div>`)).join('');
  const photos = $('.fin__photos');
  const urls = await Promise.all(data.montage.map((m) => mediaUrl(ctx, m.src).catch(() => null)));
  data.montage.forEach((m, i) => {
    if (!urls[i]) return;
    const f = document.createElement('figure');
    f.className = 'fin__photo';
    f.innerHTML = `<img src="${urls[i]}" alt="${esc(m.caption)}"><figcaption>${esc(m.caption)}</figcaption>`;
    photos.append(f);
  });
  const ambient = play('rumble', { gain: 0.18, rate: 0.5, fadeIn: 2, cutoff: 500, loop: true });
  await race(rollCredits(roll, photos, () => left));
  fadeOut(ambient, 2);
  if (left) return false;

  // ---------- post-credits ----------

  show('.fin__post');
  if (eggFound() >= EGG_TOTAL) {
    // the secret ending: every sticker was found
    $('.fin__post-kicker').textContent = data.secret.kicker;
    $('.fin__post-title').textContent = data.secret.title;
    $('.fin__post-sub').textContent = data.secret.sub;
    $('.fin__post').classList.add('is-secret');
  }
  await race(sleep(600));
  $('.fin__post').classList.add('is-on');
  sfx.boom(0.7);
  await race(sleep(3200));
  if (left) return false;

  // ---------- the card ----------

  show('.fin__card');
  const canvas = $('.fin__canvas');
  await document.fonts.load("900 120px Archivo").catch(() => {});
  drawCard(canvas, story, ctx.progress);
  canvas.toBlob((blob) => {
    if (blob) $('.fin__save').href = URL.createObjectURL(blob);
  }, 'image/png');
  $('.fin__save').download = `${story.callsign.toLowerCase()}-level-43.png`;
  $('.fin__save').addEventListener('click', () => sfx.press());
  sfx.granted();
  return race(new Promise((r) => $('.fin__done').addEventListener('click', () => { sfx.press(); r(true); })))
    .then((v) => v === true);
}

function rollCredits(roll, photos, stopped) {
  return new Promise((resolve) => {
    const H = roll.parentElement.clientHeight;
    const total = roll.offsetHeight + H;
    const speed = 88; // px per second
    const figs = [...photos.children];
    const per = total / speed / Math.max(1, figs.length);
    let last = performance.now();
    let y = 0;
    let shown = -1;
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      y += speed * dt;
      roll.style.transform = `translateY(${H - y}px)`;
      const i = Math.min(figs.length - 1, Math.floor(y / speed / per));
      if (i !== shown && figs[i]) {
        figs.forEach((f, k) => f.classList.toggle('is-on', k === i));
        shown = i;
      }
      if (stopped() || y >= total) resolve();
      else requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

function drawCard(canvas, story, progress) {
  const c = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  c.fillStyle = '#0b0b0c';
  c.fillRect(0, 0, W, H);
  // frame
  c.strokeStyle = '#2b2b2e';
  c.lineWidth = 4;
  c.strokeRect(48, 48, W - 96, H - 96);
  c.fillStyle = '#ffb21e';
  c.fillRect(48, 48, W - 96, 14);

  c.fillStyle = '#7d7b74';
  c.font = "500 30px 'JetBrains Mono', monospace";
  c.letterSpacing = '6px';
  c.fillText('CHARACTER CARD', 110, 160);
  c.letterSpacing = '0px';

  c.fillStyle = '#ecebe6';
  c.font = "900 190px Archivo, 'Arial Narrow', sans-serif";
  c.fontStretch = 'condensed';
  c.fillText(story.callsign, 100, 360);

  c.fillStyle = '#ffb21e';
  c.font = "700 300px 'JetBrains Mono', monospace";
  c.fillText('43', 100, 690);
  c.fillStyle = '#b7b5ad';
  c.font = "500 34px 'JetBrains Mono', monospace";
  c.letterSpacing = '6px';
  c.fillText('LEVEL', 110, 430);
  c.fillText(rankFor(43, story.ranks).toUpperCase(), 110, 760);
  c.letterSpacing = '0px';

  const stats = progress.stats(new Set(story.missions.map((m) => m.id)));
  story.stats.forEach((name, i) => {
    const y = 860 + i * 92;
    c.fillStyle = '#7d7b74';
    c.font = "500 28px 'JetBrains Mono', monospace";
    c.letterSpacing = '4px';
    c.fillText(name.toUpperCase(), 110, y);
    c.letterSpacing = '0px';
    c.fillStyle = '#1c1e21';
    c.fillRect(110, y + 18, 700, 14);
    c.fillStyle = '#ecebe6';
    c.fillRect(110, y + 18, 700 * Math.min(1, stats[i] / 100), 14);
    c.font = "700 40px 'JetBrains Mono', monospace";
    c.fillText(String(stats[i]), 840, y + 34);
  });

  c.fillStyle = '#7d7b74';
  c.font = "400 26px 'JetBrains Mono', monospace";
  c.fillText(`${story.name.toUpperCase()} · 18 OCTOBER 2026`, 110, H - 110);
}
