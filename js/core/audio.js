// Recorded sound effects (Kenney, CC0; Gregor Quendel, CC BY 4.0; see
// sfx/CREDITS.txt), played through Web Audio so they overlap and fire with
// no delay, warmed up and given a little room so nothing sounds dry.

const FILES = ['tick', 'type', 'clunk', 'bolt', 'miss', 'denied', 'granted', 'rumble', 'boom', 'hiss', 'press', 'warp', 'bat', 'bounce', 'stumps', 'step', 'swish', 'plate', 'drop', 'impact', 'mech', 'whoosh', 'sub', 'rip', 'reveal', 'slam'];

let ctx = null;
let master = null;
let muted = false;
const buffers = {};

try {
  muted = localStorage.getItem('muted') === '1';
} catch {
  // storage blocked; default to sound on
}

// Creating the context early (it starts suspended) lets every sample be
// decoded before the first tap, so the very first click already has sound.
export function preloadAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;

  // Warm everything up: more low end, soften the top, then glue it together
  // so nothing pokes out.
  const bass = ctx.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = 160;
  bass.gain.value = 7;
  const body = ctx.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 420;
  body.Q.value = 0.8;
  body.gain.value = 2;
  const soft = ctx.createBiquadFilter();
  soft.type = 'highshelf';
  soft.frequency.value = 2600;
  soft.gain.value = -11;
  const top = ctx.createBiquadFilter();
  top.type = 'lowpass';
  top.frequency.value = 5200;
  top.Q.value = 0.5;
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -18;
  glue.knee.value = 12;
  glue.ratio.value = 3;
  glue.attack.value = 0.006;
  glue.release.value = 0.2;
  bass.connect(body).connect(soft).connect(top).connect(glue).connect(ctx.destination);

  // dry signal plus a reverb send: a short dark room, made from decaying noise
  const dry = ctx.createGain();
  dry.gain.value = 1;
  const send = ctx.createGain();
  send.gain.value = 0.28;
  const room = ctx.createConvolver();
  room.buffer = impulse(ctx, 1.9, 2.6);
  const roomTone = ctx.createBiquadFilter();
  roomTone.type = 'lowpass';
  roomTone.frequency.value = 3200;
  master.connect(dry).connect(bass);
  master.connect(send).connect(room).connect(roomTone).connect(bass);

  for (const name of FILES) load(name);
}

function impulse(c, seconds, decay) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function unlockAudio() {
  preloadAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

async function load(name) {
  try {
    const res = await fetch(`sfx/${name}.mp3`);
    buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
  } catch {
    // a missing sound should never break the page
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(m) {
  muted = m;
  try {
    localStorage.setItem('muted', m ? '1' : '0');
  } catch {
    // ignore
  }
  if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
}

/** Plays a sample. Returns the gain node so long sounds can be faded. */
export function play(name, { gain = 1, rate = 1, at = 0, offset = 0, fadeIn = 0, duration, cutoff, loop = false } = {}) {
  if (!ctx || muted || !buffers[name]) return null;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  src.playbackRate.value = rate;
  src.loop = loop;
  const g = ctx.createGain();
  let out = src;
  if (cutoff) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    lp.Q.value = 0.4;
    out = src.connect(lp);
  }
  if (fadeIn) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + fadeIn);
  } else {
    g.gain.value = gain;
  }
  out.connect(g).connect(master);
  src.start(t, offset, duration);
  return { gain: g, source: src, at: t };
}

export function fadeOut(node, seconds = 0.4) {
  if (!node || !ctx) return;
  const t = ctx.currentTime;
  node.gain.gain.cancelScheduledValues(t);
  node.gain.gain.setValueAtTime(node.gain.gain.value, t);
  node.gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  node.source.stop(t + seconds + 0.05);
}

const vary = (spread) => 1 + (Math.random() * 2 - 1) * spread;

export const sfx = {
  // small UI sounds: soft and low
  tick: () => play('tick', { gain: 0.2, rate: 0.55 * vary(0.03), cutoff: 1400 }),
  type: () => play('type', { gain: 0.11, rate: 0.6 * vary(0.08), cutoff: 1800 }),
  press: () => play('press', { gain: 0.35, rate: 0.7, cutoff: 2200 }),
  miss: () => play('miss', { gain: 0.4, rate: 0.6 * vary(0.04), cutoff: 1600 }),
  denied: () => play('denied', { gain: 0.32, rate: 0.75, cutoff: 1500 }),
  granted() {
    play('granted', { gain: 0.32, rate: 0.82, cutoff: 3000 });
    play('reveal', { gain: 0.16, rate: 1.2, duration: 1.2, cutoff: 3200 });
  },

  // weight: metal, mechanisms, impacts
  clunk() {
    play('impact', { gain: 0.7, rate: 0.9, cutoff: 3000 });
    play('clunk', { gain: 0.5, rate: 0.62, cutoff: 2000 });
  },
  bolt() {
    play('mech', { gain: 0.75, rate: 0.95, cutoff: 3200 });
    play('clunk', { gain: 0.35, rate: 0.85, at: 0.18, cutoff: 1800 });
  },
  rumble(seconds = 2.6) {
    play('slam', { gain: 0.55, rate: 0.85, cutoff: 2600 });
    play('mech', { gain: 0.6, rate: 0.7, at: 0.1, cutoff: 2400 });
    const r = play('sub', { gain: 0.9, fadeIn: 0.2, cutoff: 700 });
    if (r) setTimeout(() => fadeOut(r, 0.8), Math.max(0, seconds * 1000 - 800));
  },
  hiss: () => play('whoosh', { gain: 0.45, rate: 0.85, cutoff: 3000 }),
  boom: (gain = 0.9) => {
    play('impact', { gain: gain * 0.8, rate: 0.75, cutoff: 2600 });
    play('boom', { gain: gain * 0.6, rate: 0.8, cutoff: 900 });
  },

  // big moments
  slam: (gain = 0.8) => play('slam', { gain, rate: 0.9, cutoff: 3000 }),
  reveal: (gain = 0.5) => play('reveal', { gain, rate: 0.95, cutoff: 3600 }),
  whoosh: (gain = 0.5) => play('whoosh', { gain, rate: 1, cutoff: 3200 }),
  rip: () => play('rip', { gain: 0.7, rate: 1, cutoff: 4000 }),
};

export function buzz(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    // not supported
  }
}
