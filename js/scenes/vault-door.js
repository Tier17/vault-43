// Canvas drawing of the vault door. The heavy, unchanging parts (frame,
// bolts, brushed face, groove, engraving) are painted once per size into an
// offscreen canvas; each frame only adds the zone, the lamps and the wheel.

const TAU = Math.PI * 2;
// Angles in this file are degrees, 0 at the top, clockwise.
const rad = (deg) => ((deg - 90) * Math.PI) / 180;

const TRACK_IN = 0.585;
const TRACK_OUT = 0.705;
const LAMP_R = 0.778;
const LAMP_AT = [-20, 0, 20];

export class Door {
  constructor(canvas, { engraving = '' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engraving = engraving;
    this.size = 0;
    this.layer = null;
    this.state = {
      angle: 0,
      zone: { center: 0, width: 30 },
      zoneTone: 'red',
      zoneFlash: 0,
      lamps: ['off', 'off', 'off'],
      active: 0,
      time: 0,
      showZone: true,
    };
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  destroy() {
    this.observer.disconnect();
  }

  resize() {
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(box.width * dpr);
    if (!size || size === this.size) return;
    this.size = size;
    this.canvas.width = size;
    this.canvas.height = size;
    this.paintLayer();
    this.draw();
  }

  paintLayer() {
    const layer = document.createElement('canvas');
    layer.width = layer.height = this.size;
    const c = layer.getContext('2d');
    const R = (this.size / 2) * 0.985;
    c.translate(this.size / 2, this.size / 2);

    // frame
    let g = c.createRadialGradient(0, -R * 0.35, R * 0.15, 0, 0, R);
    g.addColorStop(0, '#3d4044');
    g.addColorStop(0.7, '#26282b');
    g.addColorStop(0.93, '#17181a');
    g.addColorStop(1, '#0b0b0c');
    disc(c, R, g);
    ring(c, R * 0.992, R * 0.012, 'rgba(255,255,255,0.07)');
    ring(c, R * 0.868, R * 0.02, '#060606');
    ring(c, R * 0.856, R * 0.006, 'rgba(255,255,255,0.06)');

    // bolts in the frame
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      const x = Math.cos(a) * R * 0.93;
      const y = Math.sin(a) * R * 0.93;
      const b = R * 0.031;
      const bg = c.createRadialGradient(x - b * 0.4, y - b * 0.45, b * 0.08, x, y, b);
      bg.addColorStop(0, '#c9ced3');
      bg.addColorStop(0.45, '#6f747a');
      bg.addColorStop(1, '#232527');
      c.beginPath();
      c.arc(x, y, b, 0, TAU);
      c.fillStyle = bg;
      c.fill();
      c.lineWidth = Math.max(1, R * 0.004);
      c.strokeStyle = 'rgba(0,0,0,0.65)';
      c.stroke();
    }

    // brushed steel face
    const face = R * 0.85;
    const cg = c.createConicGradient(rad(0), 0, 0);
    const shades = ['#5f646a', '#858b91', '#545a60', '#8f959b', '#5b6066', '#7a8086', '#4f545a', '#8a9096', '#5f646a'];
    shades.forEach((s, i) => cg.addColorStop(i / (shades.length - 1), s));
    disc(c, face, cg);

    // concentric brushing
    const rng = mulberry(43);
    for (let i = 0; i < 220; i++) {
      const r = face * (0.08 + rng() * 0.92);
      c.beginPath();
      c.arc(0, 0, r, 0, TAU);
      c.lineWidth = Math.max(0.5, R * 0.0016);
      c.strokeStyle = rng() > 0.5 ? `rgba(255,255,255,${0.015 + rng() * 0.04})` : `rgba(0,0,0,${0.02 + rng() * 0.05})`;
      c.stroke();
    }

    // light from the top left, darker edge
    g = c.createRadialGradient(-face * 0.35, -face * 0.5, 0, -face * 0.35, -face * 0.5, face * 1.1);
    g.addColorStop(0, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    disc(c, face, g);
    g = c.createRadialGradient(0, 0, face * 0.55, 0, 0, face);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.42)');
    disc(c, face, g);

    // engraved rings
    engraveRing(c, R * 0.815, R);
    engraveRing(c, R * 0.52, R);

    // the groove the needle runs in
    c.beginPath();
    c.arc(0, 0, R * TRACK_OUT, 0, TAU);
    c.arc(0, 0, R * TRACK_IN, 0, TAU, true);
    c.fillStyle = '#16171a';
    c.fill();
    ring(c, R * TRACK_OUT, R * 0.008, 'rgba(0,0,0,0.7)');
    ring(c, R * TRACK_IN, R * 0.006, 'rgba(255,255,255,0.12)');
    ring(c, R * (TRACK_OUT + 0.006), R * 0.004, 'rgba(255,255,255,0.1)');

    // ticks every 5 degrees, long ones every 30
    for (let d = 0; d < 360; d += 5) {
      const long = d % 30 === 0;
      const r1 = R * (TRACK_OUT - 0.008);
      const r0 = R * (TRACK_OUT - (long ? 0.05 : 0.026));
      const a = rad(d);
      c.beginPath();
      c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      c.lineWidth = Math.max(1, R * (long ? 0.007 : 0.004));
      c.strokeStyle = long ? 'rgba(236,235,230,0.55)' : 'rgba(236,235,230,0.22)';
      c.stroke();
    }

    // lamp sockets
    for (const d of LAMP_AT) {
      const a = rad(d);
      const x = Math.cos(a) * R * LAMP_R;
      const y = Math.sin(a) * R * LAMP_R;
      c.beginPath();
      c.arc(x, y, R * 0.04, 0, TAU);
      c.fillStyle = '#1a1b1d';
      c.fill();
      c.lineWidth = Math.max(1, R * 0.006);
      c.strokeStyle = 'rgba(255,255,255,0.14)';
      c.stroke();
    }

    if (this.engraving) engraveArc(c, this.engraving, R * LAMP_R, 180, R);

    this.layer = layer;
  }

  draw() {
    const { ctx: c, size, state: s } = this;
    if (!size) return;
    const R = (size / 2) * 0.985;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, size, size);
    c.drawImage(this.layer, 0, 0);
    c.translate(size / 2, size / 2);

    if (s.showZone) this.drawZone(c, R);
    this.drawLamps(c, R);
    this.drawWheel(c, R);
  }

