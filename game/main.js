// Coin Hopper: an online platform race for up to four players, built on Phaser 4.
// Every race runs on a freshly generated course (levelgen.js). Players see each other live
// through net.js; each client simulates only its own runner and trusts the others' positions.

(function () {
  const TILE = 32;
  const VIEW_W = 800;
  const VIEW_H = 448;
  const S = 0.5;               // art is drawn at 2x, shown at half size

  // Movement (pixels, seconds).
  const RUN_SPEED = 220;
  const GROUND_ACCEL = 14, GROUND_DECEL = 20, TURN_RATE = 26, AIR_ACCEL = 8, AIR_DECEL = 5;
  const GRAVITY = 1400, JUMP_VELOCITY = 560, FALL_EXTRA_GRAVITY = 900, MAX_FALL = 900;
  const APEX_THRESHOLD = 0.35, APEX_GRAVITY = 0.5, JUMP_CUT = 0.5;
  const COYOTE_MS = 100, BUFFER_MS = 120, STOMP_BOUNCE = 420;
  const SPEED_BOOST = 1.6;

  // Camera and shake.
  const CAM_DEADZONE_X = 24, CAM_DEADZONE_Y = 40, CAM_LOOK_AHEAD = 110, CAM_LEAD_RATE = 2.5;
  const CAM_FOLLOW_RATE = 7, CAM_FOLLOW_RATE_FALLING = 12;
  const SHAKE_STRENGTH = 1, SHAKE_MAX_OFFSET = 9, SHAKE_MAX_ROLL = 0.012, SHAKE_DECAY = 1.6;

  // Powers.
  const FIRE_SPEED = 470, FIRE_LIFE = 2200, SLIME_LIFE = 15000;
  const STUN_FIRE = 1300, STUN_SLIME = 1000, STUN_BOLT = 1600, STUN_ENEMY = 800, SPEED_MS = 3000;
  const INVULN_MS = 1300;
  const COINS_FOR_POWER = 5;

  const COLORS = [
    { tex: 'player-blue', hex: '#4f86da', num: 0x4f86da },
    { tex: 'player-green', hex: '#4cbf5a', num: 0x4cbf5a },
    { tex: 'player-pink', hex: '#e8559a', num: 0xe8559a },
    { tex: 'player-gold', hex: '#f2c230', num: 0xf2c230 },
  ];
  const POWERS = {
    fire: { icon: 'fireball', label: 'Fireball' },
    slime: { icon: 'slime', label: 'Slime trap' },
    bolt: { icon: 'bolt', label: 'Lightning' },
    speed: { icon: 'speed', label: 'Speed boost' },
  };
  const HUD_STYLE = { fontFamily: 'Fredoka, Trebuchet MS, sans-serif', fontSize: '18px', color: '#ffffff', stroke: '#1b1f3b', strokeThickness: 5 };

  // ---------------------------------------------------------------------------
  // App state and the menu cards
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const App = {
    online: false,
    mode: 'menu',          // menu | room | race | results
    solo: false,
    code: null,
    joinedAt: 0,
    joinedLocal: 0,
    startedEpoch: 0,
    epoch: 0,
    seed: 0,
    finishTime: 0,
    raceStartedAt: 0,
    uid: Math.random().toString(36).slice(2, 8),
  };

  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };

  function myName() {
    const v = ($('name').value || '').trim().slice(0, 12);
    return v || 'Player';
  }

  function showPanel(id) {
    ['panel-menu', 'panel-room', 'panel-results'].forEach((p) => { $(p).hidden = p !== id; });
    $('leave-race').hidden = !(App.mode === 'race');
  }

  // Racers in my room: the first four by join time, coloured in that order. Host = first.
  function roomState() {
    const all = Net.peers().filter((p) => p.j);
    all.sort((a, b) => a.j - b.j || (a.peer < b.peer ? -1 : 1));
    const racers = all.slice(0, 4).map((p, i) => ({ ...p, color: i }));
    const me = racers.find((p) => p.me);
    return { racers, host: racers[0], me, full: !me && all.some((p) => p.me) };
  }

  function myColor() {
    if (App.solo || !Net.inRoom()) return 0;
    const st = roomState();
    return st.me ? st.me.color : 0;
  }

  function renderRoom() {
    const st = roomState();
    $('room-code').textContent = App.code || '';
    const ul = $('room-players');
    ul.replaceChildren();
    st.racers.forEach((p) => {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = COLORS[p.color].hex;
      const name = document.createElement('span');
      name.textContent = (p.n || 'Player') + (p.me ? ' (you)' : '');
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = p === st.host ? 'host' : p.st === 'race' ? 'racing' : 'ready';
      li.append(dot, name, pill);
      ul.append(li);
    });
    const isHost = st.host && st.host.me;
    $('btn-start').hidden = !isHost;
    const racing = st.racers.some((p) => !p.me && p.st === 'race' && p.e === App.startedEpoch && App.startedEpoch > 0);
    if (!Net.connected()) $('room-msg').textContent = 'Connecting to the room…';
    else if (isHost) $('room-msg').textContent = st.racers.length < 2 ? 'Waiting for friends to join. You can also start alone.' : `${st.racers.length} players ready. Start when everyone is in.`;
    else $('room-msg').textContent = racing ? 'A race is running. You will join the next one.' : 'Waiting for the host to start the race…';
  }

  function raceRanking() {
    if (App.solo) return [{ n: myName(), color: 0, ft: App.finishTime, prog: 1, me: true }];
    const st = roomState();
    const inRace = st.racers.filter((p) => p.e === App.epoch && (p.st === 'race' || p.st === 'fin'));
    if (!inRace.some((p) => p.me)) inRace.push({ ...st.me, n: myName(), ft: App.finishTime, prog: 1, me: true, color: myColor() });
    return inRace.sort((a, b) => {
      const af = a.ft || 0, bf = b.ft || 0;
      if (af && bf) return af - bf;
      if (af) return -1;
      if (bf) return 1;
      return (b.prog || 0) - (a.prog || 0);
    });
  }

  function fmtTime(ms) {
    const s = ms / 1000;
    return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
  }

  function renderResults() {
    const list = raceRanking();
    const ul = $('results-list');
    ul.replaceChildren();
    list.forEach((p, i) => {
      const li = document.createElement('li');
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = p.ft ? String(i + 1) : '–';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = COLORS[p.color ?? 0].hex;
      const name = document.createElement('span');
      name.textContent = (p.n || 'Player') + (p.me ? ' (you)' : '');
      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = p.ft ? fmtTime(p.ft) : `running · ${Math.round((p.prog || 0) * 100)}%`;
      li.append(rank, dot, name, time);
      ul.append(li);
    });
    const myRank = list.findIndex((p) => p.me) + 1;
    if (App.solo) {
      $('results-title').textContent = 'Course complete!';
      $('results-msg').textContent = 'Every race builds a new course.';
      $('btn-next').textContent = 'Race again · new map';
      $('btn-next').hidden = false;
      return;
    }
    const allDone = list.every((p) => p.ft);
    $('results-title').textContent = myRank === 1 && list.length > 1 ? 'You won! 🏆' : `You finished #${myRank}`;
    const st = roomState();
    const isHost = st.host && st.host.me;
    $('btn-next').textContent = 'Next race · new map';
    $('btn-next').hidden = !isHost;
    $('results-msg').textContent = isHost
      ? (allDone ? 'Everyone is in. Start the next race when you are ready.' : 'Others are still running. You can start the next race at any time.')
      : (allDone ? 'Waiting for the host to start the next race…' : 'Waiting for the others to finish…');
  }

  // ---- Menu actions -----------------------------------------------------------
  function randomCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += letters[Math.floor(Math.random() * letters.length)];
    return s;
  }

  async function enterRoom(code) {
    storage.set('ch-name', myName());
    App.code = code.toUpperCase();
    App.solo = false;
    App.mode = 'room';
    App.startedEpoch = 0;
    showPanel('panel-room');
    $('room-code').textContent = App.code;
    $('room-msg').textContent = 'Joining…';
    try {
      await Net.join(App.code.toLowerCase());
    } catch (e) {
      App.mode = 'menu';
      showPanel('panel-menu');
      $('online-note').textContent = 'Could not join that room. Check the code and try again.';
      $('online-note').classList.add('warn');
      return;
    }
    App.joinedAt = Date.now();
    App.joinedLocal = performance.now();
    Net.set({ n: myName(), j: App.joinedAt, st: 'room', e: 0 });
    renderRoom();
  }

  async function leaveRoom() {
    stopRace();
    await Net.leave();
    App.mode = 'menu';
    App.code = null;
    showPanel('panel-menu');
  }

  function hostStartRace() {
    const st = roomState();
    let maxE = App.startedEpoch;
    st.racers.forEach((p) => { if (p.race && p.race.e > maxE) maxE = p.race.e; });
    const race = { e: maxE + 1, s: Math.floor(Math.random() * 1e9) };
    Net.set({ race });
    beginRace(race.s, race.e);
  }

  function beginRace(seed, epoch) {
    App.startedEpoch = Math.max(App.startedEpoch, epoch);
    App.epoch = epoch;
    App.seed = seed;
    App.finishTime = 0;
    App.mode = 'race';
    showPanel(null);
    $('leave-race').hidden = false;
    if (!App.solo) Net.set({ st: 'race', e: epoch, ft: 0, prog: 0, fx: [], h: [] });
    const game = window.game;
    game.scene.stop('backdrop');
    game.scene.stop('race');
    game.scene.start('race', { seed, epoch, solo: App.solo });
    $('screen').focus();
  }

  function stopRace() {
    const game = window.game;
    if (!game) return;
    game.scene.stop('race');
    if (!game.scene.isActive('backdrop')) game.scene.start('backdrop');
    $('leave-race').hidden = true;
  }

  function onFinished(ms) {
    App.finishTime = ms;
    App.mode = 'results';
    if (!App.solo) Net.set({ st: 'fin', ft: ms, prog: 1 });
    showPanel('panel-results');
    renderResults();
  }

  // React to the room: host race starts, players joining or leaving.
  function onNet() {
    if (!Net.inRoom()) return;
    const st = roomState();
    if (st.full) {
      leaveRoom().then(() => {
        $('online-note').textContent = 'That room already has 4 players.';
        $('online-note').classList.add('warn');
      });
      return;
    }
    const hostRace = st.host && st.host.race;
    if (hostRace && hostRace.e > App.startedEpoch) {
      const justJoined = performance.now() - App.joinedLocal < 1500;
      if (justJoined && st.host.st !== 'room') {
        App.startedEpoch = hostRace.e;   // a race was already running when we arrived
      } else if (App.mode === 'room' || App.mode === 'results' || App.mode === 'race') {
        beginRace(hostRace.s, hostRace.e);
        return;
      }
    }
    if (App.mode === 'room') renderRoom();
    if (App.mode === 'results') renderResults();
  }

  function wireMenu() {
    $('name').value = storage.get('ch-name') || '';
    $('btn-solo').addEventListener('click', () => {
      storage.set('ch-name', myName());
      App.solo = true;
      beginRace(Math.floor(Math.random() * 1e9), 1);
    });
    $('btn-create').addEventListener('click', () => enterRoom(randomCode()));
    $('btn-join').addEventListener('click', () => {
      const code = ($('code').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length < 4) { $('code').focus(); return; }
      enterRoom(code);
    });
    $('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
    $('btn-start').addEventListener('click', hostStartRace);
    $('btn-leave').addEventListener('click', leaveRoom);
    $('btn-leave2').addEventListener('click', () => (App.solo ? backToMenu() : leaveRoom()));
    $('leave-race').addEventListener('click', () => (App.solo ? backToMenu() : leaveRoom()));
    $('btn-next').addEventListener('click', () => {
      if (App.solo) beginRace(Math.floor(Math.random() * 1e9), App.epoch + 1);
      else hostStartRace();
    });
    Net.onChange(onNet);
    setInterval(() => { if (App.mode === 'results') renderResults(); if (App.mode === 'room') renderRoom(); }, 700);


    setOnline(false, 'Connecting…');
    Net.init().then((ok) => {
      App.online = ok;
      setOnline(ok, ok
        ? 'Friends open this same page, type the code and press Join.'
        : 'Online play works when this page is opened on claude.ai while signed in. Solo races work anywhere.');
    });
  }

  function setOnline(ok, msg) {
    $('btn-create').disabled = !ok;
    $('btn-join').disabled = !ok;
    $('code').disabled = !ok;
    $('online-note').textContent = msg;
    $('online-note').classList.remove('warn');
  }

  function backToMenu() {
    stopRace();
    App.mode = 'menu';
    App.solo = false;
    showPanel('panel-menu');
  }

  // ---------------------------------------------------------------------------
  // Scenes
  // ---------------------------------------------------------------------------
  class BootScene extends Phaser.Scene {
    constructor() { super('boot'); }
    create() {
      const entries = Object.entries(window.ART);
      let left = entries.length;
      entries.forEach(([key, a]) => {
        const img = new Image();
        img.onload = () => {
          this.textures.addImage(key, img);
          if (--left === 0) this.scene.start('backdrop');
        };
        img.onerror = () => { if (--left === 0) this.scene.start('backdrop'); };
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(a.svg)));
      });
    }
  }

  // The scene behind the menu cards: the four heroes on a strip of grass.
  class BackdropScene extends Phaser.Scene {
    constructor() { super('backdrop'); }
    create() {
      this.cameras.main.setBackgroundColor('#7ec8f0');
      const sky = this.add.graphics();
      sky.fillGradientStyle(0x5fb4ec, 0x5fb4ec, 0xd3effc, 0xd3effc, 1);
      sky.fillRect(0, 0, VIEW_W, VIEW_H);
      [[120, 70], [470, 50], [700, 110]].forEach(([x, y], i) => {
        const c = this.add.image(x, y, 'cloud').setScale(S).setAlpha(0.95);
        this.tweens.add({ targets: c, x: x + 30, duration: 6000 + i * 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      });
      for (let x = 0; x < VIEW_W; x += TILE) {
        this.add.image(x + 16, VIEW_H - 48, 'grass').setScale(S);
        this.add.image(x + 16, VIEW_H - 16, 'dirt').setScale(S);
      }
      COLORS.forEach((c, i) => {
        const hero = this.add.image(250 + i * 100, VIEW_H - 64, c.tex).setScale(S).setOrigin(0.5, 1);
        this.tweens.add({ targets: hero, y: hero.y - 26, duration: 380, yoyo: true, repeat: -1, delay: i * 180, ease: 'Quad.easeOut', hold: 60, repeatDelay: 700 });
      });
    }
  }

  class RaceScene extends Phaser.Scene {
    constructor() { super('race'); }

    init(data) {
      this.seed = data.seed;
      this.epoch = data.epoch;
      this.solo = data.solo;
      this.level = window.LevelGen.generate(this.seed);
      this.raceStart = 0;           // set at GO
      this.started = false;
      this.finished = false;
      this.jumpsUsed = 0;
      this.lastGround = -Infinity;
      this.lastPress = -Infinity;
      this.wasOnGround = false;
      this.fallSpeed = 0;
      this.trauma = 0;
      this.shakeTime = 0;
      this.spinning = false;
      this.touchWas = { jump: false, power: false };
      this.stunUntil = 0;
      this.invulnUntil = 0;
      this.speedUntil = 0;
      this.power = null;
      this.coins = 0;
      this.respawning = false;
      this.myFx = [];
      this.myHits = [];
      this.seenFx = new Set();
      this.fx = new Map();          // id -> live projectile or trap
      this.remotes = new Map();     // peer -> {img, label, stars}
      this.lastNetSend = 0;
    }

    create() {
      const lv = this.level;
      this.worldW = lv.width * TILE;
      this.worldH = lv.rows * TILE;
      this.cameras.main.setBackgroundColor('#7ec8f0');
      this.drawBackground();
      this.buildCourse();

      // My runner: an invisible physics body with the art drawn on top of it.
      const start = lv.objects.find((o) => o.type === 'start');
      this.startX = start.c * TILE + 16;
      this.pb = this.add.zone(this.startX, start.r * TILE + 2, 18, 28);
      this.physics.add.existing(this.pb);
      this.body = this.pb.body;
      this.body.setCollideWorldBounds(true);
      this.body.setMaxVelocity(RUN_SPEED * SPEED_BOOST * 1.4, MAX_FALL);
      this.physics.world.setBounds(0, -200, this.worldW, this.worldH + 600);
      this.physics.world.setBoundsCollision(true, true, false, false);
      this.physics.add.collider(this.pb, this.solids);
      this.physics.add.collider(this.pb, this.platforms);
      this.color = myColor();
      this.hero = this.add.image(this.startX, 0, COLORS[this.color].tex).setScale(S).setOrigin(0.5, 1).setDepth(5);
      this.lastSafe = { x: this.pb.x, y: this.pb.y };

      this.keys = this.input.keyboard.addKeys({
        left: 'LEFT', right: 'RIGHT', up: 'UP', a: 'A', d: 'D', w: 'W', space: 'SPACE', x: 'X', shift: 'SHIFT', e: 'E',
      }, false);
      // While a race runs, stop arrows and space from scrolling the page. Released when the
      // race scene stops, so the name and code fields in the menu still take typing.
      this.input.keyboard.addCapture('LEFT,RIGHT,UP,DOWN,SPACE');
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard.clearCaptures());

      this.camFocus = { x: this.pb.x, y: this.pb.y };
      this.camLead = 0;
      this.camPos = { x: this.pb.x, y: this.pb.y };
      this.applyCamera();
      this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.updateCamera, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.updateCamera, this));

      this.buildHud();
      this.countdown();
    }

    // ---- Course ---------------------------------------------------------------
    drawBackground() {
      const sky = this.add.graphics().setScrollFactor(0).setDepth(-10);
      sky.fillGradientStyle(0x5fb4ec, 0x5fb4ec, 0xd3effc, 0xd3effc, 1);
      sky.fillRect(0, 0, VIEW_W, VIEW_H);
      for (let x = 60; x < this.worldW * 0.35 + VIEW_W; x += 260) {
        this.add.image(x, 50 + ((x / 260) % 3) * 34, 'cloud').setScale(S).setScrollFactor(0.3).setAlpha(0.9).setDepth(-9);
      }
      const hills = this.add.graphics().setScrollFactor(0.5).setDepth(-8);
      hills.fillStyle(0x9ad7a0, 1);
      for (let x = 0; x < this.worldW * 0.5 + VIEW_W; x += 240) hills.fillCircle(x, this.worldH + 50, 170);
      hills.fillStyle(0x7cc489, 1);
      for (let x = 120; x < this.worldW * 0.5 + VIEW_W; x += 300) hills.fillCircle(x, this.worldH + 90, 150);
    }

    buildCourse() {
      const lv = this.level;
      this.solids = this.physics.add.staticGroup();
      this.platforms = this.physics.add.staticGroup();
      // Ground visuals per column; one physics body per run of equal-height columns.
      let runStart = 0;
      for (let c = 0; c <= lv.cols.length; c++) {
        const col = lv.cols[c];
        if (col && col.top != null) {
          this.add.image(c * TILE + 16, col.top * TILE + 16, 'grass').setScale(S);
          for (let r = col.top + 1; r < lv.rows; r++) this.add.image(c * TILE + 16, r * TILE + 16, 'dirt').setScale(S);
        }
        const prev = lv.cols[runStart];
        if (c === lv.cols.length || !col || !prev || col.top !== prev.top) {
          if (prev && prev.top != null && c > runStart) {
            const w = (c - runStart) * TILE;
            const h = (lv.rows - prev.top) * TILE + 200;
            const z = this.add.zone(runStart * TILE + w / 2, prev.top * TILE + h / 2, w, h);
            this.physics.add.existing(z, true);
            this.solids.add(z);
          }
          runStart = c;
        }
      }
      this.coinObjs = [];
      this.boxes = [];
      this.enemies = [];
      for (const o of lv.objects) {
        const x = o.c * TILE + 16;
        const y = o.r * TILE + 16;
        if (o.type === 'plat') {
          for (let i = 0; i < o.len; i++) this.add.image(o.c * TILE + i * TILE + 16, o.r * TILE + 6.5, 'plank').setScale(S);
          const z = this.add.zone(o.c * TILE + (o.len * TILE) / 2, o.r * TILE + 5, o.len * TILE, 10);
          this.physics.add.existing(z, true);
          z.body.checkCollision.down = false;
          z.body.checkCollision.left = false;
          z.body.checkCollision.right = false;
          this.platforms.add(z);
        } else if (o.type === 'coin') {
          const img = this.add.image(x, y, 'coin').setScale(S);
          this.tweens.add({ targets: img, y: y - 4, duration: 700 + (o.c % 3) * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          this.coinObjs.push({ img, x, y, taken: false });
        } else if (o.type === 'box') {
          const img = this.add.image(x, y, 'box').setScale(S);
          this.tweens.add({ targets: img, scale: S * 1.1, angle: 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          this.boxes.push({ img, x, y, backAt: 0 });
        } else if (o.type === 'walker') {
          const img = this.add.image(x, (o.r + 1) * TILE, 'enemy').setScale(S).setOrigin(0.5, 1).setDepth(3);
          this.enemies.push({ kind: 'walker', img, L: o.left * TILE + 16, R: o.right * TILE + 16, baseY: (o.r + 1) * TILE, deadUntil: 0, w: 26, h: 20 });
        } else if (o.type === 'flyer') {
          const img = this.add.image(x, y, 'flyer').setScale(S).setDepth(3);
          this.enemies.push({ kind: 'flyer', img, cx: x, cy: y, deadUntil: 0, w: 26, h: 18 });
        } else if (o.type === 'flag') {
          this.flagX = x;
          this.add.image(x, (o.r + 1) * TILE, 'flag').setScale(S).setOrigin(0.5, 1).setDepth(2);
        }
      }
    }

    colTop(c) {
      const col = this.level.cols[c];
      return col ? col.top : null;
    }

    isSolidAt(px, py) {
      const t = this.colTop(Math.floor(px / TILE));
      return t != null && py >= t * TILE;
    }

    groundYBelow(px, py) {
      const t = this.colTop(Math.floor(px / TILE));
      if (t != null && t * TILE >= py - 4) return t * TILE;
      return null;
    }

    // ---- HUD ------------------------------------------------------------------
    buildHud() {
      const d = 20;
      this.hud = {};
      this.hud.timer = this.add.text(16, 10, '0:00.00', HUD_STYLE).setScrollFactor(0).setDepth(d);
      // Progress track along the top.
      const trackX = 200, trackW = 400, trackY = 22;
      this.hud.track = { x: trackX, w: trackW, y: trackY };
      const g = this.add.graphics().setScrollFactor(0).setDepth(d);
      g.fillStyle(0x1b1f3b, 0.55).fillRoundedRect(trackX - 8, trackY - 7, trackW + 16, 14, 7);
      g.fillStyle(0xffffff, 0.8).fillRoundedRect(trackX, trackY - 2, trackW, 4, 2);
      this.add.image(trackX + trackW + 14, trackY - 2, 'flag').setScale(0.22).setScrollFactor(0).setDepth(d);
      this.hud.dots = this.add.graphics().setScrollFactor(0).setDepth(d + 1);
      // Power slot.
      const slotX = VIEW_W - 46, slotY = 34;
      const slot = this.add.graphics().setScrollFactor(0).setDepth(d);
      slot.fillStyle(0x1b1f3b, 0.6).fillRoundedRect(slotX - 26, slotY - 26, 52, 52, 12);
      slot.lineStyle(2, 0xffffff, 0.7).strokeRoundedRect(slotX - 26, slotY - 26, 52, 52, 12);
      this.hud.slot = { x: slotX, y: slotY };
      this.hud.powerIcon = this.add.image(slotX, slotY, 'box').setScale(0.4).setScrollFactor(0).setDepth(d + 1).setAlpha(0);
      this.hud.powerKey = this.add.text(slotX, slotY + 32, 'X', { ...HUD_STYLE, fontSize: '13px', strokeThickness: 4 }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(d + 1).setAlpha(0);
      this.hud.coinPips = this.add.graphics().setScrollFactor(0).setDepth(d);
      this.hud.coinIcon = this.add.image(slotX - 120, slotY + 20, 'coin').setScale(0.4).setScrollFactor(0).setDepth(d);
      this.hud.msg = this.add.text(VIEW_W / 2, 120, '', { ...HUD_STYLE, fontSize: '26px' }).setOrigin(0.5).setScrollFactor(0).setDepth(d + 2).setAlpha(0);
      this.drawCoinPips();
    }

    drawCoinPips() {
      const g = this.hud.coinPips;
      const x0 = this.hud.slot.x - 106, y = this.hud.slot.y + 20;
      g.clear();
      for (let i = 0; i < COINS_FOR_POWER; i++) {
        g.fillStyle(i < this.coins ? 0xffcc33 : 0x1b1f3b, i < this.coins ? 1 : 0.45);
        g.fillCircle(x0 + i * 12, y, 4.5);
      }
    }

    flashMsg(text, color = '#ffffff') {
      const m = this.hud.msg;
      m.setText(text).setColor(color).setAlpha(1).setScale(1.2);
      this.tweens.killTweensOf(m);
      this.tweens.add({ targets: m, scale: 1, duration: 200, ease: 'Back.easeOut' });
      this.tweens.add({ targets: m, alpha: 0, delay: 900, duration: 400 });
    }

    updateHud(now) {
      const t = this.started ? (this.finished ? App.finishTime : now - this.raceStart) : 0;
      this.hud.timer.setText(fmtTime(Math.max(0, t)));
      const { x, w, y } = this.hud.track;
      const g = this.hud.dots;
      g.clear();
      for (const r of this.remotes.values()) {
        if (!r.visible) continue;
        g.fillStyle(COLORS[r.color].num, 1).lineStyle(2, 0x1b1f3b, 1);
        g.fillCircle(x + w * r.prog, y, 6).strokeCircle(x + w * r.prog, y, 6);
      }
      g.fillStyle(COLORS[this.color].num, 1).lineStyle(2.5, 0xffffff, 1);
      g.fillCircle(x + w * this.progress(), y, 7.5).strokeCircle(x + w * this.progress(), y, 7.5);
    }

    progress() {
      return Phaser.Math.Clamp((this.pb.x - this.startX) / (this.flagX - this.startX), 0, 1);
    }

    countdown() {
      const big = { ...HUD_STYLE, fontSize: '72px', strokeThickness: 10 };
      const txt = this.add.text(VIEW_W / 2, VIEW_H / 2 - 30, '3', big).setOrigin(0.5).setScrollFactor(0).setDepth(30);
      const steps = ['3', '2', '1', 'GO!'];
      steps.forEach((s, i) => {
        this.time.delayedCall(i * 800, () => {
          txt.setText(s).setScale(1.6).setAlpha(1).setColor(s === 'GO!' ? '#ffd43b' : '#ffffff');
          this.tweens.add({ targets: txt, scale: 1, duration: 300, ease: 'Back.easeOut' });
          if (s === 'GO!') {
            this.started = true;
            this.raceStart = this.time.now;
            App.raceStartedAt = Date.now();
            this.tweens.add({ targets: txt, alpha: 0, delay: 500, duration: 300, onComplete: () => txt.destroy() });
          }
        });
      });
    }

    // ---- Main loop ------------------------------------------------------------
    update(time, delta) {
      const dt = Math.min(delta, 50) / 1000;
      const tRace = this.started ? time - this.raceStart : 0;
      this.updateEnemies(tRace, time);
      this.updateRemotes(dt, time);
      this.updateFx(dt, time);
      if (!this.finished) this.updatePlayer(time, dt);
      this.syncHero();
      this.updateHud(time);
      this.sendNet(time);
    }

    updatePlayer(time, dt) {
      const body = this.body;
      if (!this.respawning && this.pb.y > this.worldH + 40) { this.respawn(); return; }
      if (this.respawning) return;

      const k = this.keys;
      const touch = window.touchInput || {};
      const stunned = time < this.stunUntil;
      const canMove = this.started && !stunned;
      const onGround = body.blocked.down || body.touching.down;
      if (onGround && body.velocity.y >= 0) {
        this.lastGround = time;
        this.jumpsUsed = 0;
        // Remember solid ground (not a platform) to respawn on after a fall.
        const t = this.colTop(Math.floor(this.pb.x / TILE));
        if (t != null && Math.abs(body.bottom - t * TILE) < 3) {
          const l = this.colTop(Math.floor((this.pb.x - 20) / TILE));
          const r = this.colTop(Math.floor((this.pb.x + 20) / TILE));
          if (l === t && r === t) this.lastSafe = { x: this.pb.x, y: this.pb.y };
        }
      }

      if (onGround && !this.wasOnGround && this.fallSpeed > 150) {
        const amount = Phaser.Math.Clamp((this.fallSpeed - 150) / 700, 0, 1);
        this.squash(1 + 0.3 * amount, 1 - 0.25 * amount, 180);
        this.spawnDust(this.pb.x, body.bottom, 2 + Math.round(amount * 4));
      }
      this.wasOnGround = onGround;
      if (!onGround) this.fallSpeed = Math.max(0, body.velocity.y);

      // Run.
      const dir = canMove ? ((k.right.isDown || k.d.isDown || touch.right) ? 1 : 0) - ((k.left.isDown || k.a.isDown || touch.left) ? 1 : 0) : 0;
      const top = RUN_SPEED * (time < this.speedUntil ? SPEED_BOOST : 1);
      const vx = body.velocity.x;
      let rate;
      if (stunned) rate = onGround ? 4 : 1.5;
      else if (dir === 0) rate = onGround ? GROUND_DECEL : AIR_DECEL;
      else if (vx !== 0 && Math.sign(vx) !== dir) rate = onGround ? TURN_RATE : AIR_ACCEL * 1.5;
      else rate = onGround ? GROUND_ACCEL : AIR_ACCEL;
      let newVx = vx + (dir * top - vx) * (1 - Math.exp(-rate * dt));
      if (dir === 0 && Math.abs(newVx) < 5) newVx = 0;
      body.setVelocityX(newVx);
      if (dir !== 0) this.hero.setFlipX(dir < 0);

      // Jump, double jump, coyote time and buffering.
      const tJump = !!touch.jump;
      const touchPressed = tJump && !this.touchWas.jump;
      const touchReleased = !tJump && this.touchWas.jump;
      this.touchWas.jump = tJump;
      const JD = Phaser.Input.Keyboard.JustDown, JU = Phaser.Input.Keyboard.JustUp;
      const pressed = canMove && (JD(k.up) || JD(k.w) || JD(k.space) || touchPressed);
      const released = JU(k.up) || JU(k.w) || JU(k.space) || touchReleased;
      const held = k.up.isDown || k.w.isDown || k.space.isDown || tJump;
      if (pressed) {
        if (this.jumpsUsed === 0 && time - this.lastGround <= COYOTE_MS) { this.jumpsUsed = 1; this.jump(false); }
        else if (this.jumpsUsed < 2) { this.jumpsUsed = 2; this.jump(true); }
        else this.lastPress = time;
      } else if (canMove && onGround && body.velocity.y >= 0 && time - this.lastPress <= BUFFER_MS) {
        this.jumpsUsed = 1;
        this.jump(false);
        if (!held) body.setVelocityY(body.velocity.y * JUMP_CUT);
      }
      if (released && body.velocity.y < 0) body.setVelocityY(body.velocity.y * JUMP_CUT);
      const vy = body.velocity.y;
      if (vy > 0 && !(held && vy < JUMP_VELOCITY * APEX_THRESHOLD)) body.setGravityY(FALL_EXTRA_GRAVITY);
      else if (held && Math.abs(vy) < JUMP_VELOCITY * APEX_THRESHOLD) body.setGravityY(-GRAVITY * (1 - APEX_GRAVITY));
      else body.setGravityY(0);

      // Use a power.
      const tPow = !!touch.power;
      const powPressed = (JD(k.x) || JD(k.shift) || JD(k.e) || (tPow && !this.touchWas.power));
      this.touchWas.power = tPow;
      if (powPressed && canMove && this.power) this.usePower();

      this.checkPickups(time);
      this.checkEnemies(time);

      if (this.pb.x >= this.flagX - 6 && this.started) this.finish(time);
    }

    syncHero() {
      const h = this.hero;
      h.x = this.pb.x;
      h.y = this.body.bottom + 1;
      const now = this.time.now;
      if (!this.spinning) h.setAngle(this.body.velocity.x / RUN_SPEED * 4);
      const blink = now < this.invulnUntil && Math.floor(now / 90) % 2 === 0;
      h.setAlpha(this.respawning ? 0 : blink ? 0.35 : 1);
      if (now < this.stunUntil) h.setTint(0xb8c2ff); else h.clearTint();
      this.drawStars(this.myStars || (this.myStars = this.add.graphics().setDepth(6)), h.x, h.y - 36, now < this.stunUntil, now);
    }

    drawStars(g, x, y, on, now) {
      g.clear();
      if (!on) return;
      for (let i = 0; i < 3; i++) {
        const a = now / 180 + (i * Math.PI * 2) / 3;
        const sx = x + Math.cos(a) * 12, sy = y + Math.sin(a) * 4;
        g.fillStyle(0xffe14a, 1).lineStyle(1.5, 0x7a4a06, 1);
        g.fillCircle(sx, sy, 3.5).strokeCircle(sx, sy, 3.5);
      }
    }

    jump(isAir) {
      this.body.setVelocityY(-JUMP_VELOCITY);
      this.lastPress = -Infinity;
      this.squash(0.78, 1.25, 220);
      if (!isAir) this.spawnDust(this.pb.x, this.body.bottom, 3);
      else {
        this.spawnPuff(this.pb.x, this.body.bottom, 0xffffff, 6);
        this.spinning = true;
        this.tweens.add({ targets: this.hero, angle: this.hero.flipX ? -360 : 360, duration: 300, onComplete: () => { this.spinning = false; this.hero.setAngle(0); } });
      }
    }

    squash(sx, sy, duration) {
      this.tweens.killTweensOf(this.hero, ['scaleX', 'scaleY']);
      this.hero.setScale(S * sx, S * sy);
      this.tweens.add({ targets: this.hero, scaleX: S, scaleY: S, duration, ease: 'Back.easeOut' });
    }

    spawnPuff(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const p = this.add.circle(x, y, 4, color).setDepth(7);
        const a = (Math.PI * 2 * i) / count;
        this.tweens.add({ targets: p, x: x + Math.cos(a) * 18, y: y + Math.sin(a) * 18, alpha: 0, scale: 0.2, duration: 300, onComplete: () => p.destroy() });
      }
    }

    spawnDust(x, y, count) {
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const p = this.add.circle(x + side * 6, y - 3, 3.5, 0xf1e6d6).setDepth(4);
        this.tweens.add({ targets: p, x: p.x + side * (12 + i * 4), y: p.y - 6, alpha: 0, scale: 0.3, duration: 280, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
      }
    }

    addTrauma(a) { this.trauma = Math.min(1, this.trauma + a); }

    stun(ms, knockX = 0, knockY = -220) {
      const now = this.time.now;
      if (now < this.invulnUntil || this.finished) return false;
      this.stunUntil = now + ms;
      this.invulnUntil = now + ms + INVULN_MS;
      this.body.setVelocity(knockX, knockY);
      this.addTrauma(0.5);
      this.cameras.main.flash(80, 255, 255, 255);
      return true;
    }

    respawn() {
      this.respawning = true;
      this.addTrauma(0.4);
      this.body.setVelocity(0, 0);
      this.body.enable = false;
      this.time.delayedCall(650, () => {
        this.body.enable = true;
        this.body.reset(this.lastSafe.x, this.lastSafe.y - 4);
        this.respawning = false;
        this.invulnUntil = this.time.now + INVULN_MS;
        this.spawnPuff(this.pb.x, this.pb.y, 0xffffff, 8);
      });
    }

    finish(time) {
      if (this.finished) return;
      this.finished = true;
      const ms = Math.round(time - this.raceStart);
      this.body.setVelocity(0, this.body.velocity.y);
      this.spawnPuff(this.pb.x, this.pb.y - 20, 0xffd43b, 12);
      this.flashMsg('FINISH!', '#ffd43b');
      this.time.delayedCall(700, () => onFinished(ms));
    }

    // ---- Pickups and enemies --------------------------------------------------
    checkPickups(time) {
      const px = this.pb.x, py = this.pb.y;
      for (const c of this.coinObjs) {
        if (c.taken || Math.abs(c.x - px) > 18 || Math.abs(c.img.y - py) > 22) continue;
        c.taken = true;
        c.img.setVisible(false);
        this.spawnPuff(c.x, c.img.y, 0xffd43b, 5);
        if (this.coins < COINS_FOR_POWER) this.coins += 1;
        if (this.coins >= COINS_FOR_POWER && !this.power) { this.coins = 0; this.givePower(); }
        this.drawCoinPips();
      }
      for (const b of this.boxes) {
        if (time < b.backAt) continue;
        if (!b.img.visible) b.img.setVisible(true);
        if (this.power || Math.abs(b.x - px) > 22 || Math.abs(b.y - py) > 24) continue;
        b.img.setVisible(false);
        b.backAt = time + 3500;
        this.spawnPuff(b.x, b.y, 0x9ff0ff, 10);
        this.givePower();
      }
    }

    givePower() {
      // Players behind the leader get more attacks; the leader gets more defence and speed.
      let rank = 1, n = 1;
      if (!this.solo) {
        const me = this.progress();
        const others = [...this.remotes.values()].filter((r) => r.visible);
        n = others.length + 1;
        rank = 1 + others.filter((r) => r.prog > me).length;
      }
      const table = n === 1 ? { fire: 30, slime: 20, bolt: 20, speed: 30 }
        : rank === 1 ? { fire: 25, slime: 45, bolt: 0, speed: 30 }
        : rank === n ? { fire: 30, slime: 10, bolt: 40, speed: 20 }
        : { fire: 35, slime: 20, bolt: 20, speed: 25 };
      let roll = Math.random() * 100;
      let pick = 'fire';
      for (const [k, w] of Object.entries(table)) { if ((roll -= w) < 0) { pick = k; break; } }
      this.power = pick;
      this.hud.powerIcon.setTexture(POWERS[pick].icon).setAlpha(1).setScale(0.75);
      this.tweens.add({ targets: this.hud.powerIcon, scale: 0.5, duration: 250, ease: 'Back.easeOut' });
      this.hud.powerKey.setAlpha(1);
      this.flashMsg(POWERS[pick].label + '!', '#9ff0ff');
    }

    usePower() {
      const k = this.power;
      this.power = null;
      this.hud.powerIcon.setAlpha(0);
      this.hud.powerKey.setAlpha(0);
      const dir = this.hero.flipX ? -1 : 1;
      if (k === 'speed') {
        this.speedUntil = this.time.now + SPEED_MS;
        this.flashMsg('Speed boost!', '#ffd43b');
        this.spawnPuff(this.pb.x, this.pb.y, 0xffd43b, 10);
        return;
      }
      const id = App.uid + '-' + Math.random().toString(36).slice(2, 7);
      let fx;
      if (k === 'fire') fx = { id, k, x: Math.round(this.pb.x + dir * 16), y: Math.round(this.pb.y - 2), d: dir };
      else if (k === 'slime') {
        const gy = this.groundYBelow(this.pb.x - dir * 26, this.body.bottom) ?? Math.round(this.body.bottom);
        fx = { id, k, x: Math.round(this.pb.x - dir * 26), y: gy, d: dir };
      } else if (k === 'bolt') {
        fx = { id, k, x: Math.round(this.pb.x), y: 0, d: dir };
        this.flashMsg('Lightning!', '#ffe14a');
      }
      fx.e = this.epoch;
      this.myFx = [...this.myFx, fx].slice(-6);
      if (!this.solo) Net.set({ fx: this.myFx });
      this.spawnFx(fx, true);
    }

    updateEnemies(tRace, now) {
      for (const e of this.enemies) {
        const alive = now >= e.deadUntil;
        if (!alive) continue;
        if (!e.img.visible) { e.img.setVisible(true).setAlpha(1).setScale(S); }
        const t = tRace / 1000;
        if (e.kind === 'walker') {
          const span = Math.max(1, e.R - e.L);
          const d = (t * 55) % (2 * span);
          const x = e.L + (d < span ? d : 2 * span - d);
          e.img.setFlipX(d < span);
          e.img.x = x;
          e.img.y = e.baseY;
          e.cx = x; e.cy = e.baseY - 12;
        } else {
          e.img.x = e.cx + Math.sin(t * 0.9) * 40;
          e.img.y = e.cy + Math.sin(t * 2.6) * 30;
          e.img.setFlipX(Math.cos(t * 0.9) > 0);
          e.hx = e.img.x; e.hy = e.img.y;
        }
      }
    }

    enemyBox(e) {
      return e.kind === 'walker' ? { x: e.cx, y: e.cy } : { x: e.hx, y: e.hy };
    }

    killEnemy(e) {
      e.deadUntil = this.time.now + 8000;
      this.tweens.add({ targets: e.img, scaleY: S * 0.2, alpha: 0, duration: 250, onComplete: () => e.img.setVisible(false) });
      this.spawnPuff(e.img.x, e.img.y - 8, 0xd0bfff, 7);
    }

    checkEnemies(now) {
      if (now < this.invulnUntil) return;
      const b = this.body;
      for (const e of this.enemies) {
        if (now < e.deadUntil || !e.img.visible) continue;
        const p = this.enemyBox(e);
        if (p.x === undefined) continue;
        if (Math.abs(p.x - this.pb.x) > (e.w + 18) / 2 || Math.abs(p.y - this.pb.y) > (e.h + 28) / 2) continue;
        if (b.velocity.y > 0 && b.bottom <= p.y - e.h / 2 + 12) {
          this.killEnemy(e);
          b.setVelocityY(-STOMP_BOUNCE);
          this.jumpsUsed = 1;
          this.addTrauma(0.25);
          this.squash(0.8, 1.25, 160);
        } else {
          const knock = this.pb.x < p.x ? -200 : 200;
          this.stun(STUN_ENEMY, knock, -260);
        }
      }
    }

    // ---- Powers in flight ----------------------------------------------------
    spawnFx(fx, mine) {
      if (this.seenFx.has(fx.id)) return;
      this.seenFx.add(fx.id);
      const now = this.time.now;
      if (fx.k === 'fire') {
        const img = this.add.image(fx.x, fx.y, 'fireball').setScale(S).setFlipX(fx.d < 0).setDepth(6);
        this.fx.set(fx.id, { ...fx, mine, img, born: now });
      } else if (fx.k === 'slime') {
        const img = this.add.image(fx.x, fx.y + 1, 'slime').setScale(S * 0.3).setOrigin(0.5, 1).setDepth(2);
        this.tweens.add({ targets: img, scale: S, duration: 250, ease: 'Back.easeOut' });
        this.fx.set(fx.id, { ...fx, mine, img, born: now });
      } else if (fx.k === 'bolt') {
        this.cameras.main.flash(120, 255, 240, 160);
        // Strike everyone ahead of the caster, me included.
        const targets = [];
        if (!mine && this.pb.x > fx.x && !this.finished) {
          targets.push({ x: this.pb.x, y: this.pb.y });
          if (this.stun(STUN_BOLT, 0, -120)) this.flashMsg('Zapped!', '#ffe14a');
        }
        for (const r of this.remotes.values()) if (r.visible && r.img.x > fx.x && r.peer !== fx.owner) targets.push({ x: r.img.x, y: r.img.y - 16 });
        // Also zaps enemies on screen.
        const view = this.cameras.main.worldView;
        for (const e of this.enemies) if (this.time.now >= e.deadUntil && view.contains(e.img.x, e.img.y)) this.killEnemy(e);
        for (const t of targets) {
          const bolt = this.add.image(t.x, t.y - 160, 'bolt').setScale(S * 1.4).setDepth(8);
          this.tweens.add({ targets: bolt, y: t.y - 10, duration: 140, ease: 'Quad.easeIn', onComplete: () => {
            this.spawnPuff(t.x, t.y, 0xffe14a, 8);
            this.tweens.add({ targets: bolt, alpha: 0, duration: 250, onComplete: () => bolt.destroy() });
          } });
        }
      }
    }

    removeFx(id, puffColor) {
      const f = this.fx.get(id);
      if (!f) return;
      this.fx.delete(id);
      if (puffColor !== undefined) this.spawnPuff(f.img.x, f.img.y - 4, puffColor, 6);
      f.img.destroy();
    }

    updateFx(dt, now) {
      for (const [id, f] of this.fx) {
        if (f.k === 'fire') {
          f.img.x += f.d * FIRE_SPEED * dt;
          f.img.angle += f.d * 0; // straight flight
          if (now - f.born > FIRE_LIFE || this.isSolidAt(f.img.x + f.d * 8, f.img.y) || f.img.x < 0 || f.img.x > this.worldW) { this.removeFx(id, 0xff8a1a); continue; }
          // Burns enemies on the way.
          for (const e of this.enemies) {
            if (now < e.deadUntil || !e.img.visible) continue;
            const p = this.enemyBox(e);
            if (p.x !== undefined && Math.abs(p.x - f.img.x) < 20 && Math.abs(p.y - f.img.y) < 18) { this.killEnemy(e); this.removeFx(id, 0xff8a1a); break; }
          }
          if (!this.fx.has(id)) continue;
          if (!f.mine && !this.finished && Math.abs(this.pb.x - f.img.x) < 18 && Math.abs(this.pb.y - f.img.y) < 20) {
            if (this.stun(STUN_FIRE, f.d * 240, -280)) this.flashMsg('Burned!', '#ff8a1a');
            this.registerHit(id);
            this.removeFx(id, 0xff8a1a);
          }
        } else if (f.k === 'slime') {
          if (now - f.born > SLIME_LIFE) { this.removeFx(id); continue; }
          if (!f.mine && !this.finished && Math.abs(this.pb.x - f.x) < 20 && Math.abs(this.body.bottom - f.y) < 10) {
            const slide = (this.body.velocity.x >= 0 ? 1 : -1) * 280;
            if (this.stun(STUN_SLIME, slide, -60)) this.flashMsg('Slipped!', '#8fe04a');
            this.registerHit(id);
            this.removeFx(id, 0x8fe04a);
          }
        }
      }
    }

    registerHit(id) {
      this.myHits = [...this.myHits, id].slice(-12);
      if (!this.solo) Net.set({ h: this.myHits });
    }

    // ---- Other players --------------------------------------------------------
    updateRemotes(dt, now) {
      if (this.solo) return;
      const st = roomState();
      const seen = new Set();
      for (const p of st.racers) {
        if (p.me) continue;
        // Powers and hits from everyone in this race.
        if (p.e === this.epoch) {
          (Array.isArray(p.fx) ? p.fx : []).forEach((fx) => {
            if (fx && fx.e === this.epoch && typeof fx.id === 'string' && !this.seenFx.has(fx.id) && ['fire', 'slime', 'bolt'].includes(fx.k)) {
              this.spawnFx({ id: fx.id, k: fx.k, x: +fx.x || 0, y: +fx.y || 0, d: fx.d < 0 ? -1 : 1, owner: p.peer }, false);
            }
          });
          (Array.isArray(p.h) ? p.h : []).forEach((id) => { if (this.fx.has(id)) this.removeFx(id, 0xffffff); });
        }
        const racing = p.e === this.epoch && (p.st === 'race' || p.st === 'fin');
        if (!racing) continue;
        seen.add(p.peer);
        let r = this.remotes.get(p.peer);
        if (!r) {
          const img = this.add.image(+p.x || this.startX, +p.y || 0, COLORS[p.color].tex).setScale(S).setOrigin(0.5, 1).setDepth(4);
          const label = this.add.text(0, 0, '', { ...HUD_STYLE, fontSize: '12px', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(9);
          r = { peer: p.peer, img, label, stars: this.add.graphics().setDepth(6), color: p.color, prog: 0, visible: true };
          this.remotes.set(p.peer, r);
        }
        r.visible = true;
        r.color = p.color;
        r.img.setTexture(COLORS[p.color].tex);
        r.prog = Phaser.Math.Clamp(+p.prog || 0, 0, 1);
        const tx = +p.x || r.img.x, ty = +p.y || r.img.y;
        const k = 1 - Math.exp(-14 * dt);
        if (Math.abs(tx - r.img.x) > 200) { r.img.x = tx; r.img.y = ty; }
        r.img.x += (tx - r.img.x) * k;
        r.img.y += (ty - r.img.y) * k;
        r.img.setFlipX(!!p.f);
        r.img.setAlpha(p.a === 'd' ? 0.25 : 0.92);
        r.img.setAngle((+p.vx || 0) / RUN_SPEED * 4);
        if (p.a === 's') r.img.setTint(0xb8c2ff); else r.img.clearTint();
        r.label.setText(String(p.n || 'Player').slice(0, 12)).setPosition(r.img.x, r.img.y - 36).setColor(COLORS[p.color].hex);
        this.drawStars(r.stars, r.img.x, r.img.y - 40, p.a === 's', now);
      }
      for (const [peer, r] of this.remotes) {
        if (!seen.has(peer)) { r.visible = false; r.img.setVisible(false); r.label.setVisible(false); r.stars.clear(); }
        else { r.img.setVisible(true); r.label.setVisible(true); }
      }
    }

    sendNet(now) {
      if (this.solo || now - this.lastNetSend < 50) return;
      this.lastNetSend = now;
      const stunned = now < this.stunUntil;
      Net.set({
        x: Math.round(this.pb.x), y: Math.round(this.body.bottom + 1), vx: Math.round(this.body.velocity.x),
        f: this.hero.flipX ? 1 : 0, a: this.respawning ? 'd' : stunned ? 's' : 'r',
        prog: Math.round(this.progress() * 1000) / 1000,
      });
    }

    // ---- Camera ---------------------------------------------------------------
    updateCamera(_time, delta) {
      const dt = Math.min(delta, 50) / 1000;
      const p = this.pb;
      if (!this.respawning) {
        const dx = p.x - this.camFocus.x;
        const dy = p.y - this.camFocus.y;
        if (Math.abs(dx) > CAM_DEADZONE_X) this.camFocus.x += dx - Math.sign(dx) * CAM_DEADZONE_X;
        if (Math.abs(dy) > CAM_DEADZONE_Y) this.camFocus.y += dy - Math.sign(dy) * CAM_DEADZONE_Y;
        const vx = this.body.velocity.x;
        const leadGoal = Math.abs(vx) > 40 ? Math.sign(vx) * CAM_LOOK_AHEAD : this.camLead;
        this.camLead += (leadGoal - this.camLead) * (1 - Math.exp(-CAM_LEAD_RATE * dt));
      }
      const rate = this.body.velocity.y > 200 ? CAM_FOLLOW_RATE_FALLING : CAM_FOLLOW_RATE;
      const t = 1 - Math.exp(-rate * dt);
      this.camPos.x += (this.camFocus.x + this.camLead - this.camPos.x) * t;
      this.camPos.y += (this.camFocus.y - this.camPos.y) * t;
      this.trauma = Math.max(0, this.trauma - SHAKE_DECAY * dt);
      this.shakeTime += dt * 30;
      this.applyCamera();
    }

    applyCamera() {
      const cam = this.cameras.main;
      const sx = Phaser.Math.Clamp(this.camPos.x - VIEW_W / 2, 0, Math.max(0, this.worldW - VIEW_W));
      const sy = Phaser.Math.Clamp(this.camPos.y - VIEW_H / 2, 0, Math.max(0, this.worldH - VIEW_H));
      const shake = this.trauma * this.trauma * SHAKE_STRENGTH;
      const k = this.shakeTime;
      cam.setScroll(sx + SHAKE_MAX_OFFSET * shake * Math.sin(k * 1.7), sy + SHAKE_MAX_OFFSET * shake * Math.sin(k * 2.3 + 1));
      cam.setRotation(SHAKE_MAX_ROLL * shake * Math.sin(k * 1.1 + 2));
    }
  }

  // ---------------------------------------------------------------------------
  window.game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#7ec8f0',
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: GRAVITY }, debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, BackdropScene, RaceScene],
  });
  window.CoinHopper = { App, roomState };
  wireMenu();
})();
