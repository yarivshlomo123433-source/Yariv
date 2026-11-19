// The six Coin Hopper mascots as real 3D models, built from geometry at load time
// (no image sprites). Each model faces +X; the rig has pivots for legs, arms and head so
// one animation function drives run, jump, idle, cheer and stun for every character.
window.Chars3D = (function () {
  const T = THREE;
  T.ColorManagement.legacyMode = false;   // treat hex colours as sRGB, so they render true to the palette

  const CHARACTERS = [
    { id: 'astro', name: 'Blue Astronaut', short: 'Astro', ui: '#3f86ea', tagline: 'The all-rounder explorer!' },
    { id: 'frog', name: 'Green Frog', short: 'Froggy', ui: '#3fbf4a', tagline: 'Springs higher than anyone!' },
    { id: 'cat', name: 'Pink Cat', short: 'Kitty', ui: '#ef5aa0', tagline: 'Quick paws, sharp turns.' },
    { id: 'robot', name: 'Yellow Robot', short: 'Robo', ui: '#f2c230', tagline: 'Built for top speed.' },
    { id: 'penguin', name: 'Penguin', short: 'Pingo', ui: '#5b6fd6', tagline: 'Slides like a champ.' },
    { id: 'fox', name: 'Orange Fox', short: 'Foxy', ui: '#ff7a2e', tagline: 'Sly, fast and fearless.' },
  ];

  // Shared geometry, made once.
  const G = {
    sphere: new T.SphereGeometry(1, 32, 24),
    sphereLo: new T.SphereGeometry(1, 16, 12),
    cone: new T.ConeGeometry(1, 1, 24),
    cyl: new T.CylinderGeometry(1, 1, 1, 20),
    limb: new T.CapsuleGeometry(0.075, 0.2, 6, 12),
    arm: new T.CapsuleGeometry(0.065, 0.17, 6, 12),
    torus: new T.TorusGeometry(1, 0.22, 12, 32),
  };

  const matCache = new Map();
  function mat(color, o = {}) {
    const key = color + JSON.stringify(o);
    if (matCache.has(key)) return matCache.get(key);
    const m = new T.MeshStandardMaterial({
      color, roughness: o.rough ?? 0.42, metalness: o.metal ?? 0.02,
      emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1,
    });
    matCache.set(key, m);
    return m;
  }

  function mesh(geo, material, pos, scale, rot) {
    const m = new T.Mesh(geo, material);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (scale) typeof scale === 'number' ? m.scale.setScalar(scale) : m.scale.set(scale[0], scale[1], scale[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // A cartoon eye looking toward +X: white ball, dark pupil, sparkle.
  function eye(parent, x, y, z, size, o = {}) {
    const g = new T.Group();
    g.position.set(x, y, z);
    g.add(mesh(G.sphere, mat(0xffffff, { rough: 0.2 }), [0, 0, 0], [size * 0.7, size, size * 0.85]));
    g.add(mesh(G.sphere, mat(o.pupil ?? 0x15183a, { rough: 0.15 }), [size * 0.5, -size * 0.05, 0], [size * 0.32, size * 0.62, size * 0.5]));
    g.add(mesh(G.sphereLo, mat(0xffffff, { emissive: 0xffffff, ei: 0.6 }), [size * 0.78, size * 0.25, size * 0.15], size * 0.14));
    parent.add(g);
    return g;
  }

  function starShape(r1, r2) {
    const s = new T.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r2 : r1;
      i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
    return s;
  }
  const starGeo = new T.ExtrudeGeometry(starShape(0.1, 0.045), { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });

  // Rig shared by all characters. `p` holds the palette and parts.
  function rig(p) {
    const root = new T.Group();
    const body = new T.Group();           // bobs and leans
    root.add(body);
    const parts = { root, body };

    // Legs (pivot at the hip, the leg hangs down).
    parts.legs = [-1, 1].map((side) => {
      const pivot = new T.Group();
      pivot.position.set(0, 0.36, side * 0.13);
      pivot.add(mesh(G.limb, mat(p.leg), [0, -0.13, 0]));
      const shoe = mesh(G.sphere, mat(p.shoe, { rough: 0.3 }), [0.05, -0.29, 0], [0.15, 0.085, 0.11]);
      pivot.add(shoe);
      pivot.add(mesh(G.sphereLo, mat(0xffffff, { rough: 0.3 }), [0.12, -0.26, 0], [0.04, 0.02, 0.06])); // toe shine
      body.add(pivot);
      return pivot;
    });

    // Torso.
    const torso = mesh(G.sphere, mat(p.body), [0, 0.55, 0], [0.28, 0.3, 0.26]);
    body.add(torso);
    if (p.belly) body.add(mesh(G.sphere, mat(p.belly), [0.1, 0.52, 0], [0.2, 0.24, 0.2]));
    parts.torso = torso;

    // Arms (pivot at the shoulder).
    parts.arms = [-1, 1].map((side) => {
      const pivot = new T.Group();
      pivot.position.set(0, 0.68, side * 0.28);
      pivot.rotation.x = side * 0.25;
      pivot.add(mesh(G.arm, mat(p.arm || p.body), [0, -0.12, 0]));
      pivot.add(mesh(G.sphere, mat(p.hand, { rough: 0.35 }), [0, -0.27, 0], 0.1));
      body.add(pivot);
      return pivot;
    });

    // Head.
    const head = new T.Group();
    head.position.set(0.02, 0.98, 0);
    body.add(head);
    parts.head = head;
    return parts;
  }

  const BUILD = {
    astro() {
      const p = rig({ body: 0x2f6fe0, belly: 0xffffff, leg: 0x2f6fe0, shoe: 0xff8a1f, hand: 0xffffff, arm: 0x2f6fe0 });
      const h = p.head;
      h.add(mesh(G.sphere, mat(0x2a66d8, { rough: 0.25 }), [0, 0, 0], [0.4, 0.38, 0.4]));
      h.add(mesh(G.sphere, mat(0x101634, { rough: 0.08, metal: 0.3 }), [0.17, 0.0, 0], [0.26, 0.27, 0.3]));
      // One big friendly eye on the visor, plus a sheen.
      const e = new T.Group();
      e.position.set(0.41, 0.02, 0.02);
      e.add(mesh(G.sphere, mat(0xffffff, { emissive: 0xffffff, ei: 0.25 }), [0, 0, 0], [0.03, 0.12, 0.09]));
      e.add(mesh(G.sphere, mat(0x101634), [0.02, -0.01, 0.02], [0.02, 0.07, 0.05]));
      h.add(e);
      h.add(mesh(G.sphereLo, mat(0xffffff, { emissive: 0xbfd8ff, ei: 0.6, rough: 0.05 }), [0.33, 0.13, -0.1], [0.04, 0.06, 0.08]));
      h.add(mesh(G.torus, mat(0xff8a1f, { rough: 0.3 }), [-0.02, -0.28, 0], [0.26, 0.26, 0.3], [Math.PI / 2, 0, 0]));
      p.body.add(mesh(G.sphere, mat(0xff8a1f), [0, 0.42, 0], [0.285, 0.05, 0.265]));     // belt
      const star = new T.Mesh(starGeo, mat(0xffd23f, { rough: 0.25, emissive: 0x5a3a00, ei: 0.4 }));
      star.position.set(0.27, 0.58, -0.015);
      star.rotation.y = Math.PI / 2;
      star.castShadow = true;
      p.body.add(star);
      p.body.add(mesh(G.sphere, mat(0xdfe6f2, { rough: 0.3 }), [-0.24, 0.6, 0], [0.12, 0.17, 0.18])); // backpack
      return p;
    },
    frog() {
      const p = rig({ body: 0x45c23d, belly: 0xf3f0c8, leg: 0x45c23d, shoe: 0xffc21f, hand: 0x7ee06a, arm: 0x45c23d });
      const h = p.head;
      h.add(mesh(G.sphere, mat(0x4cc845, { rough: 0.35 }), [0, -0.02, 0], [0.4, 0.33, 0.42]));
      [-1, 1].forEach((s) => {
        h.add(mesh(G.sphere, mat(0x4cc845, { rough: 0.35 }), [0.06, 0.24, s * 0.18], 0.15));
        eye(h, 0.17, 0.27, s * 0.18, 0.11);
      });
      // Wide open smile.
      const mouth = mesh(G.sphere, mat(0xc0283d, { rough: 0.5 }), [0.33, -0.12, 0], [0.08, 0.1, 0.24]);
      h.add(mouth);
      h.add(mesh(G.sphere, mat(0xff8fa0), [0.37, -0.17, 0], [0.04, 0.05, 0.13]));
      h.add(mesh(G.sphereLo, mat(0xff9fb0, { rough: 0.6 }), [0.3, -0.02, 0.27], [0.05, 0.035, 0.05]));
      h.add(mesh(G.sphereLo, mat(0xff9fb0, { rough: 0.6 }), [0.3, -0.02, -0.27], [0.05, 0.035, 0.05]));
      return p;
    },
    cat() {
      const p = rig({ body: 0xf25ea8, belly: 0xfff0f6, leg: 0xf25ea8, shoe: 0xffffff, hand: 0xffffff, arm: 0xf25ea8 });
      const h = p.head;
      h.add(mesh(G.sphere, mat(0xf461aa, { rough: 0.4 }), [0, 0, 0], [0.38, 0.35, 0.4]));
      [-1, 1].forEach((s) => {
        h.add(mesh(G.cone, mat(0xf461aa), [-0.02, 0.36, s * 0.2], [0.13, 0.22, 0.12], [s * 0.35, 0, 0]));
        h.add(mesh(G.cone, mat(0xffc1dc), [0.03, 0.34, s * 0.2], [0.07, 0.14, 0.06], [s * 0.35, 0, 0]));
        eye(h, 0.29, 0.05, s * 0.14, 0.11);
      });
      h.add(mesh(G.sphere, mat(0xffffff), [0.3, -0.12, 0], [0.12, 0.1, 0.16]));
      h.add(mesh(G.sphereLo, mat(0xff4f8a, { rough: 0.3 }), [0.41, -0.06, 0], [0.03, 0.025, 0.035]));
      // Tail.
      const curve = new T.CatmullRomCurve3([new T.Vector3(-0.22, 0.45, 0), new T.Vector3(-0.42, 0.55, 0), new T.Vector3(-0.48, 0.82, 0.05), new T.Vector3(-0.38, 0.95, 0.08)]);
      p.body.add(mesh(new T.TubeGeometry(curve, 20, 0.05, 10), mat(0xf25ea8)));
      p.body.add(mesh(G.sphere, mat(0xffffff), [-0.38, 0.96, 0.08], 0.06));
      return p;
    },
    robot() {
      const p = rig({ body: 0xf6c21c, belly: 0xffd84a, leg: 0x8e98a8, shoe: 0x5b6474, hand: 0x9aa5b6, arm: 0x8e98a8 });
      const metal = mat(0xf6c21c, { rough: 0.28, metal: 0.25 });
      p.torso.material = metal;
      const h = p.head;
      h.add(mesh(G.sphere, metal, [0, 0, 0], [0.4, 0.34, 0.4]));
      h.add(mesh(G.sphere, mat(0x141a33, { rough: 0.1, metal: 0.3 }), [0.2, 0.0, 0], [0.22, 0.2, 0.3]));
      // Glowing happy eyes.
      [-1, 1].forEach((s) => {
        const eyeArc = mesh(new T.TorusGeometry(0.06, 0.02, 8, 16, Math.PI), mat(0x63f6ff, { emissive: 0x2ee6ff, ei: 1.4 }), [0.415, 0.02, s * 0.11], 1, [0, Math.PI / 2, 0]);
        h.add(eyeArc);
      });
      h.add(mesh(G.cyl, mat(0x8e98a8, { metal: 0.5, rough: 0.3 }), [0, 0.42, 0], [0.018, 0.16, 0.018]));
      h.add(mesh(G.sphere, mat(0xff3b3b, { emissive: 0x8a0000, ei: 0.5, rough: 0.2 }), [0, 0.52, 0], 0.05));
      [-1, 1].forEach((s) => h.add(mesh(G.cyl, mat(0x8e98a8, { metal: 0.5 }), [0, 0, s * 0.4], [0.07, 0.04, 0.07], [Math.PI / 2, 0, 0])));
      // Chest grill.
      for (let i = 0; i < 4; i++) p.body.add(mesh(G.cyl, mat(0x3a2a00), [0.27, 0.5 + i * 0.035 - 0.05, 0], [0.012, 0.012, 0.12], [Math.PI / 2, 0, 0]).rotateX(Math.PI / 2));
      return p;
    },
    penguin() {
      const p = rig({ body: 0x1f2a5c, belly: 0xffffff, leg: 0xff9a1f, shoe: 0xff9a1f, hand: 0x1f2a5c, arm: 0x1f2a5c });
      p.torso.scale.set(0.3, 0.33, 0.28);
      const h = p.head;
      h.add(mesh(G.sphere, mat(0x1f2a5c, { rough: 0.35 }), [0, 0, 0], [0.38, 0.36, 0.38]));
      h.add(mesh(G.sphere, mat(0xffffff, { rough: 0.4 }), [0.16, -0.03, 0], [0.25, 0.27, 0.3]));
      [-1, 1].forEach((s) => eye(h, 0.34, 0.06, s * 0.12, 0.08));
      h.add(mesh(G.cone, mat(0xff9a1f, { rough: 0.35 }), [0.47, -0.06, 0], [0.07, 0.16, 0.07], [0, 0, -Math.PI / 2]));
      h.add(mesh(G.sphereLo, mat(0xff8fa0, { rough: 0.6 }), [0.34, -0.1, 0.2], [0.03, 0.025, 0.05]));
      h.add(mesh(G.sphereLo, mat(0xff8fa0, { rough: 0.6 }), [0.34, -0.1, -0.2], [0.03, 0.025, 0.05]));
      return p;
    },
    fox() {
      const p = rig({ body: 0xff7a2e, belly: 0xfff4e8, leg: 0x5a3a28, shoe: 0x4a2c1c, hand: 0x5a3a28, arm: 0xff7a2e });
      const h = p.head;
      h.add(mesh(G.sphere, mat(0xff7a2e, { rough: 0.4 }), [0, 0, 0], [0.38, 0.35, 0.4]));
      h.add(mesh(G.sphere, mat(0xfff4e8), [0.24, -0.1, 0], [0.2, 0.15, 0.3]));
      [-1, 1].forEach((s) => {
        h.add(mesh(G.cone, mat(0xff7a2e), [-0.04, 0.38, s * 0.2], [0.13, 0.28, 0.1], [s * 0.3, 0, 0]));
        h.add(mesh(G.cone, mat(0x3a2418), [-0.04, 0.5, s * 0.245], [0.05, 0.08, 0.04], [s * 0.3, 0, 0]));
        eye(h, 0.3, 0.07, s * 0.14, 0.09);
      });
      h.add(mesh(G.sphereLo, mat(0x1b1220, { rough: 0.2 }), [0.44, -0.07, 0], [0.04, 0.035, 0.045]));
      // Big bushy tail with a white tip.
      const tail = new T.Group();
      tail.position.set(-0.22, 0.42, 0);
      tail.rotation.z = 0.9;
      tail.add(mesh(G.sphere, mat(0xff7a2e), [0, -0.2, 0], [0.13, 0.25, 0.13]));
      tail.add(mesh(G.sphere, mat(0xfff4e8), [0, -0.42, 0], [0.1, 0.1, 0.1]));
      tail.rotation.order = 'ZXY';
      p.body.add(tail);
      p.tail = tail;
      return p;
    },
  };

  function create(id) {
    const p = BUILD[id] ? BUILD[id]() : BUILD.astro();
    p.id = id;
    p.root.userData.char = p;
    p.phase = Math.random() * 10;
    return p;
  }

  // state: idle | run | jump | fall | cheer | stun | wave. speed is run speed in units/s.
  function animate(p, state, dt, speed = 0) {
    p.phase += dt * (state === 'run' ? Math.max(6, speed * 2.2) : 4);
    const t = p.phase;
    const [lL, lR] = p.legs, [aL, aR] = p.arms;
    let bob = 0, lean = 0, headTilt = 0;
    const set = (o, z, k) => { o.rotation.z += (z - o.rotation.z) * Math.min(1, k * dt); };
    if (state === 'run') {
      const s = Math.sin(t);
      set(lL, s * 1.0, 30); set(lR, -s * 1.0, 30);
      set(aL, -s * 1.1, 30); set(aR, s * 1.1, 30);
      bob = Math.abs(Math.cos(t)) * 0.07;
      lean = -0.18;
      headTilt = Math.sin(t * 2) * 0.04;
    } else if (state === 'jump' || state === 'fall') {
      const up = state === 'jump';
      set(lL, up ? 0.9 : 0.35, 14); set(lR, up ? -0.5 : -0.25, 14);
      set(aL, up ? 2.6 : 1.9, 14); set(aR, up ? 1.4 : 2.2, 14);
      lean = up ? -0.1 : 0.05;
    } else if (state === 'cheer') {
      set(lL, 0, 10); set(lR, 0, 10);
      set(aL, 2.9 + Math.sin(t * 3) * 0.3, 18); set(aR, 2.9 - Math.sin(t * 3) * 0.3, 18);
      bob = Math.max(0, Math.sin(t * 3)) * 0.18;
    } else if (state === 'wave') {
      set(lL, 0, 10); set(lR, 0, 10);
      set(aL, 0.15, 10); set(aR, 2.6 + Math.sin(t * 5) * 0.35, 18);
      bob = Math.sin(t) * 0.015;
    } else if (state === 'stun') {
      set(lL, 0.2, 10); set(lR, -0.2, 10);
      set(aL, 1.2, 10); set(aR, -1.2, 10);
      headTilt = Math.sin(t * 6) * 0.25;
    } else {
      set(lL, 0, 10); set(lR, 0, 10);
      set(aL, 0.12 + Math.sin(t) * 0.05, 10); set(aR, 0.12 + Math.sin(t) * 0.05, 10);
      bob = Math.sin(t) * 0.015;
    }
    p.body.position.y = bob;
    p.body.rotation.z += (lean - p.body.rotation.z) * Math.min(1, 10 * dt);
    p.head.rotation.x = headTilt;
    if (p.tail) p.tail.rotation.x = Math.sin(t * 1.5) * 0.4;
  }

  // Portraits for the UI, rendered from the real models once at load.
  let shotRenderer = null;
  function portraits(size = 256) {
    if (!shotRenderer) {
      shotRenderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      shotRenderer.setPixelRatio(1);
      shotRenderer.outputEncoding = T.sRGBEncoding;
      shotRenderer.toneMapping = T.ACESFilmicToneMapping;
      shotRenderer.toneMappingExposure = 1.1;
    }
    shotRenderer.setSize(size, size);
    const out = {};
    const scene = new T.Scene();
    scene.add(new T.HemisphereLight(0xffffff, 0x8899bb, 1.0));
    const key = new T.DirectionalLight(0xffffff, 1.25);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new T.DirectionalLight(0xbfe0ff, 0.6);
    rim.position.set(-3, 2, -4);
    scene.add(rim);
    const cam = new T.PerspectiveCamera(30, 1, 0.1, 50);
    for (const c of CHARACTERS) {
      const p = create(c.id);
      p.root.rotation.y = -0.75;
      scene.add(p.root);
      animate(p, 'idle', 0.016);
      const shots = {};
      cam.position.set(1.6, 1.15, 2.2); cam.lookAt(0, 0.95, 0); cam.fov = 26; cam.updateProjectionMatrix();
      shotRenderer.render(scene, cam); shots.head = shotRenderer.domElement.toDataURL('image/png');
      animate(p, 'wave', 0.3);
      cam.position.set(2.4, 1.0, 3.4); cam.lookAt(0, 0.62, 0); cam.fov = 30; cam.updateProjectionMatrix();
      shotRenderer.render(scene, cam); shots.full = shotRenderer.domElement.toDataURL('image/png');
      scene.remove(p.root);
      out[c.id] = shots;
    }
    return out;
  }

  return { CHARACTERS, create, animate, portraits, byId: (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0] };
})();
