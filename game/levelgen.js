// Race course generator. The same seed always gives the same course, so every player in a
// room builds an identical map from the seed the host shares.
//
// A course is a list of columns (ground height per column, or a pit) plus objects:
//   start, flag, plat (one-way platform), coin, box (power-up), walker, flyer.
// Rows are 0..13 top to bottom; ground at "height 0" has its top surface on row 12.
window.LevelGen = (function () {
  const ROWS = 14;
  const BASE = 12;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate(seed, opts = {}) {
    const r = rng(seed);
    const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const cols = [];
    const objects = [];
    let h = 0;                      // current ground height above the base, 0..3
    const top = () => BASE - h;
    const ground = (len, t = top()) => { for (let i = 0; i < len; i++) cols.push({ top: t }); };
    const pit = (len) => { for (let i = 0; i < len; i++) cols.push({ top: null }); };
    const coinLine = (c, len, row) => { for (let i = 0; i < len; i++) objects.push({ type: 'coin', c: c + i, r: row }); };
    const coinArc = (c, len, row) => {
      for (let i = 0; i < len; i++) {
        const lift = Math.round(Math.sin(((i + 0.5) / len) * Math.PI) * 2);
        objects.push({ type: 'coin', c: c + i, r: row - lift });
      }
    };

    // Start area.
    ground(9);
    objects.push({ type: 'start', c: 3, r: top() - 1 });

    const chunks = opts.chunks ?? 15;
    const kinds = ['flat', 'gap', 'gap', 'gapPlat', 'step', 'step', 'wall', 'stairs', 'walker', 'walker', 'flyer'];
    let sinceBox = 1;
    let last = '';
    for (let k = 0; k < chunks; k++) {
      let kind = pick(kinds);
      if (kind === last && kind !== 'step') kind = 'flat';
      last = kind;
      const c0 = cols.length;
      switch (kind) {
        case 'flat': {
          const len = ri(5, 8);
          ground(len);
          if (r() < 0.6) coinLine(c0 + 1, len - 2, top() - 2);
          break;
        }
        case 'gap': {
          ground(2);
          const g = ri(2, 4);
          pit(g);
          coinArc(c0 + 2, g, top() - 2);
          ground(3);
          break;
        }
        case 'gapPlat': {
          ground(2);
          const g = ri(6, 8);
          const p = c0 + 2 + Math.floor((g - 3) / 2);
          pit(g);
          objects.push({ type: 'plat', c: p, r: top() - 2, len: 3 });
          coinLine(p, 3, top() - 3);
          ground(3);
          break;
        }
        case 'step': {
          const up = h <= 1 ? true : h >= 3 ? false : r() < 0.5;
          h = Math.max(0, Math.min(3, h + (up ? ri(1, 2) : -ri(1, 2))));
          ground(ri(4, 6));
          break;
        }
        case 'wall': {
          ground(3);
          ground(2, top() - 4);        // four tiles tall: needs the double jump
          coinLine(c0 + 3, 2, top() - 6);
          ground(4);
          break;
        }
        case 'stairs': {
          ground(2);
          const t = top();
          pit(11);
          objects.push({ type: 'plat', c: c0 + 3, r: t - 2, len: 3 });
          objects.push({ type: 'plat', c: c0 + 7, r: t - 4, len: 3 });
          coinLine(c0 + 7, 3, t - 5);
          ground(3);
          break;
        }
        case 'walker': {
          const len = ri(8, 11);
          ground(len);
          objects.push({ type: 'walker', c: c0 + len - 3, r: top() - 1, left: c0 + 1, right: c0 + len - 2 });
          break;
        }
        case 'flyer': {
          const len = ri(7, 9);
          ground(len);
          objects.push({ type: 'flyer', c: c0 + Math.floor(len / 2), r: top() - 3 });
          coinLine(c0 + 1, 2, top() - 1);
          break;
        }
      }
      sinceBox += 1;
      if (sinceBox >= 2) {
        // A short flat stretch with a power-up capsule at running height.
        const b0 = cols.length;
        ground(4);
        objects.push({ type: 'box', c: b0 + 2, r: top() - 1 });
        sinceBox = 0;
      }
    }

    // Finish straight.
    const f0 = cols.length;
    ground(14);
    objects.push({ type: 'flag', c: f0 + 7, r: top() - 1 });
    return { seed, rows: ROWS, cols, objects, width: cols.length };
  }

  return { generate, ROWS };
})();
