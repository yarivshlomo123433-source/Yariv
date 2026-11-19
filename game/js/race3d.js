// The live race: one WebGL renderer shared by every 3D scene in the game (menu, showcase,
// race), the race loop at a fixed 60 Hz step, camera, input, power-ups, effects, the in-race
// HUD and online sync through Net (room presence). The host also runs the bots and decides
// when the race is over.
window.Race = (function () {
  const T = THREE;
  const STEP = 1 / 60;
  const FINISH_GRACE = 20, MAX_RACE = 180;
  const POWER_KINDS = ['ice', 'slime', 'boost', 'shield'];

  // ---- Shared renderer ---------------------------------------------------------
  let renderer = null, canvas = null, quality = 'high';
  function getRenderer() {
    if (renderer) return renderer;
    canvas = document.getElementById('game3d');
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    setQuality(quality);
    resize();
    window.addEventListener('resize', resize);
    return renderer;
  }
  function setQuality(q) {
    quality = q;
    if (!renderer) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 1.75 : 1));
    renderer.shadowMap.enabled = q !== 'low';
    resize();
  }
  function resize() {
    if (!renderer) return;
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    if (active && active.camera) { active.camera.aspect = w / h; active.camera.updateProjectionMatrix(); }
  }

  // One scene owns the loop at a time (menu showcase or race).
  let active = null, rafId = 0, lastTime = 0;
  function run(view) {
    if (active && active.dispose) active.dispose();
    active = view;
    getRenderer();
    resize();
    cancelAnimationFrame(rafId);
    lastTime = performance.now();
    const loop = (now) => {
      rafId = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      if (active) { active.update(dt, now / 1000); renderer.render(active.scene, active.camera); }
    };
    rafId = requestAnimationFrame(loop);
  }
  function stop() { if (active && active.dispose) active.dispose(); active = null; cancelAnimationFrame(rafId); }

  // ---- Menu showcase: characters on a grassy stage ----------------------------------
  function showcase(opts) {
    const scene = new T.Scene();
    const th = World3D.mapById(opts.map || 'sunny');
    const r = World3D.rng(7);
    World3D.lights(scene, th);
    World3D.backdrop(scene, th, 40, r, 16);
    const g = new T.Group();
    scene.add(g);
    World3D.island(g, th, -7, 7, 0, r, 3);
    [-6, -4.5, 4.5, 6].forEach((x, i) => World3D.tree(g, th, x, 0, -1.6, 1 + (i % 2) * 0.3, r));
    World3D.banner(g, th, -5.4, 0, -0.6);
    World3D.banner(g, th, 5.0, 0, -0.6);
    for (let i = 0; i < 10; i++) World3D.flower(g, th, -6 + r() * 12, 0, 0.6 + r() * 0.8, r);
    const camera = new T.PerspectiveCamera(32, 16 / 9, 0.1, 400);
    const chars = [];
    const ids = opts.ids;
    (opts.pedestals || []).forEach((pd) => {
      const ped = new T.Mesh(new T.CylinderGeometry(0.75, 0.82, pd.h, 32), new T.MeshStandardMaterial({ color: pd.color, roughness: 0.3, metalness: 0.35 }));
      ped.position.set(pd.x, pd.h / 2, 0.4);
      ped.castShadow = ped.receiveShadow = true;
      scene.add(ped);
      const rim = new T.Mesh(new T.TorusGeometry(0.76, 0.06, 10, 40), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
      rim.rotation.x = Math.PI / 2;
      rim.position.set(pd.x, pd.h, 0.4);
      scene.add(rim);
    });
    ids.forEach((id, i) => {
      const p = Chars3D.create(id);
      const n = ids.length;
      const pos = opts.positions && opts.positions[i];
      p.root.position.set(pos ? pos.x : (i - (n - 1) / 2) * (opts.spacing || 1.35), pos ? pos.y || 0 : 0, pos ? pos.z ?? 0.4 : opts.z || 0.4);
      p.root.rotation.y = pos && pos.ry !== undefined ? pos.ry : -Math.PI / 2 + (i - (n - 1) / 2) * -0.12;   // facing the camera
      p.root.scale.setScalar(pos && pos.s ? pos.s : opts.scale || 1);
      p.baseRy = p.root.rotation.y;
      scene.add(p.root);
      chars.push(p);
    });
    const cam = opts.cam || { pos: [0, 1.4, 8.2], look: [0, 0.9, 0] };
    camera.position.set(...cam.pos);
    camera.lookAt(...cam.look);
    let t = 0;
    return {
      scene, camera, chars,
      update(dt) {
        t += dt;
        chars.forEach((p, i) => {
          const s = opts.anim ? opts.anim(i, t) : ((Math.floor(t / 2.4) + i) % 3 === 0 ? 'cheer' : (i % 2 ? 'wave' : 'idle'));
          Chars3D.animate(p, s, dt);
          if (opts.spin) p.root.rotation.y = p.baseRy + Math.sin(t * 0.6) * 0.5;
        });
        camera.position.x = cam.pos[0] + Math.sin(t * 0.25) * 0.15;
        camera.lookAt(...cam.look);
      },
    };
  }

  // ---- The race ----------------------------------------------------------------------
  function start(opts) {
    // opts: { seed, mapId, roster:[{k,n,c,b,sk,up}], myKey, isHost, solo, ranked, e(epoch), onFinished(ms), onRaceOver(res), hud }
    const level = window.LevelGen.generate(opts.seed);
    const scene = new T.Scene();
    const world = World3D.buildCourse(scene, level, opts.mapId);
    const camera = new T.PerspectiveCamera(36, 16 / 9, 0.1, 500);
    const view = { scene, camera, world, opts };
    const hud = opts.hud;
    const runners = new Map();      // key -> Sim.Runner (simulated here)
    const brains = new Map();
    const visuals = new Map();      // key -> { rig, x, y, ... } for everyone
    const fx = new Map();           // id -> live power effect
    const seenFx = new Set();
    let myFx = [], myHits = [];
    let raceT = -3.4, started = false, over = false, firstFinishAt = 0, resultSent = false, acc = 0, lastNet = 0;
    let camX = world.startX, camY = world.startY + 2, shake = 0;
    const me = { key: opts.myKey };

    // Runners.
    opts.roster.forEach((p, i) => {
      const local = p.k === opts.myKey || (p.b && opts.isHost);
      const x = world.startX - i * 0.45, y = world.startY;
      if (local) {
        const r = new Sim.Runner({ key: p.k, name: p.n, charId: p.c, bot: !!p.b, me: p.k === opts.myKey, x, y, upgrades: p.up, ranked: opts.ranked });
        runners.set(p.k, r);
        if (p.b) brains.set(p.k, new Sim.Bot(r, p.sk || 0.7));
      }
      const rig = Chars3D.create(p.c);
      rig.root.position.set(x, y, 0.15 - i * 0.12);
      scene.add(rig.root);
      const shadow = new T.Mesh(new T.CircleGeometry(0.32, 20), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      scene.add(shadow);
      visuals.set(p.k, { p, rig, shadow, x, y, vx: 0, vy: 0, f: 1, st: 'idle', prog: 0, ft: 0, seen: local, z: 0.15 - i * 0.12, status: {} });
    });
    me.runner = runners.get(opts.myKey);

    // Effect meshes reused per runner: ice block, shield bubble, slow goo, stun stars, boost trail.
    const iceMat = new T.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.6, emissive: 0x2a7aff, emissiveIntensity: 0.3 });
    const shieldMat = new T.MeshStandardMaterial({ color: 0xb48aff, roughness: 0.1, transparent: true, opacity: 0.28, emissive: 0x8a55f0, emissiveIntensity: 0.6, depthWrite: false });
    for (const v of visuals.values()) {
      v.ice = new T.Mesh(new T.BoxGeometry(0.85, 1.15, 0.85), iceMat); v.ice.visible = false; scene.add(v.ice);
      v.shield = new T.Mesh(new T.SphereGeometry(0.75, 24, 18), shieldMat); v.shield.visible = false; scene.add(v.shield);
      v.stars = new T.Group();
      for (let i = 0; i < 3; i++) v.stars.add(new T.Mesh(new T.OctahedronGeometry(0.07), new T.MeshBasicMaterial({ color: 0xffe14a })));
      v.stars.visible = false; scene.add(v.stars);
    }
    const puffs = [];
    const puffGeo = new T.SphereGeometry(0.08, 8, 6);
    function puff(x, y, z, color, n = 6, speed = 2) {
      for (let i = 0; i < n; i++) {
        const m = new T.Mesh(puffGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
        m.position.set(x, y, z);
        const a = (i / n) * Math.PI * 2;
        puffs.push({ m, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.7 + 1, vz: (Math.random() - 0.5) * speed, life: 0.5 });
        scene.add(m);
      }
    }

    // ---- Input ----------------------------------------------------------------------
    const keys = {};
    const prevKeys = {};
    const onKey = (e, down) => {
      const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', Digit1: 'p1', Digit2: 'p2', Digit3: 'p3', Digit4: 'p4', KeyQ: 'p1', KeyE: 'p2', KeyR: 'p3', KeyF: 'p4' };
      const k = map[e.code];
      if (!k) return;
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (down && !keys[k]) {
        if (k === 'jump') jumpLatch = true;
        const pi = ['p1', 'p2', 'p3', 'p4'].indexOf(k);
        if (pi >= 0) queuedPowers.push(POWER_KINDS[pi]);
      }
      keys[k] = down;
      e.preventDefault();
    };
    let jumpLatch = false;
    const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const queuedPowers = [];
    hud.onPower = (kind) => queuedPowers.push(kind);
    hud.onJump = () => { jumpLatch = true; };

    function readInput(canMove) {
      const touch = window.touchInput || {};
      const jumpNow = !!(keys.jump || touch.jump);
      const inp = {
        dir: ((keys.right || touch.right) ? 1 : 0) - ((keys.left || touch.left) ? 1 : 0),
        jumpPressed: jumpLatch || (jumpNow && !prevKeys.jump), jumpHeld: jumpNow, jumpReleased: !jumpNow && (prevKeys.jump || jumpLatch),
        power: null,
      };
      jumpLatch = false;
      prevKeys.jump = jumpNow;
      if (queuedPowers.length && canMove && (!me.runner || raceT >= me.runner.powerCooldown)) inp.power = queuedPowers.shift();
      return inp;
    }

    // ---- Powers ----------------------------------------------------------------------
    function allPositions() {
      return opts.roster.map((p) => {
        const r = runners.get(p.k), v = visuals.get(p.k);
        return r ? { key: p.k, x: r.x, y: r.y, finished: r.finished, prog: r.progress(world) } : { key: p.k, x: v.x, y: v.y, finished: !!v.ft, prog: v.prog };
      });
    }

    function usePower(r, kind) {
      if (!r.powers[kind] || raceT < r.powerCooldown || r.finished) return;
      r.powers[kind]--;
      r.powerCooldown = raceT + 0.6;
      const id = opts.myKey + '-' + Math.random().toString(36).slice(2, 7);
      if (kind === 'boost') { r.boostUntil = raceT + r.stats.boostMs / 1000; emit({ id, k: 'boost', o: r.key }); }
      else if (kind === 'shield') { r.shieldUntil = raceT + 8; emit({ id, k: 'shield', o: r.key }); }
      else if (kind === 'slime') emit({ id, k: 'slime', o: r.key, x: +(r.x - r.facing * 0.9).toFixed(2), y: +r.y.toFixed(2) });
      else if (kind === 'ice') {
        // Freeze the closest rival ahead (or behind, if nobody is ahead).
        const others = allPositions().filter((o) => o.key !== r.key && !o.finished);
        const ahead = others.filter((o) => o.x > r.x).sort((a, b) => a.x - b.x);
        const tgt = ahead[0] || others.sort((a, b) => b.x - a.x)[0];
        if (!tgt) return;
        emit({ id, k: 'ice', o: r.key, t: tgt.key });
      }
      if (r.me) window.Sound.play(kind === 'ice' ? 'bolt' : kind === 'slime' ? 'slime' : kind === 'boost' ? 'speed' : 'box');
    }

    function emit(f) {
      f.e = opts.e;
      myFx = [...myFx, f].slice(-10);
      if (!opts.solo) Net.set({ fx: myFx });
      spawnFx(f);
    }

    function spawnFx(f) {
      if (seenFx.has(f.id)) return;
      seenFx.add(f.id);
      const owner = visuals.get(f.o);
      if (f.k === 'slime') {
        const m = new T.Mesh(new T.CylinderGeometry(0.55, 0.62, 0.08, 20), new T.MeshStandardMaterial({ color: 0x6ae03a, roughness: 0.2, emissive: 0x2a8a10, emissiveIntensity: 0.4 }));
        m.position.set(f.x, f.y + 0.04, 0.1);
        m.scale.setScalar(0.2);
        scene.add(m);
        fx.set(f.id, { ...f, m, born: raceT });
        if (owner && Math.abs(owner.x - camX) < 14) window.Sound.play('slime');
      } else if (f.k === 'ice') {
        const tv = visuals.get(f.t);
        if (!owner || !tv) return;
        const m = new T.Mesh(new T.OctahedronGeometry(0.28), iceMat);
        m.position.set(owner.x, owner.y + 0.7, 0.3);
        scene.add(m);
        fx.set(f.id, { ...f, m, born: raceT });
        window.Sound.play('bolt');
      } else if (owner) {
        puff(owner.x, owner.y + 0.5, 0.3, f.k === 'boost' ? 0xffa040 : 0xb48aff, 10, 3);
      }
    }

    function removeFx(id) {
      const f = fx.get(id);
      if (!f) return;
      fx.delete(id);
      scene.remove(f.m);
    }

    function registerHit(id) {
      myHits = [...myHits, id].slice(-14);
      if (!opts.solo) Net.set({ h: myHits });
    }

    function updateFx(dt) {
      for (const [id, f] of fx) {
        if (f.k === 'slime') {
          f.m.scale.setScalar(Math.min(1, f.m.scale.x + dt * 5));
          if (raceT - f.born > 14) { removeFx(id); continue; }
          for (const r of runners.values()) {
            if (r.key === f.o || r.finished || r.dead) continue;
            if (Math.abs(r.x - f.x) < 0.65 && Math.abs(r.y - f.y) < 0.3) {
              const res = r.hit('slime', raceT);
              if (res !== 'none') { registerHit(id); removeFx(id); puff(f.x, f.y + 0.2, 0.2, 0x8af04a, 10, 3); }
              break;
            }
          }
        } else if (f.k === 'ice') {
          const tv = visuals.get(f.t);
          if (!tv) { removeFx(id); continue; }
          const tx = tv.x, ty = tv.y + 0.6;
          const dx = tx - f.m.position.x, dy = ty - f.m.position.y;
          const d = Math.hypot(dx, dy);
          const sp = 26 * dt;
          f.m.rotation.x += dt * 8; f.m.rotation.y += dt * 6;
          if (d < 0.4 || raceT - f.born > 2.5) {
            const r = runners.get(f.t);
            if (r) r.hit('ice', raceT);
            puff(tx, ty, 0.3, 0xbfe8ff, 12, 3);
            removeFx(id);
          } else { f.m.position.x += (dx / d) * sp; f.m.position.y += (dy / d) * sp; }
        }
      }
    }

    // ---- Pickups and enemies ------------------------------------------------------------
    function pickups(r) {
      for (const c of world.coins) {
        if (c.taken && r.me) continue;
        if (Math.abs(c.x - r.x) > 0.5 || Math.abs(c.y - (r.y + 0.45)) > 0.65) continue;
        c.takenBy = c.takenBy || new Set();
        if (c.takenBy.has(r.key)) continue;
        c.takenBy.add(r.key);
        r.coins++;
        if (r.me) { c.taken = true; c.mesh.visible = false; puff(c.x, c.y, 0, 0xffd23f, 6, 2.5); window.Sound.play('coin'); }
      }
      for (const b of world.boxes) {
        b.backAt = b.backAt || {};
        if (raceT < (b.backAt[r.key] || 0)) continue;
        if (Math.abs(b.x - r.x) > 0.65 || Math.abs(b.y - (r.y + 0.45)) > 0.8) continue;
        if (r.powers[b.type] >= 2) continue;
        b.backAt[r.key] = raceT + 4;
        r.powers[b.type]++;
        if (r.me) { b.mesh.visible = false; puff(b.x, b.y, 0, 0x9ff0ff, 10, 3); window.Sound.play('box'); hud.toast(b.type); }
      }
      if (r.me) for (const b of world.boxes) if (!b.mesh.visible && raceT >= (b.backAt[r.key] || 0)) b.mesh.visible = true;
    }

    function enemies(r) {
      if (raceT < r.invulnUntil) return;
      for (const e of world.enemies) {
        if (raceT < e.deadUntil) continue;
        if (Math.abs(e.hx - r.x) > 0.6 || Math.abs(e.hy - (r.y + 0.45)) > 0.75) continue;
        if (r.vy < 0 && r.y > e.hy - 0.05) {
          e.deadUntil = raceT + 8;
          r.vy = Sim.M.STOMP; r.jumps = 1;
          puff(e.hx, e.hy, 0, 0xc79aff, 8, 3);
          if (r.me) { window.Sound.play('stomp'); shake = Math.max(shake, 0.25); }
        } else r.hit('enemy', raceT);
      }
    }

    // ---- Sync with other players ----------------------------------------------------------
    function netIn() {
      if (opts.solo) return;
      const peers = Net.peers();
      const byU = new Map(peers.filter((p) => p.u).map((p) => [p.u, p]));
      const host = byU.get(opts.hostKey);
      const hostBots = host && host.e === opts.e && host.bots && typeof host.bots === 'object' ? host.bots : {};
      for (const p of peers) {
        if (p.me || p.e !== opts.e) continue;
        (Array.isArray(p.fx) ? p.fx : []).forEach((f) => {
          if (f && f.e === opts.e && typeof f.id === 'string' && POWER_KINDS.includes(f.k) && !seenFx.has(f.id)) {
            spawnFx({ id: f.id, k: f.k, o: String(f.o || ''), t: String(f.t || ''), x: +f.x || 0, y: +f.y || 0, e: f.e });
          }
        });
        (Array.isArray(p.h) ? p.h : []).forEach((id) => { if (fx.has(id)) removeFx(id); });
      }
      for (const [k, v] of visuals) {
        if (runners.has(k)) continue;
        const src = v.p.b ? hostBots[k] : (() => { const p = byU.get(k); return p && p.e === opts.e ? p : null; })();
        if (!src) continue;
        if (!v.seen) { v.x = +src.x || v.x; v.y = +src.y || v.y; }
        v.seen = true;
        v.tx = +src.x; v.ty = +src.y; v.vx = +src.vx || 0; v.vy = +src.vy || 0;
        v.f = src.f < 0 ? -1 : 1; v.st = String(src.st || 'run'); v.prog = Math.max(0, Math.min(1, +src.prog || 0)); v.ft = +src.ft || 0;
        v.status = { frozen: !!src.fz, slow: !!src.sl, shield: !!src.sh, boost: !!src.bo, dead: !!src.dd };
        if (v.ft && !firstFinishAt) firstFinishAt = raceT;
      }
    }

    function snapshot(r) {
      return {
        x: +r.x.toFixed(2), y: +r.y.toFixed(2), vx: +r.vx.toFixed(1), vy: +r.vy.toFixed(1), f: r.facing, st: stateOf(r),
        prog: +r.progress(world).toFixed(3), ft: r.ft || 0,
        fz: raceT < r.frozenUntil ? 1 : 0, sl: raceT < r.slowUntil ? 1 : 0, sh: raceT < r.shieldUntil ? 1 : 0, bo: raceT < r.boostUntil ? 1 : 0, dd: r.dead ? 1 : 0,
      };
    }

    function netOut(now) {
      if (opts.solo || now - lastNet < 0.05) return;
      lastNet = now;
      const patch = me.runner ? snapshot(me.runner) : {};
      if (opts.isHost) {
        const bots = {};
        for (const r of runners.values()) if (r.bot) bots[r.key] = snapshot(r);
        patch.bots = bots;
      }
      Net.set(patch);
    }

    function stateOf(r) {
      if (r.finished) return 'cheer';
      if (raceT < r.stunUntil || raceT < r.frozenUntil) return 'stun';
      if (!r.onGround) return r.vy > 0 ? 'jump' : 'fall';
      return Math.abs(r.vx) > 0.4 ? 'run' : 'idle';
    }

    // ---- Race end (host) --------------------------------------------------------------
    function standings() {
      return opts.roster.map((p) => {
        const r = runners.get(p.k), v = visuals.get(p.k);
        return { k: p.k, ft: r ? r.ft : v.ft, prog: r ? r.progress(world) : v.prog, present: !!(r || v.seen) };
      }).sort((a, b) => (a.ft && b.ft ? a.ft - b.ft : a.ft ? -1 : b.ft ? 1 : b.prog - a.prog));
    }

    function hostTick() {
      if (!opts.isHost || resultSent || !started) return;
      const st = standings().filter((s) => s.present);
      if (st.some((s) => s.ft) && !firstFinishAt) firstFinishAt = raceT;
      const allIn = st.every((s) => s.ft);
      if (!(allIn || (firstFinishAt && raceT - firstFinishAt > FINISH_GRACE) || raceT > MAX_RACE)) return;
      resultSent = true;
      const res = { e: opts.e, order: standings().map((s) => s.k), ft: Object.fromEntries(standings().map((s) => [s.k, Math.round(s.ft * 1000)])), coins: {} };
      for (const r of runners.values()) res.coins[r.key] = r.coins;
      opts.onRaceOver(res);
    }

    // ---- Main update ----------------------------------------------------------------------
    view.update = (dt, now) => {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 5) {
        acc -= STEP; steps++;
        raceT += STEP;
        if (!started && raceT >= 0) { started = true; window.Sound.play('go'); hud.go(); }
        const canMove = started && !over;
        const others = allPositions();
        for (const e of world.enemies) { const p = Sim.enemyPos(e, Math.max(0, raceT)); e.hx = p.x; e.hy = p.y + (e.kind === 'walker' ? 0.35 : 0); e.dir = p.dir; }
        for (const r of runners.values()) {
          const inp = r.me ? readInput(canMove) : brains.get(r.key).think(world, raceT, others);
          r.step(world, raceT, STEP, inp, canMove);
          if (canMove && !r.dead && !r.finished) {
            if (inp.power) usePower(r, inp.power);
            pickups(r);
            enemies(r);
            if (r.x >= world.finishX) {
              r.finished = true; r.ft = raceT; r.vx *= 0.5;
              if (!firstFinishAt) firstFinishAt = raceT;
              if (r.me) { window.Sound.play('finish'); opts.onFinished(Math.round(raceT * 1000)); }
              puff(r.x, r.y + 1, 0, 0xffd23f, 16, 4);
            }
          }
          for (const ev of r.events.splice(0)) {
            if (!r.me) continue;
            if (ev === 'jump' || ev === 'double' || ev === 'land' || ev === 'respawn') window.Sound.play(ev);
            if (ev.startsWith('hit')) { window.Sound.play('hit'); shake = Math.max(shake, 0.5); hud.flash(ev === 'hit-ice' ? 'Frozen!' : ev === 'hit-slime' ? 'Slimed!' : 'Ouch!'); }
            if (ev === 'blocked') { window.Sound.play('box'); hud.flash('Shield blocked it!'); }
            if (ev === 'fall') shake = Math.max(shake, 0.35);
          }
        }
        updateFx(STEP);
        hostTick();
      }
      if (!started) hud.countdown(Math.ceil(-raceT));
      netIn();
      netOut(now);

      // Visuals.
      for (const [k, v] of visuals) {
        const r = runners.get(k);
        if (r) { v.x = r.x; v.y = r.y; v.f = r.facing; v.st = stateOf(r); v.vx = r.vx; v.prog = r.progress(world); v.ft = r.ft;
          v.status = { frozen: raceT < r.frozenUntil, slow: raceT < r.slowUntil, shield: raceT < r.shieldUntil, boost: raceT < r.boostUntil, dead: r.dead }; }
        else if (v.tx !== undefined) {
          const kk = 1 - Math.exp(-14 * dt);
          if (Math.abs(v.tx - v.x) > 6) { v.x = v.tx; v.y = v.ty; }
          v.x += (v.tx + v.vx * 0.05 - v.x) * kk; v.y += (v.ty - v.y) * kk;
        }
        const rig = v.rig;
        rig.root.visible = v.seen && !v.status.dead;
        rig.root.position.set(v.x, v.y, v.z);
        const face = v.f >= 0 ? -0.55 : Math.PI + 0.55;
        let dy = face - rig.root.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        rig.root.rotation.y += dy * Math.min(1, dt * 12);
        Chars3D.animate(rig, v.st, dt, Math.abs(v.vx));
        // Shadow on the ground below.
        let gy = -10;
        for (let c = Math.floor(v.x - 0.2); c <= Math.floor(v.x + 0.2); c++) { const s = world.surf(c); if (s != null && s <= v.y + 0.05) gy = Math.max(gy, s); }
        for (const p of world.plats) if (v.x > p.x1 && v.x < p.x2 && p.y <= v.y + 0.05) gy = Math.max(gy, p.y);
        v.shadow.visible = rig.root.visible && gy > -5;
        v.shadow.position.set(v.x, gy + 0.02, v.z);
        const hgt = Math.max(0, v.y - gy);
        v.shadow.scale.setScalar(Math.max(0.4, 1 - hgt * 0.15));
        v.ice.visible = rig.root.visible && v.status.frozen;
        v.ice.position.set(v.x, v.y + 0.55, v.z);
        v.shield.visible = rig.root.visible && v.status.shield;
        v.shield.position.set(v.x, v.y + 0.6, v.z);
        v.stars.visible = rig.root.visible && v.st === 'stun' && !v.status.frozen;
        v.stars.position.set(v.x, v.y + 1.45, v.z);
        v.stars.children.forEach((s, i) => { const a = now * 5 + (i * Math.PI * 2) / 3; s.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3); });
        if (v.status.boost && Math.random() < 0.6) puff(v.x - v.f * 0.3, v.y + 0.3 + Math.random() * 0.5, v.z, 0xffb040, 1, 1.5);
        if (v.status.slow && Math.random() < 0.3) puff(v.x, v.y + 0.1, v.z, 0x8af04a, 1, 1);
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.life -= dt;
        p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
        p.m.material.opacity = Math.max(0, p.life * 2);
        if (p.life <= 0) { scene.remove(p.m); p.m.material.dispose(); puffs.splice(i, 1); }
      }
      for (const e of world.enemies) {
        e.mesh.visible = raceT >= e.deadUntil;
        e.mesh.position.set(e.hx ?? 0, (e.hy ?? 0) - (e.kind === 'walker' ? 0.35 : 0), 0.1);
        e.mesh.rotation.y = e.dir > 0 ? Math.PI : 0;
      }
      World3D.animateWorld(world, now, camX);

      // Camera: follow me (or the leader when spectating), look ahead, gentle smoothing.
      const tgt = me.runner || [...runners.values()].sort((a, b) => b.x - a.x)[0] || { x: camX, y: camY, vx: 0, facing: 1 };
      const lead = Math.max(-1, Math.min(3.2, (tgt.vx || 0) * 0.45 + 1.4));
      const k = 1 - Math.exp(-4.5 * dt);
      camX += (tgt.x + lead - camX) * k;
      camY += (Math.max(2.2, tgt.y + 1.0) - camY) * (1 - Math.exp(-3 * dt));
      shake = Math.max(0, shake - dt * 1.8);
      const sh = shake * shake * 0.25;
      camera.position.set(camX + Math.sin(now * 37) * sh, camY + 2.6 + Math.sin(now * 41) * sh, 10.2);
      camera.lookAt(camX, camY - 0.2, 0);
      world.sun.position.set(camX + 6, 14, 10);
      world.sun.target.position.set(camX, 0, 0);

      // HUD.
      const ranks = opts.roster.map((p) => ({ ...p, prog: visuals.get(p.k).prog, ft: visuals.get(p.k).ft }))
        .sort((a, b) => (a.ft && b.ft ? a.ft - b.ft : a.ft ? -1 : b.ft ? 1 : b.prog - a.prog));
      const tags = [];
      ranks.forEach((p, i) => {
        const v = visuals.get(p.k);
        if (!v.rig.root.visible) return;
        const pos = new T.Vector3(v.x, v.y + 1.55, v.z).project(camera);
        if (pos.z < 1 && pos.x > -1.1 && pos.x < 1.1) tags.push({ k: p.k, rank: i + 1, x: (pos.x + 1) / 2, y: (1 - pos.y) / 2, me: p.k === opts.myKey });
      });
      hud.update({
        time: me.runner && me.runner.finished ? me.runner.ft : Math.max(0, raceT),
        ranks, tags, myKey: opts.myKey,
        powers: me.runner ? me.runner.powers : null,
        cooldown: me.runner ? Math.max(0, me.runner.powerCooldown - raceT) : 0,
        hurry: firstFinishAt && !over && me.runner && !me.runner.finished ? Math.ceil(FINISH_GRACE - (raceT - firstFinishAt)) : 0,
        status: me.runner ? visuals.get(opts.myKey).status : {},
      });
    };

    view.endRace = () => { over = true; if (me.runner && !me.runner.finished) { me.runner.finished = true; hud.flash('Time is up!'); } };
    view.dispose = () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
    view.myResultCoins = () => (me.runner ? me.runner.coins : 0);
    view.runners = runners;     // exposed for tests
    view.raceTime = () => raceT;
    view.world = world;
    run(view);
    resize();
    return view;
  }

  return { start, showcase, run, stop, getRenderer, setQuality, resize, POWER_KINDS, active: () => active };
})();
