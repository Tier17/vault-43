// Draws the tilted crawl on a canvas. Each line is placed on a plane that
// leans back into the screen and is projected with simple perspective, so
// there is no CSS 3D camera that text can slip behind.

const TILT = (56 * Math.PI) / 180;

export class CrawlText {
  constructor(canvas, { episode, title, body }) {
    this.canvas = canvas;
    this.c = canvas.getContext('2d');
    this.content = { episode, title, body };
    this.offset = 0;
    this.layout();
  }

  layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    this.canvas.width = w;
    this.canvas.height = h;
    this.w = w;
    this.h = h;
    this.P = h * 1.05; // focal length
    this.vanish = h * 0.06; // where the far end converges
    this.cy0 = this.vanish + this.P / Math.tan(TILT);
    this.width = Math.min(w * 0.6, h * 1.25); // line width at the bottom edge
    this.size = this.width / 18.5;
    this.lineH = this.size * 1.38;

    const c = this.c;
    const font = (weight, size) => `${weight} ${size}px Archivo, 'Arial Narrow', sans-serif`;
    c.font = font(700, this.size);
    const space = c.measureText(' ').width;

    const lines = [];
    let s = 0; // distance along the plane, top of text = largest s
    const push = (line) => { lines.push({ ...line, s }); };

    push({ kind: 'center', text: this.content.episode.toUpperCase(), weight: 600, scale: 1, spacing: 0.06 });
    s -= this.lineH * 1.5;
    push({ kind: 'center', text: this.content.title.toUpperCase(), weight: 900, scale: 1.7, spacing: 0.04 });
    s -= this.lineH * 1.9;

    for (const para of this.content.body) {
      const words = para.split(/\s+/);
      let row = [];
      let rowW = 0;
      const flush = (last) => {
        push({ kind: last ? 'left' : 'justify', words: row, widths: row.map((x) => c.measureText(x).width), weight: 700, scale: 1 });
        s -= this.lineH;
        row = [];
        rowW = 0;
      };
      for (const word of words) {
        const ww = c.measureText(word).width;
        if (row.length && rowW + space + ww > this.width) flush(false);
        rowW += (row.length ? space : 0) + ww;
        row.push(word);
      }
      if (row.length) flush(true);
      s -= this.lineH * 0.9;
    }

    // s now runs from 0 (episode) down to the last line; shift so the top
    // line starts just below the screen.
    const length = -s;
    for (const l of lines) l.s += length;
    this.lines = lines;
    this.length = length;
    this.space = space;
    this.font = font;
    // the plane position where the first line is just under the bottom edge
    this.start = -length - this.lineH * 2;
    this.offset = this.start;
  }

  /** True once the last line is far enough away to end the crawl. */
  get done() {
    const last = Math.min(...this.lines.map((l) => l.s)) + this.offset;
    return last > 0 && this.project(last).scale < 0.3;
  }

  project(s) {
    const z = s * Math.sin(TILT);
    const scale = this.P / (this.P + z);
    const y = this.cy0 + (this.h - s * Math.cos(TILT) - this.cy0) * scale;
    return { y, scale };
  }

  draw() {
    const { c, w, h } = this;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#ffd84a';
    c.textBaseline = 'alphabetic';
    for (const line of this.lines) {
      const s = line.s + this.offset;
      if (s < -this.lineH * 3) continue; // still below the screen
      const { y, scale } = this.project(s);
      if (y > h + this.size * 3) continue;
      // fade into the distance
      const alpha = Math.max(0, Math.min(1, (scale - 0.16) / 0.22));
      if (alpha <= 0) continue;
      // Real foreshortening: across, the line shrinks by `scale`; up and
      // down it is squashed by how fast the plane recedes at this depth.
      const squash = Math.abs(this.project(s + 1).y - y);
      c.globalAlpha = alpha;
      c.save();
      c.translate(w / 2, y);
      c.scale(scale, squash);
      c.font = this.font(line.weight, this.size * line.scale);
      if (line.kind === 'center') {
        c.letterSpacing = `${(line.spacing || 0) * this.size * line.scale}px`;
        c.textAlign = 'center';
        c.fillText(line.text, 0, 0);
        c.letterSpacing = '0px';
      } else {
        c.textAlign = 'left';
        const total = line.widths.reduce((a, b) => a + b, 0);
        const gap = line.kind === 'justify' && line.words.length > 1
          ? (this.width - total) / (line.words.length - 1)
          : this.space;
        let x = -this.width / 2;
        line.words.forEach((word, k) => {
          c.fillText(word, x, 0);
          x += line.widths[k] + gap;
        });
      }
      c.restore();
    }
    c.globalAlpha = 1;
  }
}
