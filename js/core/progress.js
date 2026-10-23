// Which missions are finished. Kept in localStorage so he can stop and come
// back another day; holds only mission ids, nothing personal.

export class Progress {
  constructor(slot, missions) {
    this.key = `progress:${slot}`;
    this.missions = missions;
    this.done = new Set();
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) || '[]');
      for (const id of saved) if (missions.some((m) => m.id === id)) this.done.add(id);
    } catch {
      // storage blocked or corrupt: start fresh
    }
  }

  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify([...this.done]));
    } catch {
      // ignore
    }
  }

  complete(id) {
    this.done.add(id);
    this.save();
  }

  reset() {
    this.done.clear();
    this.save();
  }

  /** The first mission not yet done, or null when everything is finished. */
  get current() {
    return this.missions.find((m) => !this.done.has(m.id)) || null;
  }

  isOpen(m) {
    return this.done.has(m.id) || m === this.current;
  }

  level(doneSet = this.done) {
    return 1 + this.missions.filter((m) => doneSet.has(m.id)).reduce((a, m) => a + m.xp, 0);
  }

  stats(doneSet = this.done) {
    const out = [0, 0, 0, 0];
    for (const m of this.missions) {
      if (doneSet.has(m.id)) m.gain.forEach((g, i) => { out[i] += g; });
    }
    return out;
  }
}

export function rankFor(level, ranks) {
  let name = ranks[0][1];
  for (const [min, r] of ranks) if (level >= min) name = r;
  return name;
}
