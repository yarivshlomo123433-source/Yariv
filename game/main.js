// Coin Hopper: an online platform race for up to four players (bots fill empty spots).
// A match is three races on freshly generated courses, scored 10/6/3/1, ending on a podium.
// Each browser simulates its own runner; the host also simulates the bots and decides when a
// race is over. Everything else travels through net.js.

(function () {
  const { TILE, S, COLORS, Runner, BotBrain, drawStars, LABEL_STYLE } = window.CH;
  const VIEW_H = 448;
  const ROUNDS = 3;
  const POINTS = [10, 6, 3, 1];
  const FINISH_GRACE_MS = 20000;           // after the first finisher, the others get this long
  const MAX_RACE_MS = 180000;
  const BOT_NAMES = ['Zippy', 'Momo', 'Kiki', 'Pip', 'Taz', 'Nova', 'Bloop', 'Rocket'];
  const ARTIFACT_URL = 'https://claude.ai/artifact/Rzet7Wv8oJhf8PazUDPwnV';

  // Powers.
  const FIRE_SPEED = 470, FIRE_LIFE = 2200, SLIME_LIFE = 15000;
  const STUN_FIRE = 1300, STUN_SLIME = 1000, STUN_BOLT = 1600, STUN_ENEMY = 800, SPEED_MS = 3000;
  const COINS_FOR_POWER = 5;
  const POWERS = {
    fire: { icon: 'fireball', label: 'Fireball', sfx: 'fire' },
    slime: { icon: 'slime', label: 'Slime trap', sfx: 'slime' },
    bolt: { icon: 'bolt', label: 'Lightning', sfx: 'bolt' },
    speed: { icon: 'speed', label: 'Speed boost', sfx: 'speed' },
  };

  // Camera and shake.
  const CAM_DEADZONE_X = 24, CAM_DEADZONE_Y = 40, CAM_LOOK_AHEAD = 120, CAM_LEAD_RATE = 2.5;
  const CAM_FOLLOW_RATE = 7, CAM_FOLLOW_RATE_FALLING = 12;
  const SHAKE_MAX_OFFSET = 9, SHAKE_MAX_ROLL = 0.012, SHAKE_DECAY = 1.6;

  const HUD_STYLE = { fontFamily: 'Fredoka, Trebuchet MS, sans-serif', fontSize: '18px', color: '#ffffff', stroke: '#1b1f3b', strokeThickness: 5 };

  const $ = (id) => document.getElementById(id);
  const viewW = () => (window.game ? window.game.scale.width : 800);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };
  const randSeed = () => Math.floor(Math.random() * 1e9);

  // ---------------------------------------------------------------------------
  // App state
  // ---------------------------------------------------------------------------
  const App = {
    online: false,
    mode: 'menu',            // menu | room | race | results | podium
    solo: false,
    code: null,
    joinedAt: 0,
    joinedLocal: 0,
    startedEpoch: 0,
    race: null,              // { e, s, round, total, h (host uid), roster: [{k, n, c, b, sk}] }
    match: null,             // host only: { id, round, total, pts: {k: n}, names: {k: [n, c, b]}, res }
    shownRes: 0,             // epoch whose final results are on screen
    finishTime: 0,
    botsOn: true,
    uid: Math.random().toString(36).slice(2, 8),
  };

  function myName() { return (($('name').value || '').trim().slice(0, 12)) || 'Player'; }
  function amHost() { return App.solo || (roomState().host || {}).me; }

  // Humans in my room: the first four by join time. Host = first.
  function roomState() {
    if (!Net.inRoom()) return { racers: [], host: null, me: null, full: false, hostP: null };
    const all = Net.peers().filter((p) => p.j && p.u);
    all.sort((a, b) => a.j - b.j || (a.peer < b.peer ? -1 : 1));
    const racers = all.slice(0, 4);
    const me = racers.find((p) => p.me);
    return { racers, host: racers[0], me, full: !me && all.some((p) => p.me), hostP: racers[0] };
  }

  // The match as the host last published it (or my own, when I am the host or solo).
  function matchView() {
    if (App.solo || amHost()) return App.match;
    const h = roomState().host;
    return h && h.m && typeof h.m === 'object' ? h.m : null;
  }

  function showPanel(id) {
    ['panel-menu', 'panel-room', 'panel-results', 'panel-podium'].forEach((p) => { $(p).hidden = p !== id; });
    document.body.classList.toggle('racing', App.mode === 'race' || App.mode === 'results');
    document.body.classList.toggle('panel-open', !!id);
    $('btn-quit').hidden = !(App.mode === 'race' || App.mode === 'results');
  }

  function fmtTime(ms) {
    const s = Math.max(0, ms) / 1000;
    return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
  }

  function li(parts) {
    const el = document.createElement('li');
    parts.forEach(([cls, text, color]) => {
      const s = document.createElement('span');
      if (cls) s.className = cls;
      if (cls === 'dot') s.style.background = color;
      else s.textContent = text;
      el.append(s);
    });
    return el;
  }

  // ---- Room card -------------------------------------------------------------
  function renderRoom() {
    const st = roomState();
    $('room-code').textContent = App.code || '';
    const ul = $('room-players');
    ul.replaceChildren();
    st.racers.forEach((p, i) => {
      ul.append(li([['dot', '', COLORS[i].hex], ['nm', (p.n || 'Player') + (p.me ? ' (you)' : '')], ['pill', i === 0 ? 'host' : p.st === 'race' ? 'racing' : 'ready']]));
    });
    const isHost = st.host && st.host.me;
    const botsWanted = isHost ? $('bots').checked : !!(st.host && st.host.bo);
    for (let i = st.racers.length; i < 4 && botsWanted; i++) ul.append(li([['dot', '', COLORS[i].hex], ['nm', 'Bot'], ['pill', 'bot']]));
    $('btn-start').hidden = !isHost;
    $('bots').disabled = !isHost;
    const v = matchView();
    if (!Net.connected()) $('room-msg').textContent = 'Connecting to the room…';
    else if (isHost) $('room-msg').textContent = st.racers.length < 2 ? 'Invite friends with the link, or start now against bots.' : `${st.racers.length} players in. Start when everyone is here.`;
    else $('room-msg').textContent = v && v.res === null && App.startedEpoch ? 'A race is running. You will join the next one.' : 'Waiting for the host to start the match…';
  }

  // ---- Results card ----------------------------------------------------------
  function liveRanking() {
    const scene = raceScene();
    if (!scene || !App.race) return [];
    return App.race.roster.map((p) => {
      const s = scene.stateOf(p.k);
      return { ...p, ft: s.ft || 0, prog: s.prog || 0 };
    }).sort((a, b) => (a.ft && b.ft ? a.ft - b.ft : a.ft ? -1 : b.ft ? 1 : b.prog - a.prog));
  }

  function renderResults() {
    const v = matchView();
    const race = App.race;
    if (!race) return;
    const final = v && v.res && v.res.e === race.e ? v.res : null;
    const list = final
      ? final.order.map((k) => ({ ...(race.roster.find((p) => p.k === k) || { k, n: '?', c: 0 }), ft: final.ft[k] || 0, gain: final.gained[k] || 0 }))
      : liveRanking();
    const ul = $('results-list');
    ul.replaceChildren();
    list.forEach((p, i) => {
      ul.append(li([
        ['rank', final || p.ft ? String(i + 1) : '–'],
        ['dot', '', COLORS[p.c].hex],
        ['nm', (p.n || 'Player') + (p.k === App.uid ? ' (you)' : '')],
        ['time', p.ft ? fmtTime(p.ft) : final ? 'DNF' : `${Math.round((p.prog || 0) * 100)}%`],
        ...(final ? [['gain', `+${p.gain}`]] : []),
      ]));
    });
    // Match standings.
    const sl = $('standings-list');
    sl.replaceChildren();
    if (v && v.pts) {
      Object.entries(v.pts).sort((a, b) => b[1] - a[1]).forEach(([k, pts], i) => {
        const info = (v.names && v.names[k]) || ['?', 0];
        sl.append(li([['rank', String(i + 1)], ['dot', '', COLORS[info[1]].hex], ['nm', info[0] + (k === App.uid ? ' (you)' : '')], ['pts', String(pts)]]));
      });
    }
    const round = race.round, total = race.total;
    $('race-label').textContent = `Race ${round} of ${total}`;
    const myIdx = list.findIndex((p) => p.k === App.uid);
    const myFt = myIdx >= 0 && list[myIdx].ft;
    if (final) $('results-title').textContent = !myFt ? 'Time is up!' : myIdx === 0 ? 'You won this race! 🏆' : `You finished #${myIdx + 1}`;
    else $('results-title').textContent = App.finishTime ? `You finished #${myIdx + 1}` : 'Race in progress';
    const host = amHost();
    const last = round >= total;
    $('btn-next').hidden = !(host && final && !last);
    $('btn-next').textContent = `Next race (${round + 1}/${total}) · new map`;
    $('results-msg').textContent = !final
      ? 'Waiting for the others to finish…'
      : last ? 'That was the last race. Podium coming up…'
      : host ? 'Ready when you are.' : 'Waiting for the host to start the next race…';
  }

  // ---- Podium card -----------------------------------------------------------
  function renderPodium() {
    const v = matchView();
    if (!v) return;
    const order = Object.entries(v.pts).sort((a, b) => b[1] - a[1]);
    const winner = order[0] && v.names[order[0][0]];
    $('podium-title').textContent = order[0] && order[0][0] === App.uid ? 'You win the match! 🏆' : `${winner ? winner[0] : 'Someone'} wins the match!`;
    const me = order.findIndex(([k]) => k === App.uid);
    $('podium-msg').textContent = me >= 0 ? `You placed #${me + 1} with ${order[me][1]} points.` : '';
    $('btn-rematch').hidden = !amHost();
    if (!amHost()) $('podium-msg').textContent += ' Waiting for the host to start a new match…';
  }

  // ---------------------------------------------------------------------------
  // Flow
  // ---------------------------------------------------------------------------
  function raceScene() {
    const g = window.game;
    return g && g.scene.isActive('race') ? g.scene.getScene('race') : null;
  }

  function goScene(key, data) {
    const g = window.game;
    ['backdrop', 'race', 'podium'].forEach((k) => { if (k !== key) g.scene.stop(k); });
    g.scene.stop(key);
    g.scene.start(key, data);
  }

  function randomCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += letters[Math.floor(Math.random() * letters.length)];
    return s;
  }

  function inviteUrl() {
    const base = window.claude ? ARTIFACT_URL : location.href.split('#')[0];
    return `${base}#room-${(App.code || '').toLowerCase()}`;
  }

  async function enterRoom(code) {
    window.Sound.play('click');
    store.set('ch-name', myName());
    App.code = code.toUpperCase();
    App.solo = false;
    App.mode = 'room';
    App.startedEpoch = 0;
    App.match = null;
    showPanel('panel-room');
    $('room-code').textContent = App.code;
    $('room-msg').textContent = 'Joining…';
    $('btn-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(`Race me in Coin Hopper! ${inviteUrl()}`);
    $('invite-msg').hidden = true;
    try {
      await Net.join(App.code.toLowerCase());
    } catch (e) {
      App.mode = 'menu';
      showPanel('panel-menu');
      note('Could not join that room. Check the code and try again.', true);
      return;
    }
    try { history.replaceState(null, '', '#room-' + App.code.toLowerCase()); } catch (e) { /* not allowed here */ }
    App.joinedAt = Date.now();
    App.joinedLocal = performance.now();
    App.sawHost = false;
    Net.set({ u: App.uid, n: myName(), j: App.joinedAt, st: 'room', e: 0, bo: $('bots').checked ? 1 : 0 });
    renderRoom();
  }

  async function leaveRoom() {
    window.Sound.play('click');
    await Net.leave();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* not allowed here */ }
    backToMenu();
  }

  function backToMenu() {
    App.mode = 'menu';
    App.solo = false;
    App.code = null;
    App.race = null;
    App.match = null;
    showPanel('panel-menu');
    goScene('backdrop');
    window.Sound.music('menu');
  }

  // Host: start the next race of the match, or a new match.
  function hostStartRace(newMatch) {
    let m = App.match;
    if (newMatch || !m || m.round >= m.total) {
      m = App.match = { id: randSeed(), round: 0, total: ROUNDS, pts: {}, names: {}, res: null };
    }
    m.round += 1;
    m.res = null;
    // Roster: humans first (in join order), then bots in the free colours.
    const humans = App.solo
      ? [{ k: App.uid, n: myName() }]
      : roomState().racers.map((p) => ({ k: p.u, n: String(p.n || 'Player').slice(0, 12) }));
    const roster = humans.map((p, i) => ({ ...p, c: i, b: 0 }));
    const wantBots = App.solo || $('bots').checked;
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    for (let i = roster.length; i < 4 && wantBots; i++) {
      roster.push({ k: `${App.uid}-b${i}`, n: names[i], c: i, b: 1, sk: Math.round((0.55 + Math.random() * 0.4) * 100) / 100 });
    }
    roster.forEach((p) => {
      if (!(p.k in m.pts)) m.pts[p.k] = 0;
      m.names[p.k] = [p.n, p.c, p.b];
    });
    const st = roomState();
    let maxE = App.startedEpoch;
    st.racers.forEach((p) => { if (p.race && p.race.e > maxE) maxE = p.race.e; });
    const race = { e: maxE + 1, s: randSeed(), round: m.round, total: m.total, h: App.uid, roster };
    if (!App.solo) Net.set({ race, m });
    beginRace(race);
  }

  function beginRace(race) {
    App.startedEpoch = Math.max(App.startedEpoch, race.e);
    App.race = race;
    App.finishTime = 0;
    App.shownRes = 0;
    const inRoster = race.roster.some((p) => p.k === App.uid);
    App.mode = 'race';
    showPanel(null);
    if (!App.solo) Net.set({ st: inRoster ? 'race' : 'watch', e: race.e, ft: 0, prog: 0, fx: [], h: [], bots: {} });
    goScene('race', { race, spectator: !inRoster });
    $('screen').focus();
  }

  // My runner crossed the line.
  function onFinished(ms) {
    App.finishTime = ms;
    if (!App.solo) Net.set({ st: 'fin', ft: ms, prog: 1 });
    App.mode = 'results';
    showPanel('panel-results');
    renderResults();
  }

  // The host declared the race over (or I did, as host / solo).
  function onRaceOver() {
    const v = matchView();
    if (!App.race || !v || !v.res || v.res.e !== App.race.e || App.shownRes === App.race.e) return;
    App.shownRes = App.race.e;
    const scene = raceScene();
    if (scene) scene.endRace();
    App.mode = 'results';
    showPanel('panel-results');
    renderResults();
    if (App.race.round >= App.race.total) {
      setTimeout(() => {
        if (App.mode !== 'results' || App.shownRes !== App.race.e) return;
        App.mode = 'podium';
        showPanel('panel-podium');
        renderPodium();
        goScene('podium', { match: matchView(), race: App.race });
      }, 3500);
    }
  }

  // React to the room: races the host starts, results, players coming and going.
  function onNet() {
    if (!Net.inRoom()) return;
    const st = roomState();
    if (st.full) {
      leaveRoom().then(() => note('That room already has 4 players.', true));
      return;
    }
    const h = st.host;
    // The first time I see the host after joining: if a race is already running, wait for the next.
    if (h && !h.me && !App.sawHost) {
      App.sawHost = true;
      if (h.race && h.st !== 'room') {
        App.startedEpoch = h.race.e;
        if (App.mode === 'room') renderRoom();
        return;
      }
    }
    if (h && !h.me && h.race && h.race.e > App.startedEpoch) { beginRace(h.race); return; }
    if (App.mode === 'room') renderRoom();
    if (App.mode === 'race' || App.mode === 'results') onRaceOver();
    if (App.mode === 'results') renderResults();
    if (App.mode === 'podium') renderPodium();
  }

  function note(msg, warn) {
    $('online-note').textContent = msg;
    $('online-note').classList.toggle('warn', !!warn);
  }

  function wireUi() {
    $('name').value = store.get('ch-name') || '';
    const unlock = () => window.Sound.unlock();
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    if (window.matchMedia('(pointer: coarse)').matches) $('key-hint').hidden = true;

    $('btn-solo').addEventListener('click', () => {
      window.Sound.play('click');
      store.set('ch-name', myName());
      App.solo = true;
      App.match = null;
      App.startedEpoch = 0;
      hostStartRace(true);
    });
    $('btn-create').addEventListener('click', () => enterRoom(randomCode()));
    $('btn-join').addEventListener('click', () => {
      const code = ($('code').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length < 4) { $('code').focus(); return; }
      enterRoom(code);
    });
    $('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
    $('bots').addEventListener('change', () => { Net.set({ bo: $('bots').checked ? 1 : 0 }); renderRoom(); });
    $('btn-start').addEventListener('click', () => { window.Sound.play('click'); hostStartRace(true); });
    $('btn-next').addEventListener('click', () => { window.Sound.play('click'); hostStartRace(false); });
    $('btn-rematch').addEventListener('click', () => { window.Sound.play('click'); hostStartRace(true); });
    const leave = () => (App.solo ? (window.Sound.play('click'), backToMenu()) : leaveRoom());
    ['btn-leave', 'btn-leave2', 'btn-leave3', 'btn-quit'].forEach((id) => $(id).addEventListener('click', leave));

    $('btn-invite').addEventListener('click', () => {
      const url = inviteUrl();
      const show = (msg) => { $('invite-msg').hidden = false; $('invite-msg').textContent = msg; };
      try {
        navigator.clipboard.writeText(url).then(() => show('Link copied. Send it to your friends.'), () => show(url));
      } catch (e) { show(url); }
    });

    // Sound, music and full screen.
    const syncIcons = () => {
      $('btn-sfx').classList.toggle('off', !window.Sound.sfxOn());
      $('btn-music').classList.toggle('off', !window.Sound.musicOn());
    };
    $('btn-sfx').addEventListener('click', () => { window.Sound.setSfx(!window.Sound.sfxOn()); syncIcons(); window.Sound.play('click'); });
    $('btn-music').addEventListener('click', () => { window.Sound.setMusic(!window.Sound.musicOn()); syncIcons(); });
    syncIcons();
    const canFull = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    $('btn-full').hidden = !canFull;
    $('btn-full').addEventListener('click', () => {
      const el = document.documentElement;
      const isFull = document.fullscreenElement || document.webkitFullscreenElement;
      try {
        if (isFull) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else {
          const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
          if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* not supported */ } }).catch(() => {});
        }
      } catch (e) { /* full screen refused */ }
    });

    Net.onChange(onNet);
    setInterval(() => {
      if (App.mode === 'results') { onRaceOver(); renderResults(); }
      if (App.mode === 'room') renderRoom();
    }, 600);

    // Invite links: #room-abcd fills in the code.
    const m = /^#room-([a-z0-9]{4,5})$/i.exec(location.hash || '');
    if (m) $('code').value = m[1].toUpperCase();

    $('btn-create').disabled = true;
    $('btn-join').disabled = true;
    note('Connecting…');
    Net.init().then((ok) => {
      App.online = ok;
      $('btn-create').disabled = !ok;
      $('btn-join').disabled = !ok;
      $('code').disabled = !ok;
      if (!ok) note('Playing with friends works when this page is opened on claude.ai while signed in. Bots are always ready.');
      else if (m) { note(`You're invited to room ${m[1].toUpperCase()}. Enter your name and press Join.`); $('name').focus(); }
      else note('Create a room and send your friends the invite link.');
    });
  }

  // ---------------------------------------------------------------------------
  // Scenes
  // ---------------------------------------------------------------------------
  function paintSky(scene) {
    const g = scene.add.graphics().setScrollFactor(0).setDepth(-10);
    g.fillGradientStyle(0x5fb4ec, 0x5fb4ec, 0xd3effc, 0xd3effc, 1);
    g.fillRect(0, 0, 2400, VIEW_H);
    return g;
  }

  class BootScene extends Phaser.Scene {
    constructor() { super('boot'); }
    create() {
      const entries = Object.entries(window.ART);
      let left = entries.length;
      const done = () => { if (--left === 0) { this.scene.start('backdrop'); window.Sound.music('menu'); } };
      entries.forEach(([key, a]) => {
        const img = new Image();
        img.onload = () => { this.textures.addImage(key, img); done(); };
        img.onerror = done;
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(a.svg)));
      });
    }
  }

  // Behind the menus: the four heroes bouncing on a strip of grass.
  class BackdropScene extends Phaser.Scene {
    constructor() { super('backdrop'); }
    create() {
      const W = viewW();
      paintSky(this);
      [[0.15, 70], [0.55, 46], [0.85, 110]].forEach(([fx, y], i) => {
        const c = this.add.image(W * fx, y, 'cloud').setScale(S).setAlpha(0.95);
        this.tweens.add({ targets: c, x: c.x + 30, duration: 6000 + i * 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      });
      for (let x = 0; x < W + TILE; x += TILE) {
        this.add.image(x + 16, VIEW_H - 48, 'grass').setScale(S);
        this.add.image(x + 16, VIEW_H - 16, 'dirt').setScale(S);
      }
      COLORS.forEach((c, i) => {
        const hero = this.add.image(W / 2 - 150 + i * 100, VIEW_H - 64, c.tex).setScale(S * 1.2).setOrigin(0.5, 1);
        this.tweens.add({ targets: hero, y: hero.y - 30, duration: 380, yoyo: true, repeat: -1, delay: i * 180, ease: 'Quad.easeOut', hold: 60, repeatDelay: 700 });
      });
      this.scale.on('resize', this.onResize, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.onResize, this));
    }
    onResize() { this.scene.restart(); }
  }

  // Match podium.
  class PodiumScene extends Phaser.Scene {
    constructor() { super('podium'); }
    init(data) { this.match = data.match; }
    create() {
      const W = viewW();
      paintSky(this);
      for (let x = 0; x < W + TILE; x += TILE) {
        this.add.image(x + 16, VIEW_H - 16, 'grass').setScale(S);
      }
      const m = this.match;
      const cx = W > 700 ? W / 2 - 90 : W / 2;   // leave room for the card on the right
      const order = m ? Object.entries(m.pts).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];
      const spots = [{ dx: 0, h: 150, place: 1 }, { dx: -130, h: 105, place: 2 }, { dx: 130, h: 70, place: 3 }];
      const ground = VIEW_H - 32;
      order.forEach(([k, pts], i) => {
        const spot = spots[i];
        const info = (m.names && m.names[k]) || ['?', 0];
        const x = cx + spot.dx;
        const top = ground - spot.h;
        const g = this.add.graphics();
        const col = [0xffcc33, 0xcfd8e6, 0xd9925a][i];
        g.fillStyle(0x1b1f3b, 1).fillRoundedRect(x - 56, top - 3, 112, spot.h + 6, 10);
        g.fillStyle(col, 1).fillRoundedRect(x - 53, top, 106, spot.h, 8);
        g.fillStyle(0xffffff, 0.35).fillRoundedRect(x - 48, top + 5, 96, 10, 5);
        this.add.text(x, top + spot.h / 2 + 6, String(spot.place), { ...HUD_STYLE, fontSize: '40px', strokeThickness: 6 }).setOrigin(0.5);
        const hero = this.add.image(x, top - 150, COLORS[info[1]].tex).setScale(S * 1.5).setOrigin(0.5, 1);
        this.tweens.add({ targets: hero, y: top, duration: 600, delay: 300 + (2 - i) * 350, ease: 'Bounce.easeOut' });
        if (i === 0) this.tweens.add({ targets: hero, y: top - 26, duration: 300, yoyo: true, repeat: -1, delay: 1800, repeatDelay: 500, ease: 'Quad.easeOut' });
        const name = this.add.text(x, top - 82, `${info[0]}\n${pts} pts`, { ...HUD_STYLE, fontSize: '16px', align: 'center', color: COLORS[info[1]].hex }).setOrigin(0.5, 1).setAlpha(0);
        this.tweens.add({ targets: name, alpha: 1, duration: 300, delay: 900 + (2 - i) * 350 });
      });
      const trophy = this.add.image(cx, 54, 'trophy').setScale(0.9).setAlpha(0);
      this.tweens.add({ targets: trophy, alpha: 1, scale: 0.75, duration: 500, delay: 1700, ease: 'Back.easeOut' });
      // Confetti.
      const colors = [0xff4d6d, 0xffd43b, 0x4cbf5a, 0x4f86da, 0xe8559a, 0x9b6bff];
      this.time.addEvent({ delay: 60, repeat: 70, startAt: 0, callback: () => {
        const r = this.add.rectangle(Math.random() * W, -10, 6, 10, colors[Math.floor(Math.random() * colors.length)]).setDepth(10);
        this.tweens.add({ targets: r, y: VIEW_H + 20, x: r.x + (Math.random() - 0.5) * 120, angle: Math.random() * 720, duration: 2200 + Math.random() * 1500, onComplete: () => r.destroy() });
      } });
      window.Sound.play('win');
      window.Sound.music('menu');
    }
  }

  class RaceScene extends Phaser.Scene {
    constructor() { super('race'); }

    init(data) {
      this.race = data.race;
      this.spectator = !!data.spectator;
      this.isHost = this.race.h === App.uid;
      this.level = window.LevelGen.generate(this.race.s);
      this.raceStart = 0;
      this.started = false;
      this.over = false;
      this.firstFinishSeenAt = 0;
      this.trauma = 0;
      this.shakeTime = 0;
      this.touchWas = { jump: false, power: false };
      this.myFx = [];
      this.myHits = [];
      this.seenFx = new Set();
      this.fx = new Map();
      this.locals = [];          // runners this browser simulates: me, and the bots if host
      this.brains = new Map();   // runner key -> BotBrain
      this.remotes = new Map();  // runner key -> visual for runners simulated elsewhere
      this.lastNetSend = 0;
      this.resultSent = false;
    }

    create() {
      const lv = this.level;
      this.worldW = lv.width * TILE;
      this.worldH = lv.rows * TILE;
      this.drawBackground();
      this.buildCourse();
      const start = lv.objects.find((o) => o.type === 'start');
      this.startX = start.c * TILE + 16;
      this.physics.world.setBounds(0, -200, this.worldW, this.worldH + 600);
      this.physics.world.setBoundsCollision(true, true, false, false);

      this.race.roster.forEach((p, i) => {
        const x = this.startX - i * 14;
        const y = start.r * TILE + 2;
        const isMe = p.k === App.uid;
        if (isMe || (p.b && this.isHost)) {
          const r = new Runner(this, { key: p.k, name: p.n, color: p.c, me: isMe, bot: !!p.b, x, y, speedFactor: p.b ? 0.84 + 0.12 * (p.sk || 0.7) : 1 });
          this.locals.push(r);
          if (isMe) this.me = r;
          if (p.b) this.brains.set(p.k, new BotBrain(r, p.sk || 0.7));
        } else {
          this.remotes.set(p.k, this.makeRemote(p, x));
        }
      });
      // Spectators (arrived mid-match) follow the leader.
      this.camTarget = this.me || null;

      this.keys = this.input.keyboard.addKeys({
        left: 'LEFT', right: 'RIGHT', up: 'UP', a: 'A', d: 'D', w: 'W', space: 'SPACE', x: 'X', shift: 'SHIFT', e: 'E',
      }, false);
      this.input.keyboard.addCapture('LEFT,RIGHT,UP,DOWN,SPACE');

      const focus = this.me ? this.me.zone : { x: this.startX, y: start.r * TILE };
      this.camFocus = { x: focus.x, y: focus.y };
      this.camLead = 0;
      this.camPos = { x: focus.x, y: focus.y };
      this.applyCamera();
      this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.updateCamera, this);
      this.scale.on('resize', this.layoutHud, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.updateCamera, this);
        this.scale.off('resize', this.layoutHud, this);
        this.input.keyboard.clearCaptures();
      });

      this.buildHud();
      this.countdown();
      window.Sound.music('race');
    }

    makeRemote(p, x) {
      const img = this.add.image(x, 0, COLORS[p.c].tex).setScale(S).setOrigin(0.5, 1).setDepth(4).setAlpha(0.95);
      const label = this.add.text(0, 0, p.n, { ...LABEL_STYLE, color: COLORS[p.c].hex }).setOrigin(0.5, 1).setDepth(9);
      return { k: p.k, bot: !!p.b, img, label, stars: this.add.graphics().setDepth(6), prog: 0, ft: 0, seen: false };
    }

    // ---- Course ---------------------------------------------------------------
    drawBackground() {
      paintSky(this);
      for (let x = 60; x < this.worldW * 0.35 + 2400; x += 260) {
        this.add.image(x, 50 + ((x / 260) % 3) * 34, 'cloud').setScale(S).setScrollFactor(0.3).setAlpha(0.9).setDepth(-9);
      }
      const hills = this.add.graphics().setScrollFactor(0.5).setDepth(-8);
      hills.fillStyle(0x9ad7a0, 1);
      for (let x = 0; x < this.worldW * 0.5 + 2400; x += 240) hills.fillCircle(x, this.worldH + 50, 170);
      hills.fillStyle(0x7cc489, 1);
      for (let x = 120; x < this.worldW * 0.5 + 2400; x += 300) hills.fillCircle(x, this.worldH + 90, 150);
    }

    buildCourse() {
      const lv = this.level;
      this.solids = this.physics.add.staticGroup();
      this.platforms = this.physics.add.staticGroup();
      this.platRow = [];
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
          for (let i = 0; i < o.len; i++) {
            this.add.image(o.c * TILE + i * TILE + 16, o.r * TILE + 6.5, 'plank').setScale(S);
            this.platRow[o.c + i] = o.r;
          }
          const z = this.add.zone(o.c * TILE + (o.len * TILE) / 2, o.r * TILE + 5, o.len * TILE, 10);
          this.physics.add.existing(z, true);
          z.body.checkCollision.down = false;
          z.body.checkCollision.left = false;
          z.body.checkCollision.right = false;
          this.platforms.add(z);
        } else if (o.type === 'coin') {
          const img = this.add.image(x, y, 'coin').setScale(S);
          this.tweens.add({ targets: img, y: y - 4, duration: 700 + (o.c % 3) * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          this.coinObjs.push({ img, x, y, takenBy: new Set() });
        } else if (o.type === 'box') {
          const img = this.add.image(x, y, 'box').setScale(S);
          this.tweens.add({ targets: img, scale: S * 1.1, angle: 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          this.boxes.push({ img, x, y, backAt: new Map() });
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

    colTop(c) { const col = this.level.cols[c]; return col ? col.top : null; }

    // Highest surface a runner with feet at row `foot` could stand on in column c.
    supportTop(c, foot) {
      const g = this.colTop(c);
      const p = this.platRow[c];
      if (p != null && p >= foot - 0.6 && (g == null || p < g)) return p;
      return g;
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

    // ---- Who is where -----------------------------------------------------------
    stateOf(k) {
      const l = this.locals.find((r) => r.key === k);
      if (l) return { x: l.x, y: l.y, prog: l.progress(), ft: l.ft };
      const r = this.remotes.get(k);
      return r ? { x: r.img.x, y: r.img.y - 14, prog: r.prog, ft: r.ft } : { x: 0, y: 0, prog: 0, ft: 0 };
    }

    racerPositions() {
      return this.race.roster.map((p) => ({ k: p.k, ...this.stateOf(p.k) }));
    }

    // ---- HUD ------------------------------------------------------------------
    buildHud() {
      const d = 20;
      this.hud = {};
      this.hud.timer = this.add.text(16, 10, '0:00.00', HUD_STYLE).setScrollFactor(0).setDepth(d);
      this.hud.round = this.add.text(16, 34, `Race ${this.race.round}/${this.race.total}`, { ...HUD_STYLE, fontSize: '14px', strokeThickness: 4 }).setScrollFactor(0).setDepth(d);
      this.hud.trackBg = this.add.graphics().setScrollFactor(0).setDepth(d);
      this.hud.flag = this.add.image(0, 0, 'flag').setScale(0.22).setScrollFactor(0).setDepth(d);
      this.hud.dots = this.add.graphics().setScrollFactor(0).setDepth(d + 1);
      this.hud.slot = this.add.graphics().setScrollFactor(0).setDepth(d);
      this.hud.powerIcon = this.add.image(0, 0, 'box').setScale(0.4).setScrollFactor(0).setDepth(d + 1).setAlpha(0);
      this.hud.powerKey = this.add.text(0, 0, 'X', { ...HUD_STYLE, fontSize: '13px', strokeThickness: 4 }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(d + 1).setAlpha(0);
      this.hud.coinPips = this.add.graphics().setScrollFactor(0).setDepth(d);
      this.hud.coinIcon = this.add.image(0, 0, 'coin').setScale(0.4).setScrollFactor(0).setDepth(d);
      this.hud.msg = this.add.text(0, 120, '', { ...HUD_STYLE, fontSize: '26px' }).setOrigin(0.5).setScrollFactor(0).setDepth(d + 2).setAlpha(0);
      this.hud.hurry = this.add.text(0, 70, '', { ...HUD_STYLE, fontSize: '20px', color: '#ffd43b' }).setOrigin(0.5).setScrollFactor(0).setDepth(d + 2);
      this.layoutHud();
    }

    layoutHud() {
      if (!this.hud) return;
      const W = viewW();
      const trackW = Math.min(420, W - 320);
      const trackX = (W - trackW) / 2, trackY = 22;
      this.hud.track = { x: trackX, w: trackW, y: trackY };
      this.hud.trackBg.clear()
        .fillStyle(0x1b1f3b, 0.55).fillRoundedRect(trackX - 8, trackY - 7, trackW + 16, 14, 7)
        .fillStyle(0xffffff, 0.8).fillRoundedRect(trackX, trackY - 2, trackW, 4, 2);
      this.hud.flag.setPosition(trackX + trackW + 16, trackY - 2);
      const sx = W - 46, sy = 34;
      this.hud.slotPos = { x: sx, y: sy };
      this.hud.slot.clear()
        .fillStyle(0x1b1f3b, 0.6).fillRoundedRect(sx - 26, sy - 26, 52, 52, 12)
        .lineStyle(2, 0xffffff, 0.7).strokeRoundedRect(sx - 26, sy - 26, 52, 52, 12);
      this.hud.powerIcon.setPosition(sx, sy);
      this.hud.powerKey.setPosition(sx, sy + 30).setVisible(!window.matchMedia('(pointer: coarse)').matches);
      this.hud.coinIcon.setPosition(sx - 120, sy + 20);
      this.hud.msg.setX(W / 2);
      this.hud.hurry.setX(W / 2);
      this.drawCoinPips();
    }

    drawCoinPips() {
      const g = this.hud.coinPips;
      const p = this.hud.slotPos;
      const x0 = p.x - 106, y = p.y + 20;
      const coins = this.me ? this.me.coins : 0;
      g.clear();
      for (let i = 0; i < COINS_FOR_POWER; i++) {
        g.fillStyle(i < coins ? 0xffcc33 : 0x1b1f3b, i < coins ? 1 : 0.45);
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
      const t = !this.started ? 0 : this.me && this.me.finished ? this.me.ft : now - this.raceStart;
      this.hud.timer.setText(fmtTime(t));
      const { x, w, y } = this.hud.track;
      const g = this.hud.dots;
      g.clear();
      for (const p of this.race.roster) {
        if (this.me && p.k === this.me.key) continue;
        const s = this.stateOf(p.k);
        g.fillStyle(COLORS[p.c].num, 1).lineStyle(2, 0x1b1f3b, 1);
        g.fillCircle(x + w * s.prog, y, 6).strokeCircle(x + w * s.prog, y, 6);
      }
      if (this.me) {
        g.fillStyle(COLORS[this.me.color].num, 1).lineStyle(2.5, 0xffffff, 1);
        g.fillCircle(x + w * this.me.progress(), y, 7.5).strokeCircle(x + w * this.me.progress(), y, 7.5);
      }
      // "Hurry" countdown once someone has finished.
      if (this.firstFinishSeenAt && !this.over && this.me && !this.me.finished) {
        const left = Math.ceil((FINISH_GRACE_MS - (now - this.firstFinishSeenAt)) / 1000);
        this.hud.hurry.setText(left > 0 ? `Hurry! ${left}` : '');
      } else this.hud.hurry.setText('');
    }

    countdown() {
      const big = { ...HUD_STYLE, fontSize: '72px', strokeThickness: 10 };
      const txt = this.add.text(viewW() / 2, VIEW_H / 2 - 30, '', big).setOrigin(0.5).setScrollFactor(0).setDepth(30);
      const steps = this.race.round > 1 || this.race.total === 1 ? ['3', '2', '1', 'GO!'] : ['Race 1', '3', '2', '1', 'GO!'];
      steps.forEach((s, i) => {
        this.time.delayedCall(i * 800, () => {
          txt.setText(s).setScale(1.6).setAlpha(1).setColor(s === 'GO!' ? '#ffd43b' : '#ffffff');
          this.tweens.add({ targets: txt, scale: 1, duration: 300, ease: 'Back.easeOut' });
          if (s === 'GO!') {
            window.Sound.play('go');
            this.started = true;
            this.raceStart = this.time.now;
            this.tweens.add({ targets: txt, alpha: 0, delay: 500, duration: 300, onComplete: () => txt.destroy() });
          } else if (/^\d$/.test(s)) window.Sound.play('beep');
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
      const canMove = this.started && !this.over;
      for (const r of this.locals) {
        const inp = r.isMe ? this.readInput(canMove) : this.brains.get(r.key).think(time);
        if (!r.finished) {
          r.step(time, dt, inp, canMove);
          if (canMove && !r.respawning) {
            if (inp.powerPressed && r.power && !r.stunned) this.usePower(r);
            this.checkPickups(r, time);
            this.checkEnemies(r, time);
            if (r.x >= this.flagX - 6) this.finish(r, time);
          }
        } else {
          r.body.setVelocityX(r.body.velocity.x * 0.9);
        }
        r.sync(time);
      }
      if (this.isHost) this.hostTick(time);
      this.updateHud(time);
      this.sendNet(time);
    }

    readInput(canMove) {
      const k = this.keys;
      const touch = window.touchInput || {};
      const JD = Phaser.Input.Keyboard.JustDown, JU = Phaser.Input.Keyboard.JustUp;
      const tJump = !!touch.jump, tPow = !!touch.power;
      const inp = {
        dir: ((k.right.isDown || k.d.isDown || touch.right) ? 1 : 0) - ((k.left.isDown || k.a.isDown || touch.left) ? 1 : 0),
        jumpPressed: JD(k.up) || JD(k.w) || JD(k.space) || (tJump && !this.touchWas.jump),
        jumpReleased: JU(k.up) || JU(k.w) || JU(k.space) || (!tJump && this.touchWas.jump),
        jumpHeld: k.up.isDown || k.w.isDown || k.space.isDown || tJump,
        powerPressed: JD(k.x) || JD(k.shift) || JD(k.e) || (tPow && !this.touchWas.power),
      };
      this.touchWas.jump = tJump;
      this.touchWas.power = tPow;
      if (!canMove) { inp.jumpPressed = false; inp.powerPressed = false; }
      return inp;
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

    inView(x, y) { return this.cameras.main.worldView.contains(x, y); }

    finish(r, time) {
      if (r.finished) return;
      r.finished = true;
      r.ft = Math.round(time - this.raceStart);
      this.spawnPuff(r.x, r.y - 20, 0xffd43b, 12);
      if (!this.firstFinishSeenAt) this.firstFinishSeenAt = time;
      if (r.isMe) {
        window.Sound.play('finish');
        this.flashMsg('FINISH!', '#ffd43b');
        this.time.delayedCall(700, () => onFinished(r.ft));
      }
    }

    // Host, or the race ending for everyone.
    endRace() {
      if (this.over) return;
      this.over = true;
      if (this.me && !this.me.finished) {
        this.me.finished = true;
        this.flashMsg('Time is up!', '#ffd43b');
      }
    }

    // ---- Host: bots and the end of the race -------------------------------------
    hostTick(time) {
      if (!this.started || this.resultSent) return;
      const states = this.race.roster.map((p) => ({ k: p.k, ...this.stateOf(p.k), present: p.k === App.uid || p.b || this.remotes.get(p.k).seen }));
      const racing = states.filter((s) => s.present);
      if (racing.some((s) => s.ft) && !this.firstFinishSeenAt) this.firstFinishSeenAt = time;
      const allIn = racing.every((s) => s.ft);
      const grace = this.firstFinishSeenAt && time - this.firstFinishSeenAt > FINISH_GRACE_MS;
      if (!(allIn || grace || time - this.raceStart > MAX_RACE_MS)) return;
      this.resultSent = true;
      const order = states.slice().sort((a, b) => (a.ft && b.ft ? a.ft - b.ft : a.ft ? -1 : b.ft ? 1 : b.prog - a.prog));
      const m = App.match;
      const ft = {}, gained = {};
      order.forEach((s, i) => {
        ft[s.k] = s.ft || 0;
        gained[s.k] = s.ft ? POINTS[i] || 0 : 0;
        m.pts[s.k] = (m.pts[s.k] || 0) + gained[s.k];
      });
      m.res = { e: this.race.e, order: order.map((s) => s.k), ft, gained };
      if (!App.solo) Net.set({ m });
      onRaceOver();
    }

    // ---- Pickups and enemies --------------------------------------------------
    checkPickups(r, time) {
      for (const c of this.coinObjs) {
        if (c.takenBy.has(r.key) || Math.abs(c.x - r.x) > 18 || Math.abs(c.img.y - r.y) > 22) continue;
        c.takenBy.add(r.key);
        if (r.isMe) {
          c.img.setVisible(false);
          this.spawnPuff(c.x, c.img.y, 0xffd43b, 5);
          window.Sound.play('coin');
        }
        if (r.coins < COINS_FOR_POWER) r.coins += 1;
        if (r.coins >= COINS_FOR_POWER && !r.power) { r.coins = 0; this.givePower(r); }
        if (r.isMe) this.drawCoinPips();
      }
      for (const b of this.boxes) {
        const back = b.backAt.get(r.key) || 0;
        if (r.isMe && time >= back && !b.img.visible) b.img.setVisible(true);
        if (time < back || r.power || Math.abs(b.x - r.x) > 22 || Math.abs(b.y - r.y) > 24) continue;
        b.backAt.set(r.key, time + 3500);
        if (r.isMe) {
          b.img.setVisible(false);
          this.spawnPuff(b.x, b.y, 0x9ff0ff, 10);
          window.Sound.play('box');
        }
        this.givePower(r);
      }
    }

    givePower(r) {
      // Runners behind the leader get more attacks; the leader gets more defence and speed.
      const all = this.racerPositions();
      const n = all.length;
      const rank = 1 + all.filter((o) => o.k !== r.key && o.prog > r.progress()).length;
      const table = n === 1 ? { fire: 30, slime: 20, bolt: 20, speed: 30 }
        : rank === 1 ? { fire: 25, slime: 45, bolt: 0, speed: 30 }
        : rank === n ? { fire: 30, slime: 10, bolt: 40, speed: 20 }
        : { fire: 35, slime: 20, bolt: 20, speed: 25 };
      let roll = Math.random() * 100;
      let pick = 'fire';
      for (const [k, w] of Object.entries(table)) { if ((roll -= w) < 0) { pick = k; break; } }
      r.power = pick;
      if (r.isMe) {
        this.hud.powerIcon.setTexture(POWERS[pick].icon).setAlpha(1).setScale(0.75);
        this.tweens.add({ targets: this.hud.powerIcon, scale: 0.5, duration: 250, ease: 'Back.easeOut' });
        this.hud.powerKey.setAlpha(1);
        this.flashMsg(POWERS[pick].label + '!', '#9ff0ff');
      }
    }

    usePower(r) {
      const k = r.power;
      r.power = null;
      if (r.isMe) { this.hud.powerIcon.setAlpha(0); this.hud.powerKey.setAlpha(0); }
      const dir = r.hero.flipX ? -1 : 1;
      if (k === 'speed') {
        r.speedUntil = this.time.now + SPEED_MS;
        if (r.isMe) { this.flashMsg('Speed boost!', '#ffd43b'); window.Sound.play('speed'); }
        this.spawnPuff(r.x, r.y, 0xffd43b, 10);
        return;
      }
      const id = App.uid + '-' + Math.random().toString(36).slice(2, 7);
      let fx;
      if (k === 'fire') fx = { id, k, x: Math.round(r.x + dir * 16), y: Math.round(r.y - 2), d: dir };
      else if (k === 'slime') {
        const sx = r.x - dir * 26;
        fx = { id, k, x: Math.round(sx), y: this.groundYBelow(sx, r.body.bottom) ?? Math.round(r.body.bottom), d: dir };
      } else fx = { id, k, x: Math.round(r.x), y: 0, d: dir };
      fx.e = this.race.e;
      fx.o = r.key;
      this.myFx = [...this.myFx, fx].slice(-8);
      if (!App.solo) Net.set({ fx: this.myFx });
      this.spawnFx(fx);
    }

    updateEnemies(tRace, now) {
      const t = tRace / 1000;
      for (const e of this.enemies) {
        if (now < e.deadUntil) continue;
        if (!e.img.visible) e.img.setVisible(true).setAlpha(1).setScale(S);
        if (e.kind === 'walker') {
          const span = Math.max(1, e.R - e.L);
          const d = (t * 55) % (2 * span);
          e.img.x = e.L + (d < span ? d : 2 * span - d);
          e.img.y = e.baseY;
          e.img.setFlipX(d < span);
          e.hx = e.img.x; e.hy = e.baseY - 12;
        } else {
          e.img.x = e.cx + Math.sin(t * 0.9) * 40;
          e.img.y = e.cy + Math.sin(t * 2.6) * 30;
          e.img.setFlipX(Math.cos(t * 0.9) > 0);
          e.hx = e.img.x; e.hy = e.img.y;
        }
      }
    }

    killEnemy(e, byMe) {
      e.deadUntil = this.time.now + 8000;
      this.tweens.add({ targets: e.img, scaleY: S * 0.2, alpha: 0, duration: 250, onComplete: () => e.img.setVisible(false) });
      this.spawnPuff(e.img.x, e.img.y - 8, 0xd0bfff, 7);
      if (byMe) window.Sound.play('stomp');
    }

    checkEnemies(r, now) {
      if (now < r.invulnUntil) return;
      const b = r.body;
      for (const e of this.enemies) {
        if (now < e.deadUntil || !e.img.visible || e.hx === undefined) continue;
        if (Math.abs(e.hx - r.x) > (e.w + 18) / 2 || Math.abs(e.hy - r.y) > (e.h + 28) / 2) continue;
        if (b.velocity.y > 0 && b.bottom <= e.hy - e.h / 2 + 12) {
          this.killEnemy(e, r.isMe);
          b.setVelocityY(-CH.M.STOMP_BOUNCE);
          r.jumpsUsed = 1;
          if (r.isMe) this.addTrauma(0.25);
          r.squash(0.8, 1.25, 160);
        } else {
          r.stun(STUN_ENEMY, r.x < e.hx ? -200 : 200, -260);
        }
      }
    }

    // ---- Powers in flight ----------------------------------------------------
    spawnFx(fx) {
      if (this.seenFx.has(fx.id)) return;
      this.seenFx.add(fx.id);
      const now = this.time.now;
      const near = this.inView(fx.x, fx.y || this.camPos.y);
      if (fx.k === 'fire') {
        const img = this.add.image(fx.x, fx.y, 'fireball').setScale(S).setFlipX(fx.d < 0).setDepth(6);
        this.fx.set(fx.id, { ...fx, img, born: now });
        if (near) window.Sound.play('fire');
      } else if (fx.k === 'slime') {
        const img = this.add.image(fx.x, fx.y + 1, 'slime').setScale(S * 0.3).setOrigin(0.5, 1).setDepth(2);
        this.tweens.add({ targets: img, scale: S, duration: 250, ease: 'Back.easeOut' });
        this.fx.set(fx.id, { ...fx, img, born: now });
        if (near) window.Sound.play('slime');
      } else if (fx.k === 'bolt') {
        window.Sound.play('bolt');
        this.cameras.main.flash(120, 255, 240, 160);
        const strike = (x, y) => {
          const bolt = this.add.image(x, y - 160, 'bolt').setScale(S * 1.4).setDepth(8);
          this.tweens.add({ targets: bolt, y: y - 10, duration: 140, ease: 'Quad.easeIn', onComplete: () => {
            this.spawnPuff(x, y, 0xffe14a, 8);
            this.tweens.add({ targets: bolt, alpha: 0, duration: 250, onComplete: () => bolt.destroy() });
          } });
        };
        // Everyone ahead of the caster gets struck.
        for (const r of this.locals) {
          if (r.key === fx.o || r.x <= fx.x || r.finished) continue;
          strike(r.x, r.y);
          if (r.stun(STUN_BOLT, 0, -120) && r.isMe) this.flashMsg('Zapped!', '#ffe14a');
        }
        for (const v of this.remotes.values()) if (v.seen && v.k !== fx.o && v.img.x > fx.x && !v.ft) strike(v.img.x, v.img.y - 16);
        const view = this.cameras.main.worldView;
        for (const e of this.enemies) if (this.time.now >= e.deadUntil && view.contains(e.img.x, e.img.y)) this.killEnemy(e, false);
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
          if (now - f.born > FIRE_LIFE || this.isSolidAt(f.img.x + f.d * 8, f.img.y) || f.img.x < 0 || f.img.x > this.worldW) { this.removeFx(id, 0xff8a1a); continue; }
          for (const e of this.enemies) {
            if (now < e.deadUntil || !e.img.visible || e.hx === undefined) continue;
            if (Math.abs(e.hx - f.img.x) < 20 && Math.abs(e.hy - f.img.y) < 18) { this.killEnemy(e, false); this.removeFx(id, 0xff8a1a); break; }
          }
          if (!this.fx.has(id)) continue;
          for (const r of this.locals) {
            if (r.key === f.o || r.finished || r.respawning) continue;
            if (Math.abs(r.x - f.img.x) < 18 && Math.abs(r.y - f.img.y) < 20) {
              if (r.stun(STUN_FIRE, f.d * 240, -280) && r.isMe) this.flashMsg('Burned!', '#ff8a1a');
              this.registerHit(id);
              this.removeFx(id, 0xff8a1a);
              break;
            }
          }
        } else if (f.k === 'slime') {
          if (now - f.born > SLIME_LIFE) { this.removeFx(id); continue; }
          for (const r of this.locals) {
            if (r.key === f.o || r.finished || r.respawning) continue;
            if (Math.abs(r.x - f.x) < 20 && Math.abs(r.body.bottom - f.y) < 10) {
              const slide = (r.body.velocity.x >= 0 ? 1 : -1) * 280;
              if (r.stun(STUN_SLIME, slide, -60) && r.isMe) this.flashMsg('Slipped!', '#8fe04a');
              this.registerHit(id);
              this.removeFx(id, 0x8fe04a);
              break;
            }
          }
        }
      }
    }

    registerHit(id) {
      this.myHits = [...this.myHits, id].slice(-12);
      if (!App.solo) Net.set({ h: this.myHits });
    }

    // ---- Runners simulated elsewhere -------------------------------------------
    updateRemotes(dt, now) {
      if (App.solo) return;
      const st = roomState();
      const byUid = new Map(st.racers.map((p) => [p.u, p]));
      const host = byUid.get(this.race.h);
      const hostBots = host && host.e === this.race.e && host.bots && typeof host.bots === 'object' ? host.bots : {};
      // Powers and hits from every player in this race.
      for (const p of st.racers) {
        if (p.me || p.e !== this.race.e) continue;
        (Array.isArray(p.fx) ? p.fx : []).forEach((fx) => {
          if (fx && fx.e === this.race.e && typeof fx.id === 'string' && !this.seenFx.has(fx.id) && POWERS[fx.k] && fx.k !== 'speed') {
            this.spawnFx({ id: fx.id, k: fx.k, x: +fx.x || 0, y: +fx.y || 0, d: fx.d < 0 ? -1 : 1, o: String(fx.o || '') });
          }
        });
        (Array.isArray(p.h) ? p.h : []).forEach((id) => { if (this.fx.has(id)) this.removeFx(id, 0xffffff); });
      }
      for (const [k, v] of this.remotes) {
        const src = v.bot ? hostBots[k] : (() => { const p = byUid.get(k); return p && p.e === this.race.e && (p.st === 'race' || p.st === 'fin') ? p : null; })();
        if (!src) { v.img.setVisible(false); v.label.setVisible(false); v.stars.clear(); continue; }
        if (!v.seen) { v.img.x = +src.x || v.img.x; v.img.y = +src.y || v.img.y; }
        v.seen = true;
        v.img.setVisible(true);
        v.label.setVisible(true);
        v.prog = Phaser.Math.Clamp(+src.prog || 0, 0, 1);
        v.ft = +src.ft || 0;
        if (v.ft && !this.firstFinishSeenAt) this.firstFinishSeenAt = now;
        const tx = +src.x || v.img.x, ty = +src.y || v.img.y;
        const k2 = 1 - Math.exp(-14 * dt);
        if (Math.abs(tx - v.img.x) > 200) { v.img.x = tx; v.img.y = ty; }
        v.img.x += (tx - v.img.x) * k2;
        v.img.y += (ty - v.img.y) * k2;
        v.img.setFlipX(!!src.f);
        v.img.setAlpha(src.a === 'd' ? 0.2 : 0.95);
        v.img.setAngle((+src.vx || 0) / CH.M.RUN_SPEED * 4);
        if (src.a === 's') v.img.setTint(0xb8c2ff); else v.img.clearTint();
        v.label.setPosition(v.img.x, v.img.y - 36);
        drawStars(v.stars, v.img.x, v.img.y - 40, src.a === 's', now);
      }
    }

    sendNet(now) {
      if (App.solo || now - this.lastNetSend < 50) return;
      this.lastNetSend = now;
      const patch = this.me ? this.me.snapshot() : {};
      if (this.me && this.me.finished) patch.ft = this.me.ft;
      if (this.isHost) {
        const bots = {};
        for (const r of this.locals) if (r.isBot) bots[r.key] = r.snapshot();
        patch.bots = bots;
      }
      Net.set(patch);
    }

    // ---- Camera ---------------------------------------------------------------
    cameraTarget() {
      if (this.me) return this.me;
      // Spectating: follow whoever is in front.
      let best = null;
      for (const p of this.race.roster) {
        const s = this.stateOf(p.k);
        if (!best || s.x > best.x) best = { x: s.x, y: s.y, vx: 0 };
      }
      return best || { x: this.startX, y: 300 };
    }

    updateCamera(_time, delta) {
      const dt = Math.min(delta, 50) / 1000;
      const t0 = this.cameraTarget();
      const px = t0.x, py = t0.y;
      const vx = t0.body ? t0.body.velocity.x : 0;
      const vy = t0.body ? t0.body.velocity.y : 0;
      if (!t0.respawning) {
        const dx = px - this.camFocus.x, dy = py - this.camFocus.y;
        if (Math.abs(dx) > CAM_DEADZONE_X) this.camFocus.x += dx - Math.sign(dx) * CAM_DEADZONE_X;
        if (Math.abs(dy) > CAM_DEADZONE_Y) this.camFocus.y += dy - Math.sign(dy) * CAM_DEADZONE_Y;
        const leadGoal = Math.abs(vx) > 40 ? Math.sign(vx) * CAM_LOOK_AHEAD : this.camLead;
        this.camLead += (leadGoal - this.camLead) * (1 - Math.exp(-CAM_LEAD_RATE * dt));
      }
      const t = 1 - Math.exp(-(vy > 200 ? CAM_FOLLOW_RATE_FALLING : CAM_FOLLOW_RATE) * dt);
      this.camPos.x += (this.camFocus.x + this.camLead - this.camPos.x) * t;
      this.camPos.y += (this.camFocus.y - this.camPos.y) * t;
      this.trauma = Math.max(0, this.trauma - SHAKE_DECAY * dt);
      this.shakeTime += dt * 30;
      this.applyCamera();
    }

    applyCamera() {
      const cam = this.cameras.main;
      const W = viewW();
      const sx = Phaser.Math.Clamp(this.camPos.x - W / 2, 0, Math.max(0, this.worldW - W));
      const sy = Phaser.Math.Clamp(this.camPos.y - VIEW_H / 2, 0, Math.max(0, this.worldH - VIEW_H));
      const shake = this.trauma * this.trauma;
      const k = this.shakeTime;
      cam.setScroll(sx + SHAKE_MAX_OFFSET * shake * Math.sin(k * 1.7), sy + SHAKE_MAX_OFFSET * shake * Math.sin(k * 2.3 + 1));
      cam.setRotation(SHAKE_MAX_ROLL * shake * Math.sin(k * 1.1 + 2));
    }
  }

  // ---------------------------------------------------------------------------
  // Game size follows the screen: fixed height, width from the screen's shape.
  function gameWidth() {
    const el = $('screen');
    const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
    const aspect = Math.min(2.25, Math.max(1.35, w / h));
    return Math.round((VIEW_H * aspect) / 2) * 2;
  }

  window.game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: gameWidth(),
    height: VIEW_H,
    backgroundColor: '#7ec8f0',
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: CH.M.GRAVITY }, debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, BackdropScene, RaceScene, PodiumScene],
  });
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = gameWidth();
      if (window.game.scale.width !== w) window.game.scale.setGameSize(w, VIEW_H);
    }, 120);
  });
  window.CoinHopper = { App, roomState, matchView };
  wireUi();
})();