  drawZone(c, R) {
    const s = this.state;
    const a0 = rad(s.zone.center - s.zone.width / 2);
    const a1 = rad(s.zone.center + s.zone.width / 2);
    const mid = (R * (TRACK_IN + TRACK_OUT)) / 2;
    const w = R * (TRACK_OUT - TRACK_IN) - R * 0.02;
    const colour = {
      red: '#e8402f',
      amber: '#ffb21e',
      green: '#45d46c',
    }[s.zoneTone];
    c.save();
    c.beginPath();
    c.arc(0, 0, mid, a0, a1);
    c.lineWidth = w;
    c.lineCap = 'butt';
    c.shadowColor = colour;
    c.shadowBlur = R * (0.05 + s.zoneFlash * 0.08);
    c.strokeStyle = colour;
    c.globalAlpha = 0.86 + s.zoneFlash * 0.14;
    c.stroke();
    c.restore();
  }

  drawLamps(c, R) {
    const s = this.state;
    LAMP_AT.forEach((d, i) => {
      const a = rad(d);
      const x = Math.cos(a) * R * LAMP_R;
      const y = Math.sin(a) * R * LAMP_R;
      const r = R * 0.028;
      const mode = s.lamps[i];
      const pulse = 0.5 + 0.5 * Math.sin(s.time * 6);
      const [hi, mid, lo, glow] = {
        off: ['#5a2a24', '#2e1310', '#140706', 0],
        active: ['#fff0c4', '#ffb21e', '#7a4a00', 0.35 + pulse * 0.45],
        on: ['#e3ffe8', '#45d46c', '#0f4a1e', 1],
      }[mode];
      c.save();
      if (glow) {
        c.shadowColor = mode === 'on' ? '#45d46c' : '#ffb21e';
        c.shadowBlur = R * 0.06 * glow;
      }
      const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, hi);
      g.addColorStop(0.5, mid);
      g.addColorStop(1, lo);
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fillStyle = g;
      c.fill();
      c.restore();
    });
  }

  drawWheel(c, R) {
    const s = this.state;
    c.save();
    c.rotate((s.angle * Math.PI) / 180);

    // the needle points at state.angle; spokes sit between, 45 degrees off
    c.save();
    c.shadowColor = 'rgba(255,178,30,0.8)';
    c.shadowBlur = R * 0.03;
    c.fillStyle = '#ffb21e';
    const nw = R * 0.016;
    c.beginPath();
    c.moveTo(-nw, -R * 0.18);
    c.lineTo(-nw, -R * (TRACK_OUT - 0.045));
    c.lineTo(-nw * 2.6, -R * (TRACK_OUT - 0.045));
    c.lineTo(0, -R * (TRACK_OUT - 0.006));
    c.lineTo(nw * 2.6, -R * (TRACK_OUT - 0.045));
    c.lineTo(nw, -R * (TRACK_OUT - 0.045));
    c.lineTo(nw, -R * 0.18);
    c.closePath();
    c.fill();
    c.restore();

    // shadow under the wheel
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)';
    c.shadowBlur = R * 0.05;
    c.shadowOffsetY = R * 0.025;
    for (let i = 0; i < 4; i++) {
      c.save();
      c.rotate(Math.PI / 4 + (i * Math.PI) / 2);
      spoke(c, R);
      c.restore();
    }
    c.restore();

    // hub
    let g = c.createRadialGradient(-R * 0.06, -R * 0.08, R * 0.02, 0, 0, R * 0.2);
    g.addColorStop(0, '#d4d9de');
    g.addColorStop(0.5, '#7b8187');
    g.addColorStop(1, '#2c2e31');
    disc(c, R * 0.2, g);
    ring(c, R * 0.2, R * 0.006, 'rgba(0,0,0,0.6)');
    ring(c, R * 0.13, R * 0.008, 'rgba(0,0,0,0.35)');
    ring(c, R * 0.137, R * 0.004, 'rgba(255,255,255,0.18)');
    g = c.createRadialGradient(-R * 0.02, -R * 0.025, R * 0.004, 0, 0, R * 0.055);
    g.addColorStop(0, '#f2f4f6');
    g.addColorStop(1, '#6a7076');
    disc(c, R * 0.055, g);
    c.restore();
  }
}

