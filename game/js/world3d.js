// 3D worlds: the four rotating maps (Sunny Valley, Frosty Peaks, Jungle Ruins, Lava Canyon).
// buildCourse() turns a generated course (levelgen.js) into floating islands with grassy caps
// and rocky undersides, plus scenery, coins, power capsules, enemies and the finish arch.
// One world unit = one course column; ground surface height = ROWS - top row.
window.World3D = (function () {
  const T = THREE;
  const ROWS = 14;

  const MAPS = [
    {
      id: 'sunny', name: 'Sunny Valley', blurb: 'A bright, bouncy valley full of coins!', icon: 'leaf', color: '#ffd23f',
      sky: ['#2f9cff', '#8fd6ff', '#e6f8ff'], fog: 0xbfe6ff, sun: 0xfff2d8, hemiSky: 0xcfe8ff, hemiGround: 0x5a7a4a,
      top: 0x4cbf34, topHi: 0x9cf060, rock: 0xb47a4e, rockDark: 0x7a4a30, stone: 0x8a78a8, below: 'clouds',
      far: 0x9ab8e0, farCap: 0xffffff, mid: 0x6fbf6a, tree: 0x4fae4a, tree2: 0x7cd06a, trunk: 0x7a5236, flower: [0xffffff, 0xff7ab8, 0xffd23f],
      banner: 0x8a4dff, water: 0x5ec8ff,
    },
    {
      id: 'frosty', name: 'Frosty Peaks', blurb: 'Slide, hop and race across icy heights!', icon: 'snow', color: '#7fd4ff',
      sky: ['#5aa8ff', '#a8dcff', '#f2fbff'], fog: 0xdcefff, sun: 0xf2f8ff, hemiSky: 0xe8f6ff, hemiGround: 0x8aa4c8,
      top: 0xf4fbff, topHi: 0xffffff, rock: 0x86a8d6, rockDark: 0x4d6a9a, stone: 0xb8d8f2, below: 'ice',
      far: 0xb8cce8, farCap: 0xffffff, mid: 0xcfe2f5, tree: 0x2f7a5a, tree2: 0x3f9a6a, trunk: 0x6a4a36, flower: [0xbfe8ff, 0xffffff, 0x9fd8ff],
      banner: 0x3f86ea, water: 0x9fe0ff, snow: true,
    },
    {
      id: 'jungle', name: 'Jungle Ruins', blurb: 'Explore lost ruins and race lush paths!', icon: 'ruins', color: '#5fd04a',
      sky: ['#46b8d8', '#a8e6d0', '#f2ffd8'], fog: 0xcff0d8, sun: 0xfff0c8, hemiSky: 0xe0ffe8, hemiGround: 0x4a6a3a,
      top: 0x34a02e, topHi: 0x8ae060, rock: 0x9a9a82, rockDark: 0x666a58, stone: 0xb8b090, below: 'river',
      far: 0x7ab09a, farCap: 0xd8f0e0, mid: 0x3f9a4a, tree: 0x2f8a3a, tree2: 0x5fc04a, trunk: 0x6a4a2a, flower: [0xff6ab8, 0xffd23f, 0xff8a3f],
      banner: 0xd8402a, water: 0x3fc0b0, ruins: true,
    },
    {
      id: 'lava', name: 'Lava Canyon', blurb: 'Dodge gushing lava through fiery canyons!', icon: 'fire', color: '#ff6a2a',
      sky: ['#2a1a3a', '#a8402a', '#ffb05a'], fog: 0x8a4a3a, sun: 0xffc890, hemiSky: 0xffb890, hemiGround: 0x3a1a1a,
      top: 0x5a4a52, topHi: 0x8a7078, rock: 0x4a3238, rockDark: 0x2a1a20, stone: 0x6a5058, below: 'lava',
      far: 0x5a2a2a, farCap: 0xff8a3a, mid: 0x4a2a2a, tree: 0x3a2a2a, tree2: 0x5a3a2a, trunk: 0x2a1a1a, flower: [0xff8a3a, 0xffd23f, 0xff4a2a],
      banner: 0xff4a2a, water: 0xff6a1a, lava: true,
    },
  ];

  const mats = new Map();
  function mat(color, o = {}) {
    const key = color + JSON.stringify(o);
    if (!mats.has(key)) {
      mats.set(key, new T.MeshStandardMaterial({
        color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, flatShading: !!o.flat,
        emissive: o.emissive ?? 0, emissiveIntensity: o.ei ?? 1, transparent: !!o.opacity, opacity: o.opacity ?? 1,
      }));
    }
    return mats.get(key);
  }
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  // Box with rounded edges (front profile extruded with a bevel), for soft, toy-like slabs.
  function roundedSlab(w, h, d, r) {
    r = Math.min(r, h / 2 - 0.01, w / 2 - 0.01);
    const sh = new T.Shape(), x = -w / 2 + r, y = -h / 2 + r, iw = w - 2 * r, ih = h - 2 * r;
    sh.moveTo(x, y); sh.lineTo(x + iw, y); sh.lineTo(x + iw, y + ih); sh.lineTo(x, y + ih); sh.lineTo(x, y);
    const g = new T.ExtrudeGeometry(sh, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 4, curveSegments: 8 });
    g.translate(0, 0, -(d - 2 * r) / 2);
    return g;
  }
  function add(group, geo, material, x, y, z, sx = 1, sy = 1, sz = 1, shadow = true) {
    const m = new T.Mesh(geo, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
    return m;
  }

  // Seeded random so every player decorates the same course the same way.
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function skyTexture(colors) {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, colors[0]); grad.addColorStop(0.55, colors[1]); grad.addColorStop(1, colors[2]);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }

  // ---- Shared geometry -------------------------------------------------------
  const GEO = {
    sphere: new T.SphereGeometry(1, 20, 14),
    sphereLo: new T.SphereGeometry(1, 10, 8),
    rock: new T.DodecahedronGeometry(1, 0),
    cone: new T.ConeGeometry(1, 1, 16),
    coneLo: new T.ConeGeometry(1, 1, 7),
    cyl: new T.CylinderGeometry(1, 1, 1, 16),
    coin: new T.CylinderGeometry(0.28, 0.28, 0.07, 28),
  };

  function coinMaterial() {
    if (mats.has('coinface')) return mats.get('coinface');
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const rad = g.createRadialGradient(48, 44, 6, 64, 64, 64);
    rad.addColorStop(0, '#fff6b8'); rad.addColorStop(0.5, '#ffcc33'); rad.addColorStop(1, '#d48a10');
    g.fillStyle = rad; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#b06a08'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff2a0'; g.strokeStyle = '#b06a08'; g.lineWidth = 4; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 15 : 34; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    g.closePath(); g.fill(); g.stroke();
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    const face = new T.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.55, emissive: 0x5a3a00, emissiveIntensity: 0.35 });
    const edge = new T.MeshStandardMaterial({ color: 0xe8a018, roughness: 0.25, metalness: 0.6, emissive: 0x4a2a00, emissiveIntensity: 0.35 });
    const arr = [edge, face, face];
    mats.set('coinface', arr);
    return arr;
  }

  const POWER_STYLE = {
    ice: { color: '#3f9bff', glow: 0x5ab8ff, icon: 'snow' },
    slime: { color: '#4cc83a', glow: 0x6aff4a, icon: 'slime' },
    boost: { color: '#ff7a1a', glow: 0xffa040, icon: 'bolt' },
    shield: { color: '#8a55f0', glow: 0xb48aff, icon: 'shield' },
  };

  // Icon drawing shared by the 3D capsules and the HUD.
  function drawIcon(g, kind, s) {
    g.save();
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = '#161a33'; g.lineWidth = s * 0.06;
    if (kind === 'bolt') {
      g.fillStyle = '#ffe14a';
      g.beginPath(); [[0.58, 0.08], [0.24, 0.55], [0.47, 0.55], [0.38, 0.92], [0.76, 0.42], [0.52, 0.42], [0.62, 0.08]].forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s)));
      g.closePath(); g.fill(); g.stroke();
    } else if (kind === 'snow') {
      g.strokeStyle = '#ffffff'; g.lineWidth = s * 0.075;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const ex = s / 2 + Math.cos(a) * s * 0.36, ey = s / 2 + Math.sin(a) * s * 0.36;
        g.beginPath(); g.moveTo(s / 2, s / 2); g.lineTo(ex, ey); g.stroke();
        const mx = s / 2 + Math.cos(a) * s * 0.22, my = s / 2 + Math.sin(a) * s * 0.22;
        [-0.6, 0.6].forEach((d) => { g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + Math.cos(a + d) * s * 0.1, my + Math.sin(a + d) * s * 0.1); g.stroke(); });
      }
    } else if (kind === 'slime') {
      g.fillStyle = '#8af04a';
      g.beginPath(); g.moveTo(s * 0.18, s * 0.78);
      g.bezierCurveTo(s * 0.1, s * 0.5, s * 0.3, s * 0.3, s * 0.5, s * 0.22);
      g.bezierCurveTo(s * 0.7, s * 0.3, s * 0.9, s * 0.5, s * 0.82, s * 0.78);
      g.quadraticCurveTo(s * 0.75, s * 0.9, s * 0.66, s * 0.78); g.quadraticCurveTo(s * 0.56, s * 0.92, s * 0.48, s * 0.8);
      g.quadraticCurveTo(s * 0.36, s * 0.92, s * 0.3, s * 0.8); g.quadraticCurveTo(s * 0.24, s * 0.88, s * 0.18, s * 0.78);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(s * 0.4, s * 0.42, s * 0.07, s * 0.04, -0.5, 0, Math.PI * 2); g.fill();
    } else if (kind === 'shield') {
      g.fillStyle = '#c8a8ff';
      g.beginPath(); g.moveTo(s * 0.5, s * 0.1); g.lineTo(s * 0.84, s * 0.22); g.quadraticCurveTo(s * 0.84, s * 0.7, s * 0.5, s * 0.9);
      g.quadraticCurveTo(s * 0.16, s * 0.7, s * 0.16, s * 0.22); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(s * 0.5, s * 0.22); g.lineTo(s * 0.72, s * 0.3); g.quadraticCurveTo(s * 0.7, s * 0.6, s * 0.5, s * 0.76); g.closePath(); g.globalAlpha = 0.5; g.fill();
    }
    g.restore();
  }

  function iconCanvas(kind, s = 128, bg) {
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    if (bg) {
      const r = s * 0.2;
      const grad = g.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.15, bg); grad.addColorStop(1, '#161a33');
      g.fillStyle = grad;
      g.beginPath(); g.roundRect ? g.roundRect(4, 4, s - 8, s - 8, r) : g.rect(4, 4, s - 8, s - 8); g.fill();
      g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.globalAlpha = 0.85; g.stroke(); g.globalAlpha = 1;
      g.translate(s * 0.15, s * 0.15);
      drawIcon(g, kind, s * 0.7);
    } else drawIcon(g, kind, s);
    return c;
  }

  function capsuleMesh(type) {
    const st = POWER_STYLE[type] || POWER_STYLE.boost;
    const tex = new T.CanvasTexture(iconCanvas(st.icon, 128, st.color));
    tex.encoding = T.sRGBEncoding;
    const g = new T.Group();
    const cube = new T.Mesh(new T.BoxGeometry(0.7, 0.7, 0.7), new T.MeshStandardMaterial({ map: tex, roughness: 0.25, emissive: st.glow, emissiveIntensity: 0.35, emissiveMap: tex }));
    cube.castShadow = true;
    g.add(cube);
    const halo = new T.Mesh(new T.SphereGeometry(0.62, 18, 14), new T.MeshBasicMaterial({ color: st.glow, transparent: true, opacity: 0.22, depthWrite: false }));
    g.add(halo);
    g.userData.cube = cube;
    return g;
  }

  // ---- Islands ---------------------------------------------------------------
  // Painted rock texture per theme: blotches, cracks and strata, tiled in world space.
  const rockTex = new Map();
  function rockMaterial(th) {
    if (rockTex.has(th.id)) return rockTex.get(th.id);
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const r = rng(th.id.length * 977);
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    g.fillStyle = hex(th.rock); g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = r() < 0.5 ? hex(th.rockDark) : hex(th.stone);
      g.globalAlpha = 0.18 + r() * 0.25;
      g.beginPath(); g.ellipse(r() * 256, r() * 256, 10 + r() * 34, 6 + r() * 18, r() * 3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 0.45; g.strokeStyle = hex(th.rockDark); g.lineWidth = 3;
    for (let y = 40; y < 256; y += 56 + r() * 20) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + (r() - 0.5) * 10); g.stroke(); }
    g.globalAlpha = 0.25; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) { const x = r() * 256, y = r() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 30, y + 10 + r() * 30); g.stroke(); }
    if (th.lava) { g.globalAlpha = 0.9; g.strokeStyle = '#ff6a1a'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { const x = r() * 256, y = r() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20, y + 26); g.lineTo(x + 8, y + 50); g.stroke(); } }
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(0.28, 0.28);
    const m = new T.MeshStandardMaterial({ map: tex, roughness: 0.92, emissive: th.lava ? 0xff3a00 : 0, emissiveMap: th.lava ? tex : null, emissiveIntensity: th.lava ? 0.25 : 1 });
    rockTex.set(th.id, m);
    return m;
  }

  const capGeo = new T.CapsuleGeometry(0.2, 1, 6, 14);
  // Top surface texture: grass blades / snow sparkle / moss, tiled in world space.
  const topTex = new Map();
  function topMaterial(th) {
    if (topTex.has(th.id)) return topTex.get(th.id);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const r = rng(th.id.length * 131);
    const col = new T.Color(th.top);
    g.fillStyle = '#' + col.getHexString(); g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) {
      const k = 0.78 + r() * 0.35;
      g.fillStyle = '#' + col.clone().multiplyScalar(k).getHexString();
      g.fillRect(r() * 128, r() * 128, 2 + r() * 3, 4 + r() * 6);
    }
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(2, 2);
    const m = new T.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    topTex.set(th.id, m);
    return m;
  }
  // One island for a run of equal-height columns: grass cap on top, tapered rock below.
  function island(group, th, x1, x2, y, r, deep = 3.6, dropL = 0, dropR = 0) {
    const w = x2 - x1;
    const D = 2.6;
    const shape = new T.Shape();
    shape.moveTo(x1, y - 0.25);
    shape.lineTo(x2, y - 0.25);
    const steps = Math.max(3, Math.round(w));
    for (let i = 0; i <= steps; i++) {
      const t = 1 - i / steps;
      const px = x1 + t * w;
      // A side next to lower ground drops as a solid cliff to that ground, so a raised step
      // looks like the wall it is in the physics instead of a floating rock.
      const eL = Math.max(0.6, dropL), eR = Math.max(0.6, dropR);
      const edge = eL * (1 - t) + eR * t;
      const depth = Math.max(edge, (edge + Math.sin(t * Math.PI) * Math.max(0, deep - edge)) * (0.8 + r() * 0.35));
      const side = t > 0.5 ? dropR : dropL;
      const inset = side > 0 ? 0 : Math.min(w * 0.18, 0.8) * (1 - Math.sin(t * Math.PI));
      shape.lineTo(px + (t > 0.5 ? -inset : inset) * 0.6, y - 0.25 - depth);
    }
    shape.lineTo(x1, y - 0.25);
    const rockGeo = new T.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.32, bevelSegments: 5, steps: 1, curveSegments: 16 });
    rockGeo.translate(0, 0, -D / 2);
    const rock = new T.Mesh(rockGeo, rockMaterial(th));
    rock.castShadow = true; rock.receiveShadow = true;
    group.add(rock);
    // Chunky stones set into the cliff face.
    for (let i = 0; i < Math.max(1, Math.round(w / 1.2)); i++) {
      const sx = x1 + 0.3 + r() * (w - 0.6), sy = y - 0.8 - r() * Math.min(2, deep - 0.8);
      const st = add(group, GEO.rock, mat(r() < 0.5 ? th.stone : th.rockDark, { flat: true, rough: 0.85 }), sx, sy, D / 2 + 0.12, 0.3 + r() * 0.3, 0.26 + r() * 0.22, 0.22);
      st.rotation.set(r() * 3, r() * 3, r() * 3);
    }
    // Grass (or snow / basalt) cap: a slab with a soft rounded front edge that overhangs.
    add(group, roundedSlab(w + 0.3, 0.34, D + 0.5, 0.15), topMaterial(th), x1 + w / 2, y - 0.17, 0);
    const edge = add(group, capGeo, mat(th.top, { rough: 0.75 }), x1 + w / 2, y - 0.12, D / 2 + 0.22, 1, w + 0.1, 1);
    edge.rotation.z = Math.PI / 2;
    edge.scale.set(1.15, (w + 0.1) / 1.4, 1);
    const under = add(group, capGeo, mat(th.rockDark, { rough: 1 }), x1 + w / 2, y - 0.36, D / 2 + 0.12, 0.8, (w) / 1.4, 0.8, false);
    under.rotation.z = Math.PI / 2;
    // Little drips of grass/snow over the edge.
    for (let i = 0; i < Math.round(w * 1.2); i++) add(group, GEO.sphereLo, mat(th.top, { rough: 0.8 }), x1 + 0.2 + r() * (w - 0.4), y - 0.32 - r() * 0.08, D / 2 + 0.3, 0.12 + r() * 0.08, 0.14 + r() * 0.08, 0.1, false);
    // Light rim along the top front.
    add(group, box(w + 0.2, 0.04, 0.12), mat(th.topHi, { rough: 0.7, emissive: th.topHi, ei: 0.12 }), x1 + w / 2, y + 0.01, D / 2 + 0.2, 1, 1, 1, false);
    if (th.lava) for (let i = 0; i < Math.round(w / 2); i++) add(group, box(0.6 + r(), 0.05, 0.08), mat(0xff6a1a, { emissive: 0xff4a00, ei: 2 }), x1 + r() * w, y - 0.6 - r() * 1.4, D / 2 + 0.26, 1, 1, 1, false);
    // Small props on top, behind the running lane.
    for (let i = 0; i < Math.round(w / 2); i++) {
      const px = x1 + 0.3 + r() * (w - 0.6);
      const k = r();
      if (k < 0.5) flower(group, th, px, y, -0.9 + r() * 0.6, r);
      else if (k < 0.8) add(group, GEO.sphereLo, mat(th.tree2, { rough: 0.9 }), px, y + 0.12, -1.0, 0.42, 0.3, 0.38);
      else add(group, GEO.rock, mat(th.stone, { flat: true }), px, y + 0.1, -0.95, 0.24, 0.2, 0.24);
    }
  }

  function flower(group, th, x, y, z, r) {
    add(group, GEO.cyl, mat(0x3f9a3a), x, y + 0.1, z, 0.015, 0.2, 0.015, false);
    const c = th.flower[Math.floor(r() * th.flower.length)];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(group, GEO.sphereLo, mat(c, { rough: 0.6 }), x + Math.cos(a) * 0.06, y + 0.22, z + Math.sin(a) * 0.06, 0.05, 0.02, 0.05, false);
    }
    add(group, GEO.sphereLo, mat(0xffd23f, { rough: 0.5 }), x, y + 0.23, z, 0.035, 0.03, 0.035, false);
  }

  function tree(group, th, x, y, z, s, r) {
    if (th.snow) {
      add(group, GEO.cyl, mat(th.trunk), x, y + 0.4 * s, z, 0.12 * s, 0.8 * s, 0.12 * s);
      for (let i = 0; i < 3; i++) {
        add(group, GEO.coneLo, mat(th.tree, { flat: true }), x, y + (0.9 + i * 0.6) * s, z, (0.9 - i * 0.22) * s, 1.0 * s, (0.9 - i * 0.22) * s);
        add(group, GEO.coneLo, mat(0xffffff, { flat: true }), x, y + (1.15 + i * 0.6) * s, z, (0.55 - i * 0.14) * s, 0.45 * s, (0.55 - i * 0.14) * s, false);
      }
      return;
    }
    if (th.lava) {
      add(group, GEO.cyl, mat(th.trunk), x, y + 0.6 * s, z, 0.1 * s, 1.2 * s, 0.1 * s);
      add(group, GEO.cyl, mat(th.trunk), x + 0.25 * s, y + 1.0 * s, z, 0.05 * s, 0.6 * s, 0.05 * s).rotation.z = -0.8;
      return;
    }
    add(group, GEO.cyl, mat(th.trunk), x, y + 0.5 * s, z, 0.13 * s, 1.0 * s, 0.13 * s);
    const c1 = mat(th.tree, { rough: 0.85 }), c2 = mat(th.tree2, { rough: 0.85 });
    add(group, GEO.sphereLo, c1, x, y + 1.35 * s, z, 0.85 * s, 0.75 * s, 0.85 * s);
    add(group, GEO.sphereLo, c2, x - 0.35 * s, y + 1.65 * s, z + 0.2 * s, 0.55 * s, 0.5 * s, 0.55 * s);
    add(group, GEO.sphereLo, c2, x + 0.4 * s, y + 1.55 * s, z + 0.1 * s, 0.5 * s, 0.45 * s, 0.5 * s);
  }

  function banner(group, th, x, y, z) {
    add(group, GEO.cyl, mat(0x4a3a6a, { rough: 0.5 }), x, y + 1.0, z, 0.05, 2.0, 0.05);
    add(group, GEO.sphereLo, mat(0xffcc33, { metal: 0.5, rough: 0.3 }), x, y + 2.05, z, 0.09, 0.09, 0.09);
    const flag = add(group, box(0.7, 0.9, 0.04), mat(th.banner, { rough: 0.7 }), x + 0.38, y + 1.5, z);
    const coin = new T.Mesh(GEO.coin, coinMaterial());
    coin.rotation.x = Math.PI / 2;
    coin.position.set(x + 0.38, y + 1.55, z + 0.05);
    coin.scale.setScalar(0.75);
    group.add(coin);
    return flag;
  }

  function ruin(group, th, x, y, z, s) {
    const m = mat(th.stone, { flat: true, rough: 0.9 });
    add(group, box(0.5 * s, 2.2 * s, 0.5 * s), m, x - 0.8 * s, y + 1.1 * s, z);
    add(group, box(0.5 * s, 1.6 * s, 0.5 * s), m, x + 0.8 * s, y + 0.8 * s, z);
    add(group, box(2.2 * s, 0.45 * s, 0.6 * s), m, x, y + 2.3 * s, z).rotation.z = -0.06;
    add(group, GEO.sphereLo, mat(th.tree2, { rough: 0.9 }), x - 0.8 * s, y + 2.5 * s, z + 0.1, 0.35 * s, 0.2 * s, 0.3 * s, false);
  }

  function finishArch(group, x, y) {
    const pillar = mat(0xf2e6d0, { rough: 0.6 });
    [-1.4, 1.4].forEach((dz) => {
      add(group, GEO.cyl, pillar, x, y + 1.6, dz, 0.18, 3.2, 0.18);
      add(group, GEO.cyl, mat(0xffcc33, { metal: 0.5, rough: 0.3 }), x, y + 0.08, dz, 0.28, 0.16, 0.28);
    });
    // Checkered banner.
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#161a33' : '#ffffff'; g.fillRect(i * 16, j * 16, 16, 16); }
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    add(group, box(0.12, 0.7, 3.0), [new T.MeshStandardMaterial({ map: tex, roughness: 0.6 }), new T.MeshStandardMaterial({ map: tex }), mat(0xd04a2a), mat(0xd04a2a), new T.MeshStandardMaterial({ map: tex, roughness: 0.6 }), new T.MeshStandardMaterial({ map: tex, roughness: 0.6 })], x, y + 3.1, 0);
    const star = new T.Mesh(GEO.coin, coinMaterial());
    star.rotation.x = Math.PI / 2;
    star.rotation.z = Math.PI / 2;
    star.position.set(x + 0.08, y + 3.75, 0);
    star.scale.setScalar(1.6);
    group.add(star);
    // A strip on the ground.
    add(group, box(0.5, 0.03, 2.6), new T.MeshStandardMaterial({ map: tex, roughness: 0.7 }), x, y + 0.02, 0, 1, 1, 1, false);
    return star;
  }

  function enemyMesh(kind) {
    const g = new T.Group();
    if (kind === 'walker') {
      add(g, GEO.sphere, mat(0x8a3fd6, { rough: 0.35 }), 0, 0.28, 0, 0.42, 0.3, 0.36);
      for (let i = -1; i <= 1; i++) add(g, GEO.cone, mat(0xffd27a, { rough: 0.5 }), i * 0.18, 0.62, 0, 0.08, 0.22, 0.08);
      [-1, 1].forEach((s) => {
        add(g, GEO.sphereLo, mat(0xffffff, { rough: 0.2 }), -0.3, 0.34, s * 0.12, 0.06, 0.09, 0.09);
        add(g, GEO.sphereLo, mat(0x161a33), -0.35, 0.32, s * 0.12, 0.035, 0.05, 0.05);
      });
    } else {
      add(g, GEO.sphere, mat(0xff8a2a, { rough: 0.4 }), 0, 0, 0, 0.4, 0.3, 0.3);
      [-0.12, 0.12].forEach((x) => add(g, box(0.07, 0.62, 0.62), mat(0x5a2412), x, 0, 0, 1, 1, 1, false));
      [-1, 1].forEach((s) => add(g, GEO.sphereLo, new T.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, roughness: 0.2 }), 0.05, 0.32, s * 0.2, 0.18, 0.06, 0.24, false));
      add(g, GEO.sphereLo, mat(0xffffff, { rough: 0.2 }), -0.32, 0.06, 0.1, 0.06, 0.08, 0.08);
      add(g, GEO.sphereLo, mat(0x161a33), -0.37, 0.05, 0.1, 0.035, 0.05, 0.05);
    }
    return g;
  }

  // ---- Backdrop ----------------------------------------------------------------
  function backdrop(scene, th, width, r, clearX = 0) {
    const g = new T.Group();
    scene.add(g);
    scene.background = skyTexture(th.sky);
    scene.fog = new T.Fog(th.fog, 30, 190);
    // Far mountains.
    for (let x = -60; x < width + 120; x += 22 + r() * 18) {
      const h = 30 + r() * 30, w = 26 + r() * 16, z = -120 - r() * 50;
      add(g, GEO.coneLo, mat(th.far, { flat: true }), x, h / 2 - 6, z, w, h, w * 0.7, false);
      add(g, GEO.coneLo, mat(th.farCap, { flat: true, emissive: th.lava ? 0xff5a1a : 0, ei: th.lava ? 0.6 : 1 }), x, h - 6 - h * 0.17, z + 0.3, w * 0.36, h * 0.34, w * 0.26, false);
    }
    // Mid floating islands with trees and waterfalls.
    for (let x = -20; x < width + 40; x += 14 + r() * 12) {
      const y = 3 + r() * 7, z = -22 - r() * 16, w = 4 + r() * 5;
      if (clearX && Math.abs(x + w / 2) < clearX) continue;
      const ig = new T.Group();
      island(ig, th, x, x + w, y, r, 2.5 + r() * 2);
      if (r() < 0.7) tree(ig, th, x + w * 0.5, y, -0.4, 0.9 + r() * 0.6, r);
      if (r() < 0.35 && !th.lava) {
        const fall = new T.Mesh(new T.PlaneGeometry(0.9, 18), new T.MeshBasicMaterial({ color: th.water, transparent: true, opacity: 0.75, fog: true }));
        fall.position.set(x + w * 0.8, y - 9, 1.6);
        ig.add(fall);
      }
      ig.traverse((o) => { o.castShadow = false; });
      g.add(ig);
    }
    // Clouds.
    if (!th.lava) for (let x = -20; x < width + 60; x += 16 + r() * 20) {
      const cg = new T.Group();
      const cm = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.25, transparent: true, opacity: 0.95 });
      for (let i = 0; i < 4; i++) add(cg, GEO.sphereLo, cm, i * 1.4, Math.sin(i) * 0.4, 0, 1.4 - Math.abs(i - 1.5) * 0.25, 1.0, 1.0, false);
      cg.position.set(x, 13 + r() * 6, -40 - r() * 20);
      g.add(cg);
    }
    // Below the course: a sea of clouds, icy water, a river or lava.
    const below = th.below;
    if (below === 'clouds') {
      const cm = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xdff0ff, emissiveIntensity: 0.35 });
      for (let x = -10; x < width + 20; x += 2.6) for (let z = -16; z <= 6; z += 5) add(g, GEO.sphereLo, cm, x + r() * 2, -4.5 + r() * 0.8, z + r() * 3, 2.4 + r(), 1.4, 2.4, false);
    } else {
      const col = below === 'lava' ? 0xff5a10 : th.water;
      const water = new T.Mesh(new T.PlaneGeometry(width + 200, 120), new T.MeshStandardMaterial({
        color: col, roughness: below === 'lava' ? 0.6 : 0.15, metalness: below === 'lava' ? 0 : 0.2,
        emissive: below === 'lava' ? 0xff3a00 : 0x000000, emissiveIntensity: below === 'lava' ? 1.2 : 1,
      }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(width / 2, -5.2, -40);
      water.receiveShadow = true;
      g.add(water);
      if (below === 'ice') for (let i = 0; i < width / 4; i++) add(g, box(1.6 + r() * 2, 0.25, 1.2 + r()), mat(0xf2fbff, { rough: 0.3 }), r() * width, -5.05, -6 + r() * 10, 1, 1, 1, false);
    }
    // Near background: trees, ruins, banners just behind the track.
    return g;
  }

  // Lights: hemisphere fill plus a sun that follows the camera so shadows stay sharp.
  function lights(scene, th) {
    const hemi = new T.HemisphereLight(th.hemiSky, th.hemiGround, th.lava ? 0.75 : 0.95);
    scene.add(hemi);
    const sun = new T.DirectionalLight(th.sun, th.lava ? 1.1 : 1.45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 10, bottom: -8, near: 1, far: 60 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    if (th.lava) {
      const glow = new T.HemisphereLight(0x000000, 0xff5a1a, 0.6);
      scene.add(glow);
    }
    return sun;
  }

  // ---- The whole course --------------------------------------------------------
  function buildCourse(scene, level, mapId) {
    const th = MAPS.find((m) => m.id === mapId) || MAPS[0];
    const r = rng(level.seed ^ 0x9e3779b9);
    const width = level.width;
    const world = { th, coins: [], boxes: [], enemies: [], spin: [], width };
    world.sun = lights(scene, th);
    world.back = backdrop(scene, th, width, r);
    const g = new T.Group();
    scene.add(g);
    world.group = g;

    // Islands: one per run of equal-height columns.
    let start = 0;
    const cols = level.cols;
    const surf = (c) => (cols[c] && cols[c].top != null ? ROWS - cols[c].top : null);
    for (let c = 1; c <= cols.length; c++) {
      if (c === cols.length || surf(c) !== surf(start)) {
        const y = surf(start);
        if (y != null) {
          const yl = surf(start - 1), yr = surf(c);
          const dl = yl != null && yl < y ? y - yl + 0.9 : 0, dr = yr != null && yr < y ? y - yr + 0.9 : 0;
          island(g, th, start, c, y, r, 3 + (c - start) * 0.15, dl, dr);
        }
        start = c;
      }
    }
    // Near scenery behind the track.
    for (let c = 2; c < width - 2; c += 3 + Math.floor(r() * 4)) {
      const y = surf(c);
      if (y == null) continue;
      const k = r();
      if (th.ruins && k < 0.3) ruin(g, th, c + 0.5, y, -1.6, 0.8 + r() * 0.3);
      else if (k < 0.75) tree(g, th, c + 0.5, y, -1.3 - r() * 0.3, 0.75 + r() * 0.45, r);
      else banner(g, th, c + 0.5, y, -1.2);
    }
    // Floating one-way platforms.
    for (const o of level.objects.filter((o) => o.type === 'plat')) {
      const y = ROWS - o.r;
      island(g, th, o.c, o.c + o.len, y, r, 1.2);
    }
    // Coins.
    const coinMat = coinMaterial();
    for (const o of level.objects.filter((o) => o.type === 'coin')) {
      const m = new T.Mesh(GEO.coin, coinMat);
      m.position.set(o.c + 0.5, ROWS - o.r - 0.5, 0);
      m.rotation.x = Math.PI / 2;
      m.castShadow = true;
      g.add(m);
      world.coins.push({ mesh: m, x: o.c + 0.5, y: ROWS - o.r - 0.5, taken: false });
    }
    // Power capsules.
    const kinds = ['ice', 'slime', 'boost', 'shield'];
    for (const o of level.objects.filter((o) => o.type === 'box')) {
      const type = kinds[Math.floor(r() * kinds.length)];
      const m = capsuleMesh(type);
      m.position.set(o.c + 0.5, ROWS - o.r - 0.45, 0);
      g.add(m);
      world.boxes.push({ mesh: m, x: o.c + 0.5, y: ROWS - o.r - 0.45, type, backAt: 0 });
    }
    // Enemies.
    for (const o of level.objects) {
      if (o.type !== 'walker' && o.type !== 'flyer') continue;
      const m = enemyMesh(o.type);
      g.add(m);
      if (o.type === 'walker') world.enemies.push({ kind: 'walker', mesh: m, L: o.left + 0.5, R: o.right + 0.5, y: ROWS - o.r - 1, deadUntil: 0 });
      else world.enemies.push({ kind: 'flyer', mesh: m, cx: o.c + 0.5, cy: ROWS - o.r - 0.5, deadUntil: 0 });
    }
    // Finish.
    const flag = level.objects.find((o) => o.type === 'flag');
    world.finishX = flag.c + 0.5;
    world.spin.push(finishArch(g, world.finishX, ROWS - flag.r - 1));
    const st = level.objects.find((o) => o.type === 'start');
    world.startX = st.c + 0.5;
    world.startY = ROWS - st.r - 1;
    world.surf = surf;
    world.plats = level.objects.filter((o) => o.type === 'plat').map((o) => ({ x1: o.c, x2: o.c + o.len, y: ROWS - o.r }));
    // Snowfall for Frosty Peaks, embers for Lava Canyon.
    if (th.snow || th.lava) {
      const n = 500, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = r() * 60 - 30; pos[i * 3 + 1] = r() * 20 - 4; pos[i * 3 + 2] = r() * 16 - 10; }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      const pts = new T.Points(geo, new T.PointsMaterial({ color: th.snow ? 0xffffff : 0xffa040, size: th.snow ? 0.12 : 0.08, transparent: true, opacity: 0.9 }));
      scene.add(pts);
      world.particles = pts;
    }
    return world;
  }

  // Per-frame scenery motion: spinning coins, bobbing capsules, falling snow.
  function animateWorld(world, t, camX) {
    for (const c of world.coins) if (!c.taken) c.mesh.rotation.z = t * 3;
    for (const b of world.boxes) {
      b.mesh.position.y = b.y + Math.sin(t * 2.4 + b.x) * 0.1;
      b.mesh.userData.cube.rotation.y = t * 1.2;
    }
    for (const s of world.spin) s.rotation.y = t * 2;
    if (world.particles) {
      world.particles.position.x = camX;
      const a = world.particles.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - (world.th.snow ? 0.02 : -0.015);
        if (y < -4) y = 16; if (y > 16) y = -4;
        a.setY(i, y);
      }
      a.needsUpdate = true;
    }
  }

  return { MAPS, buildCourse, animateWorld, island, tree, flower, banner, coinMaterial, iconCanvas, drawIcon, POWER_STYLE, mapById: (id) => MAPS.find((m) => m.id === id) || MAPS[0], skyTexture, lights, backdrop, rng, ROWS };
})();
