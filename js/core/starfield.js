// A 3D starfield on a canvas. Nearly still by default; warp() stretches the
// stars into streaks for the jump between chapters.

export class Starfield {
  constructor(canvas, { count = 700 } = {}) {
    this.canvas = canvas;
    this.c = canvas.getContext('2d');
    this.speed = 0.004;
    this.target = 0.004;
    this.stars = Array.from({ length: count }, () => this.spawn(Math.random()));
    this.raf = 0;
    this.last = performance.now();
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  spawn(z = 1) {
    return {
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z,
      pz: z,
      tw: Math.random() * 6.28,
      warm: Math.random() < 0.12,
    };
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
  }

  warp(on = true) {
    this.target = on ? 1.6 : 0.004;
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // ease toward the target speed; warp builds up, it doesn't snap
    this.speed += (this.target - this.speed) * Math.min(1, dt * (this.target > this.speed ? 1.6 : 4));

    const { c, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const f = Math.max(w, h) * 0.5;
    const streak = this.speed > 0.05;

    c.fillStyle = streak ? 'rgba(0,0,0,0.55)' : '#000';
    c.fillRect(0, 0, w, h);

    for (const s of this.stars) {
      s.pz = s.z;
      s.z -= this.speed * dt;
      if (s.z <= 0.02) {
        Object.assign(s, this.spawn(1));
        continue;
      }
      const x = cx + (s.x / s.z) * f;
      const y = cy + (s.y / s.z) * f;
      if (x < 0 || x > w || y < 0 || y > h) {
        if (streak) Object.assign(s, this.spawn(1));
        continue;
      }
      const near = 1 - s.z;
      const size = (0.4 + near * 1.8) * this.dpr;
      const twinkle = 0.65 + 0.35 * Math.sin(now / 700 + s.tw);
      const alpha = Math.min(1, (0.25 + near * 0.9) * (streak ? 1 : twinkle));
      const colour = s.warm ? '255,226,190' : '220,232,255';
      if (streak) {
        const px = cx + (s.x / s.pz) * f;
        const py = cy + (s.y / s.pz) * f;
        c.strokeStyle = `rgba(${colour},${alpha})`;
        c.lineWidth = size;
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(x, y);
        c.stroke();
      } else {
        c.fillStyle = `rgba(${colour},${alpha})`;
        c.fillRect(x, y, size, size);
      }
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
  }
}