function spoke(c, R) {
  const w = R * 0.056;
  const g = c.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, '#41454a');
  g.addColorStop(0.35, '#b2b7bd');
  g.addColorStop(0.6, '#80868c');
  g.addColorStop(1, '#2e3134');
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(-w / 2, -R * 0.47, w, R * 0.3, w * 0.25);
  c.fill();
  const kx = 0;
  const ky = -R * 0.495;
  const kr = R * 0.058;
  const kg = c.createRadialGradient(kx - kr * 0.35, ky - kr * 0.4, kr * 0.1, kx, ky, kr);
  kg.addColorStop(0, '#e1e5e9');
  kg.addColorStop(0.5, '#858b91');
  kg.addColorStop(1, '#2b2d30');
  c.beginPath();
  c.arc(kx, ky, kr, 0, TAU);
  c.fillStyle = kg;
  c.fill();
}

function disc(c, r, fill) {
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.fillStyle = fill;
  c.fill();
}

function ring(c, r, width, stroke) {
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.lineWidth = Math.max(1, width);
  c.strokeStyle = stroke;
  c.stroke();
}

function engraveRing(c, r, R) {
  ring(c, r + R * 0.004, R * 0.004, 'rgba(255,255,255,0.12)');
  ring(c, r, R * 0.005, 'rgba(0,0,0,0.45)');
}

// Text running along the bottom of a circle, reading left to right.
function engraveArc(c, text, r, centerDeg, R) {
  const px = Math.max(9, R * 0.04);
  c.save();
  c.font = `600 ${px}px 'JetBrains Mono', monospace`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const spacing = px * 0.28;
  const widths = [...text].map((ch) => c.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0);
  let cursor = centerDeg + ((total / r) * 180) / Math.PI / 2;
  [...text].forEach((ch, i) => {
    const half = ((widths[i] / 2 / r) * 180) / Math.PI;
    cursor -= half;
    const a = rad(cursor);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    c.save();
    c.translate(x, y);
    c.rotate(((cursor - 180) * Math.PI) / 180);
    c.fillStyle = 'rgba(255,255,255,0.16)';
    c.fillText(ch, 0, Math.max(1, R * 0.004));
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillText(ch, 0, 0);
    c.restore();
    cursor -= half;
  });
  c.restore();
}

function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
