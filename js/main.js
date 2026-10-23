import { isMuted, preloadAudio, setMuted, unlockAudio } from './core/audio.js?v=6af64c95';
import { muteMusic, setupMusic, startMusic } from './core/music.js?v=6af64c95';
import { contentKey, fromB64, openBlob, toB64 } from './core/crypto.js?v=6af64c95';
import { Progress } from './core/progress.js?v=6af64c95';
import { storage } from './core/util.js?v=6af64c95';
import { intro } from './scenes/intro.js?v=6af64c95';
import { vault } from './scenes/vault.js?v=6af64c95';
import { crawl } from './scenes/crawl.js?v=6af64c95';
import { map } from './scenes/map.js?v=6af64c95';
import { stub } from './scenes/stub.js?v=6af64c95';
import { troublemaker } from './scenes/troublemaker.js?v=6af64c95';
import { cricket } from './scenes/cricket.js?v=6af64c95';
import { pc } from './scenes/pc.js?v=6af64c95';
import { degrees } from './scenes/degrees.js?v=6af64c95';
import { saving } from './scenes/saving.js?v=6af64c95';
import { karakoram } from './scenes/karakoram.js?v=6af64c95';
import { respawn } from './scenes/respawn.js?v=6af64c95';
import { germanymode } from './scenes/germanymode.js?v=6af64c95';
import { nights } from './scenes/nights.js?v=6af64c95';
import { iron } from './scenes/iron.js?v=6af64c95';
import { squad } from './scenes/squad.js?v=6af64c95';
import { finale } from './scenes/finale.js?v=6af64c95';

// Missions register here as they get built; the rest use the stub.
const MISSIONS = { troublemaker, cricket, pc, degrees, saving, karakoram, respawn, germanymode, nights, iron, squad, finale };

const app = document.getElementById('app');
const soundBtn = document.getElementById('sound');

function paintSound() {
  soundBtn.textContent = isMuted() ? 'Sound off' : 'Sound on';
  soundBtn.setAttribute('aria-pressed', String(isMuted()));
}
soundBtn.addEventListener('click', () => {
  unlockAudio();
  setMuted(!isMuted());
  muteMusic(isMuted());
  paintSound();
});
paintSound();
preloadAudio();

async function play(scene, ctx) {
  const el = document.createElement('section');
  el.className = 'scene';
  if (ctx.fromWhite) {
    ctx.fromWhite = false;
    const w = document.createElement('div');
    w.className = 'whiteout';
    el.append(w);
    requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('is-gone')));
    setTimeout(() => w.remove(), 2000);
  }
  app.append(el);
  try {
    return await scene(el, ctx);
  } finally {
    el.remove();
  }
}

async function main() {
  const data = await fetch('vault.json', { cache: 'no-store' }).then((r) => r.json());
  document.title = data.gate.title;
  setupMusic(data.gate.music || {});
  muteMusic(isMuted());
  const ctx = { vault: data, gate: data.gate };
  const slot = `vault:${data.hkdfSalt.slice(0, 12)}`;

  if (new URLSearchParams(location.search).has('relock')) storage.remove(slot);

  // A reload in the same tab shouldn't make him crack the vault again.
  const saved = storage.get(slot);
  if (saved) {
    try {
      const shares = JSON.parse(saved).map(fromB64);
      ctx.key = await contentKey(shares, data);
      ctx.manifest = JSON.parse(new TextDecoder().decode(await openBlob(ctx.key, data.manifest)));
    } catch {
      storage.remove(slot);
    }
  }

  if (ctx.manifest) {
    // came back to an open vault: start the music on the first click
    window.addEventListener('pointerdown', () => startMusic(), { once: true });
  }

  if (!ctx.manifest) {
    await play(intro, ctx);
    const opened = await play(vault, ctx);
    storage.set(slot, JSON.stringify(opened.shares.map(toB64)));
    ctx.key = opened.key;
    ctx.manifest = opened.manifest;
  }

  const { missions } = ctx.manifest.story;
  ctx.progress = new Progress(slot, missions);
  if (new URLSearchParams(location.search).has('restart')) ctx.progress.reset();

  // the crawl is the opening; once he has started, go straight to the map
  if (ctx.progress.done.size === 0) {
    await play(crawl, ctx);
    ctx.fromWhite = true;
  }

  for (;;) {
    const id = await play(map, ctx);
    const mission = missions.find((m) => m.id === id);
    ctx.mission = mission;
    const finished = await play(MISSIONS[id] || stub, ctx);
    if (finished) {
      const first = !ctx.progress.done.has(id);
      ctx.progress.complete(id);
      if (first) ctx.justDone = id;
    }
  }
}

main().catch((err) => {
  console.error(err);
  app.innerHTML = '<p class="noscript">This file could not be opened. Try reloading.</p>';
});
