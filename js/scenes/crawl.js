import { fadeOut, play, sfx } from '../core/audio.js?v=6af64c95';
import { Starfield } from '../core/starfield.js?v=6af64c95';
import { CrawlText } from './crawl-text.js?v=6af64c95';
import { esc, reducedMotion, sleep } from '../core/util.js?v=6af64c95';

// Chapter 2. The opening crawl: a line in blue, the title shrinking into the
// stars, then his story tilting away into space. Ends with a hyperspace jump.
export async function crawl(el, { manifest }) {
  const data = manifest.story.crawl;
  el.classList.add('crawl');
  el.innerHTML = `
    <canvas class="crawl__stars" aria-hidden="true"></canvas>
    <p class="crawl__preface">${esc(data.preface)}</p>
    <h1 class="crawl__logo" aria-label="${esc(data.logo.join(' '))}">
      ${data.logo.map((l, i) => `<span class="crawl__logo-line" data-line="${i}">${esc(l)}</span>`).join('')}
    </h1>
    <canvas class="crawl__canvas" aria-hidden="true"></canvas>
    <div class="crawl__read">
      <p class="crawl__episode">${esc(data.episode)}</p>
      <h2 class="crawl__title">${esc(data.title)}</h2>
      ${data.body.map((p) => `<p>${esc(p)}</p>`).join('')}
    </div>
    <button class="crawl__skip" type="button">Skip</button>
    <div class="crawl__white"></div>`;

  const $ = (s) => el.querySelector(s);
  const stars = new Starfield($('.crawl__stars'));
  const preface = $('.crawl__preface');
  const logo = $('.crawl__logo');
  const canvas = $('.crawl__canvas');
  const read = $('.crawl__read');
  const skipBtn = $('.crawl__skip');

  let skipped = false;
  let ambient = null;
  const skip = () => { skipped = true; };
  const onKey = (e) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
      e.preventDefault();
      skip();
    }
  };
  skipBtn.addEventListener('click', skip);
  window.addEventListener('keydown', onKey);

  // waits that end early if he skips
  const hold = async (ms) => {
    const end = performance.now() + ms;
    while (!skipped && performance.now() < end) await sleep(40);
  };

  // the vault ended on white; come down from it
  await sleep(50);
  $('.crawl__white').classList.add('is-gone');

  if (reducedMotion()) {
    read.classList.add('is-static');
    skipBtn.textContent = 'Continue';
    skipBtn.classList.add('is-ready');
    while (!skipped) await sleep(60);
  } else {
    await hold(800);
    preface.classList.add('is-on');
    await hold(3400);
    preface.classList.remove('is-on');
    skipBtn.classList.add('is-ready');
    await hold(900);

    if (!skipped) {
      sfx.slam(0.9);
      ambient = play('sub', { gain: 0.5, fadeIn: 2, cutoff: 500, loop: true });
      logo.classList.add('is-on');
      // let the logo get a head start, then the text follows it in
      await hold(1800);
      await document.fonts.load("700 40px Archivo").catch(() => {});
      await roll(new CrawlText(canvas, data), canvas, () => skipped);
    }
  }

  if (ambient) fadeOut(ambient, 1.2);
  window.removeEventListener('keydown', onKey);
  skipBtn.hidden = true;
  canvas.classList.add('is-leaving');
  logo.classList.add('is-gone');

  // hyperspace
  sfx.whoosh(0.7);
  play('warp', { gain: 0.45, rate: 0.85, duration: 2.4, cutoff: 1800 });
  stars.warp(true);
  await sleep(1300);
  el.classList.add('is-flashing');
  await sleep(450);
  stars.destroy();
}

// Moves the text up the tilted plane at a steady speed until it is far away.
function roll(text, canvas, stop) {
  return new Promise((resolve) => {
    const speed = text.h * 0.095; // plane units per second
    let last = performance.now();
    const onResize = () => {
      const progress = text.offset - text.start;
      text.layout();
      text.offset = text.start + progress;
    };
    window.addEventListener('resize', onResize);
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      text.offset += speed * dt;
      text.draw();
      if (stop() || text.done) {
        window.removeEventListener('resize', onResize);
        resolve();
      } else {
        requestAnimationFrame(loop);
      }
    };
    canvas.classList.add('is-on');
    requestAnimationFrame(loop);
  });
}
