// Coin Hopper app: screens, navigation, matchmaking and the match flow around the 3D race.
// Screens: loading, home, maps & modes, lobby, race HUD, results, shop, characters, settings.
(function () {
  const I = window.Icons;
  const C = window.Chars3D;
  const P = window.Profile;
  const ui = document.getElementById('ui');
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const fmtTime = (ms) => { const s = Math.max(0, ms) / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`; };
  const ord = (n) => `${n}<sup>${['st', 'nd', 'rd'][n - 1] || 'th'}</sup>`;
  const ARTIFACT_URL = 'https://claude.ai/artifact/Rzet7Wv8oJhf8PazUDPwnV';
  const BOT_NAMES = ['Zippy', 'Momo', 'Kiki', 'Pip', 'Taz', 'Nova', 'Bloop', 'Rocket', 'Sunny', 'Dash'];
  const MAPS = World3D.MAPS;
  const ROUNDS = 3;
  const POINTS = [10, 6, 3, 1];
  const QUICK_WAIT = 7000;

  const App = {
    uid: (() => { try { let u = localStorage.getItem('ch-uid'); if (!u) { u = Math.random().toString(36).slice(2, 10); localStorage.setItem('ch-uid', u); } return u; } catch (e) { return Math.random().toString(36).slice(2, 10); } })(),
    online: false, screen: null, portraits: {}, previews: {},
    mapId: 'sunny', mode: 'quick',
    room: null,          // { code, kind: 'private'|'quick'|'ranked', joinedLocal, sawHost, startedEpoch }
    race: null, view: null, match: null, finishMs: 0, rewarded: 0, quickTimer: null, chosenChar: null,
  };

  // ---------------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------------
  function toast(msg, bad) {
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    ui.append(t);
    setTimeout(() => t.remove(), 1800);
  }
  const click = () => window.Sound.play('click');
  const charName = (id) => C.byId(id).name;
  const head = (id) => (App.portraits[id] || {}).head || '';
  const full = (id) => (App.portraits[id] || {}).full || '';
  const prof = () => P.get();

  function rotation() {
    // The featured map changes every 6 hours, the same for everyone.
    const period = 6 * 3600 * 1000;
    const slot = Math.floor(Date.now() / period);
    return { slot, map: MAPS[slot % MAPS.length].id, left: period - (Date.now() % period) };
  }
  const fmtLeft = (ms) => `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;

  function logo(size = '') {
    return `<div class="logo ${size}"><div class="plate"></div><img class="crown" alt="" src="data:image/svg+xml;utf8,${encodeURIComponent(I.coin().replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'))}">
      <span class="w"><span class="b">COIN</span><span class="f">COIN</span></span><span class="w g"><span class="b">HOPPER</span><span class="f">HOPPER</span></span></div>`;
  }

  function topbar(extra = '') {
    const d = prof();
    const need = P.xpToNext(d.level);
    return `<div class="topbar">
      <div class="profile" data-act="settings" title="Profile">
        <div style="position:relative"><span class="crown">${I.crown()}</span><div class="avatar"><img alt="" src="${head(d.selected)}"></div></div>
        <div><div class="nm">${esc(d.name || 'Player')}</div>
          <div class="xp"><span class="lvl">${I.lvlstar()}${d.level}</span><span class="bar"><i style="width:${Math.min(100, (d.xp / need) * 100)}%"></i></span></div></div>
      </div>
      <div class="grow"></div>${extra}
      <div class="cur">${I.coin()}<b>${fmt(d.coins)}</b><span class="plus" data-act="shop" title="Get more">${I.plus()}</span></div>
      <div class="cur">${I.gem()}<b>${fmt(d.gems)}</b><span class="plus" data-act="extras" title="Get more">${I.plus()}</span></div>
    </div>`;
  }

  function ribbon(text, sub, subClass = '') {
    return `<div class="ribbon"><span class="star l">${I.star()}</span><span class="t">${text}</span><span class="star r">${I.star()}</span></div>${sub ? `<br><span class="subribbon ${subClass}"><span class="t">${sub}</span></span>` : ''}`;
  }

  function setScreen(id, html) {
    ui.innerHTML = `<section class="screen on" id="s-${id}">${html}</section>`;
    App.screen = id;
    bindActions(ui);
  }

  function bindActions(root) {
    $$('[data-act]', root).forEach((el) => el.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = el.dataset.act;
      click();
      if (a === 'home') goHome();
      else if (a === 'play') goMaps();
      else if (a === 'shop') goShop('characters');
      else if (a === 'extras') goShop('extras');
      else if (a === 'chars') goChars();
      else if (a === 'settings') openSettings();
    }));
  }

  // ---------------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------------
  function loading(pct, text) {
    if (App.screen !== 'load') setScreen('load', `<div class="logo-wrap">${logo()}</div><div class="loadbar"><span id="lt"></span><div class="bar"><i id="lb"></i></div></div>`);
    $('#lb').style.width = pct + '%';
    $('#lt').textContent = `${text}… ${Math.round(pct)}%`;
  }

  const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

  async function boot() {
    Race.getRenderer();
    try { await C.preload(); } catch (e) { console.warn('models', e); }
    Race.run(Race.showcase({ ids: C.CHARACTERS.map((c) => c.id), cam: { pos: [0, 1.5, 9.4], look: [0, 0.6, 0] }, anim: (i, t) => (Math.floor(t * 0.8 + i) % 3 ? 'run' : 'cheer') }));
    loading(10, 'Waking up the racers');
    await frame();
    App.portraits = C.portraits(256);
    loading(45, 'Building your course');
    await frame();
    App.previews = previews();
    loading(75, 'Connecting');
    await frame();
    const [online] = await Promise.all([Net.init(), P.connectCloud()]);
    App.online = online;
    const d = prof();
    window.Sound.setSfx(d.settings.sfx);
    window.Sound.setMusic(d.settings.music);
    Race.setQuality(d.settings.quality);
    loading(100, 'Ready');
    await new Promise((r) => setTimeout(r, 250));
    P.onChange(() => { if (['home', 'chars', 'shop', 'maps'].includes(App.screen)) refreshTop(); });
    const m = /^#room-([a-z0-9]{4,5})$/i.exec(location.hash || '');
    if (!d.name) { goHome(); openSettings(true); }
    else goHome();
    if (m && App.online) joinPrivate(m[1].toUpperCase());
  }

  function refreshTop() {
    const tb = $('.topbar');
    if (!tb) return;
    const holder = document.createElement('div');
    holder.innerHTML = topbar(App.screen === 'lobby' ? lobbyExtras() : '');
    tb.replaceWith(holder.firstElementChild);
    bindActions($('.topbar'));
  }

  // Map preview pictures, rendered from the real 3D maps.
  function previews() {
    const out = {};
    const canvas = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    r.setSize(480, 300);
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    for (const m of MAPS) {
      const scene = new THREE.Scene();
      const lv = LevelGen.generate(4242 + m.id.length);
      const w = World3D.buildCourse(scene, lv, m.id);
      const cam = new THREE.PerspectiveCamera(42, 480 / 300, 0.1, 400);
      const x = w.startX + 7;
      cam.position.set(x - 2, w.startY + 5, 13);
      cam.lookAt(x + 1, w.startY + 0.5, -4);
      w.sun.position.set(x + 6, 14, 10);
      w.sun.target.position.set(x, 0, 0);
      ['astro', 'frog', 'cat'].forEach((id, i) => {
        const p = C.create(id);
        p.root.position.set(w.startX + 4 + i * 1.6, w.startY, 0.3);
        p.root.rotation.y = -0.6;
        C.animate(p, 'run', 0.12, 7);
        scene.add(p.root);
      });
      World3D.animateWorld(w, 1, x);
      r.render(scene, cam);
      out[m.id] = canvas.toDataURL('image/jpeg', 0.85);
    }
    r.dispose();
    r.forceContextLoss && r.forceContextLoss();
    return out;
  }

  // ---------------------------------------------------------------------------------
  // Home
  // ---------------------------------------------------------------------------------
  function goHome() {
    leaveRoom();
    window.Sound.music('menu');
    Race.run(Race.showcase({
      ids: C.CHARACTERS.map((c) => c.id), cam: { pos: [0, 2.5, 12.5], look: [0, 1.95, 0] },
      positions: C.CHARACTERS.map((c, i) => ({ x: (i - 2.5) * 1.55, z: 0.6 + Math.abs(i - 2.5) * -0.15, ry: -Math.PI / 2 + (i - 2.5) * -0.16, s: 1.12 })),
    }));
    setScreen('home', `${topbar()}
      <div class="logo-wrap">${logo()}<br><span class="subribbon purple tagpill">${I.users().replace('<svg', '<svg style="width:calc(var(--u)*2.6);height:calc(var(--u)*2.6);vertical-align:middle;margin-right:calc(var(--u)*0.6)"')}<span class="t">ONLINE COMPETITION</span></span><br>
        <span class="subribbon" style="margin-top:calc(var(--u)*0.4)">${App.online ? 'UP TO 4 PLAYERS' : 'PLAY VS BOTS · ONLINE ON CLAUDE.AI'}</span></div>
      <div class="dock">
        <div class="left">
          <button class="btn blue tile" data-act="shop">${I.shop()}<span class="lbl">SHOP</span></button>
          <button class="btn purple tile" data-act="chars">${I.cat()}<span class="lbl">CHARACTERS</span></button>
        </div>
        <button class="btn big play" data-act="play"><span class="burst"></span>${I.play()}<span class="lbl">PLAY</span></button>
        <button class="btn gray tile settings" data-act="settings">${I.gear()}<span class="lbl">SETTINGS</span></button>
      </div>`);
  }

  // ---------------------------------------------------------------------------------
  // Maps & modes
  // ---------------------------------------------------------------------------------
  function goMaps() {
    leaveRoom();
    const rot = rotation();
    if (!App.mapPicked) App.mapId = rot.map;
    Race.run(Race.showcase({
      ids: ['astro', 'frog', 'cat', 'robot', 'penguin', 'fox'], cam: { pos: [0, 2.2, 9.6], look: [0, 2.4, 0] }, map: App.mapId,
      positions: [{ x: -5.6, z: 0.8, ry: -1.2 }, { x: -4.3, z: 0.6, ry: -1.4 }, { x: 3.6, z: 0.7, ry: -1.9 }, { x: 4.6, z: 0.5, ry: -1.8 }, { x: 5.6, z: 0.8, ry: -2.0 }, { x: 6.6, z: 0.4, ry: -2.1 }],
    }));
    const modes = [
      { id: 'quick', icon: I.flags(), name: 'QUICK MATCH', sub: App.online ? 'Find online players now!' : 'Race 3 bots now!' },
      { id: 'private', icon: I.users(), name: 'PRIVATE ROOM', sub: 'Play with friends (invite code)' },
      { id: 'ranked', icon: I.trophy(), name: 'RANKED RACE', sub: 'Compete online, climb the ranks and earn rewards!' },
    ];
    setScreen('maps', `${topbar()}
      <div class="head">${ribbon('MAPS &amp; MODES')}<br><span class="strip">PLAY ONLINE • ROTATING MAPS • COMPETE WITH PLAYERS WORLDWIDE!</span></div>
      <button class="btn blue sq navarrow l" data-nav="-1" aria-label="Previous map">${I.chevL().replace(/#141833/g, '#fff')}</button>
      <button class="btn blue sq navarrow r" data-nav="1" aria-label="Next map">${I.chevR().replace(/#141833/g, '#fff')}</button>
      <div class="mapcards">${MAPS.map((m) => `
        <div class="mapcard ${m.id === App.mapId ? 'sel' : ''}" data-map="${m.id}">
          ${m.id === App.mapId ? `<span class="subribbon selected">${I.check().replace('<svg', '<svg style="width:calc(var(--u)*2.2);height:calc(var(--u)*2.2);vertical-align:middle"')} SELECTED</span>` : ''}
          <div class="img" style="background-image:url(${App.previews[m.id]})"></div>
          <div class="name" style="background:linear-gradient(${m.color}, ${shade(m.color)})">${I[m.icon]()}<span class="t">${m.name.toUpperCase()}</span></div>
          <div class="blurb">${m.blurb}</div>
        </div>`).join('')}</div>
      <div class="rotbar">${I.refresh()}<span>ROTATING MAPS</span><span class="sep"></span><span style="font-family:var(--body);font-weight:900">Featured now: ${MAPS.find((m) => m.id === rot.map).name}</span><span class="sep"></span>${I.calendar()}<span>Next Rotation: ${fmtLeft(rot.left)}</span></div>
      <div class="modes">${modes.map((m) => `
        <div class="mode ${App.mode === m.id ? 'sel' : ''}" data-mode="${m.id}">
          ${App.mode === m.id ? `<span class="check">${I.check()}</span>` : ''}${m.id === 'ranked' ? `<span class="season">SEASON 1</span>` : ''}
          ${m.icon}<div><b>${m.name}</b><small>${m.sub}</small></div></div>`).join('')}</div>
      <button class="btn big go" id="go"><span class="burst"></span>${I.play()}<span class="lbl">START MATCH</span></button>
      <button class="btn gray sq" data-act="home" style="position:absolute;left:calc(var(--u)*2);bottom:calc(var(--u)*2.4)" aria-label="Back">${I.back()}</button>`);
    $$('.mapcard').forEach((el) => el.addEventListener('click', () => { click(); App.mapId = el.dataset.map; App.mapPicked = true; goMaps(); }));
    $$('[data-nav]').forEach((el) => el.addEventListener('click', () => { click(); const i = MAPS.findIndex((m) => m.id === App.mapId); App.mapId = MAPS[(i + +el.dataset.nav + MAPS.length) % MAPS.length].id; App.mapPicked = true; goMaps(); }));
    $$('.mode').forEach((el) => el.addEventListener('click', () => { click(); App.mode = el.dataset.mode; goMaps(); }));
    $('#go').addEventListener('click', () => { click(); startMode(); });
  }

  function shade(hex) {
    const c = new THREE.Color(hex);
    c.multiplyScalar(0.62);
    return '#' + c.getHexString();
  }

  function startMode() {
    if (App.mode === 'private') return privateChooser();
    if (App.mode === 'ranked' && !App.online) return toast('Ranked races need online play (open the game on claude.ai).', true);
    if (!App.online) return startSolo();
    quickMatch(App.mode === 'ranked');
  }

  function privateChooser() {
    if (!App.online) return toast('Private rooms need online play (open the game on claude.ai).', true);
    modal(`<h2>PRIVATE ROOM</h2>
      <div class="setrow"><span>Create a room for friends</span><button class="btn small" id="mk">${I.plus()}<span class="lbl">CREATE</span></button></div>
      <div class="setrow"><input type="text" id="code" class="codeinput" maxlength="5" placeholder="CODE" aria-label="Room code"><button class="btn small blue" id="jn"><span class="lbl">JOIN</span></button></div>
      <p class="note">Friends join by opening your invite link, or by typing your room code here.</p>`, (m) => {
      $('#mk', m).onclick = () => { click(); closeModal(); joinPrivate(randomCode()); };
      $('#jn', m).onclick = () => { const c = ($('#code', m).value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length < 4) return toast('Type the 4-letter code', true); click(); closeModal(); joinPrivate(c); };
    });
  }

  function randomCode() {
    const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join('');
  }

  // ---------------------------------------------------------------------------------
  // Rooms
  // ---------------------------------------------------------------------------------
  function myPresence() {
    const d = prof();
    return { u: App.uid, n: d.name || 'Player', c: d.selected, lv: d.level, up: P.upgradesOf(d.selected) };
  }

  async function enterRoom(name, kind, code) {
    leaveRoom(true);
    App.room = { name, kind, code, joinedLocal: performance.now(), sawHost: false, startedEpoch: 0 };
    App.match = null;
    try { await Net.join(name); } catch (e) { App.room = null; toast('Could not join that room. Check the code and try again.', true); return false; }
    Net.set({ ...myPresence(), j: Date.now(), st: 'lobby', rd: 0, e: 0, map: App.mapId, kd: kind });
    return true;
  }

  function leaveRoom(silent) {
    clearTimeout(App.quickTimer);
    if (App.room) { App.room = null; Net.leave(); if (!silent) try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* not allowed */ } }
  }

  function roomPeople() {
    const all = Net.peers().filter((p) => p.j && p.u);
    all.sort((a, b) => a.j - b.j || (a.peer < b.peer ? -1 : 1));
    const racers = all.slice(0, 4);
    return { racers, host: racers[0], me: racers.find((p) => p.me), full: !racers.some((p) => p.me) && all.some((p) => p.me) };
  }
  const amHost = () => !App.room || (roomPeople().host || {}).me;

  async function joinPrivate(code) {
    window.Sound.unlock();
    if (!(await enterRoom('room-' + code.toLowerCase(), 'private', code))) return;
    try { history.replaceState(null, '', '#room-' + code.toLowerCase()); } catch (e) { /* not allowed */ }
    goLobby();
  }

  async function quickMatch(ranked) {
    const rot = rotation();
    const map = App.mapPicked ? App.mapId : rot.map;
    const name = `${ranked ? 'rk' : 'qm'}-${map}-${rot.slot % 1000}`;
    if (!(await enterRoom(name, ranked ? 'ranked' : 'quick'))) return;
    App.mapId = map;
    const startAt = Date.now() + QUICK_WAIT;
    const show = () => {
      if (!App.room || App.screen !== 'finding') return;
      const st = roomPeople();
      const left = Math.max(0, Math.ceil((startAt - Date.now()) / 1000));
      $('#fc').textContent = `${st.racers.length}/4 players found`;
      $('#ft').textContent = left ? `Starting in ${left}…` : 'Starting…';
      $('#fs').innerHTML = st.racers.map((p) => `<div class="avatar" style="width:calc(var(--u)*9);height:calc(var(--u)*9)"><img alt="" src="${head(p.c)}"></div>`).join('') +
        Array.from({ length: 4 - st.racers.length }, () => `<div class="avatar" style="width:calc(var(--u)*9);height:calc(var(--u)*9);background:rgba(255,255,255,0.15);opacity:.6"></div>`).join('');
    };
    setScreen('finding', `${topbar()}
      <div class="panel goldrim" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:calc(var(--u)*56);padding:calc(var(--u)*2.6);text-align:center">
        ${ribbon(ranked ? 'RANKED RACE' : 'QUICK MATCH', MAPS.find((m) => m.id === map).name.toUpperCase())}
        <div id="fs" style="display:flex;gap:calc(var(--u)*1.4);justify-content:center;margin:calc(var(--u)*3) 0 calc(var(--u)*1.6)"></div>
        <div id="fc" class="display" style="font-size:calc(var(--u)*3)"></div>
        <div id="ft" class="note" style="margin-top:calc(var(--u)*0.8);font-size:calc(var(--u)*2)"></div>
        <p class="note">Empty spots are filled with bots.</p>
        <button class="btn gray" id="cx" style="margin-top:calc(var(--u)*1)"><span class="lbl">CANCEL</span></button>
      </div>`);
    $('#cx').onclick = () => { click(); goMaps(); };
    const tick = () => {
      if (!App.room || App.screen !== 'finding') return;
      show();
      const st = roomPeople();
      if (st.host && st.host.me && (Date.now() >= startAt || st.racers.length >= 4)) hostStartRace(true);
      else App.quickTimer = setTimeout(tick, 400);
    };
    tick();
  }

  // ---------------------------------------------------------------------------------
  // Lobby (private rooms)
  // ---------------------------------------------------------------------------------
  function lobbyExtras() {
    const n = App.room ? roomPeople().racers.length : 1;
    return `<span class="chip">${I.users()}${n}/4</span><span class="chip" title="${Net.connected() ? 'Connected' : 'Reconnecting'}">${Net.connected() ? I.wifi() : I.wifiOff()}</span>`;
  }

  function goLobby() {
    if (!App.room) return goMaps();
    window.Sound.music('menu');
    Race.run(Race.showcase({ ids: [], map: hostMap(), cam: { pos: [0, 2.6, 9.6], look: [0, 2.2, 0] } }));
    setScreen('lobby', `${topbar(lobbyExtras())}
      <div class="titlewrap">${ribbon('ONLINE LOBBY', 'UP TO 4 FRIENDS')}<br><span class="codebox">ROOM CODE <b>${esc(App.room.code || '')}</b></span></div>
      <div class="slots" id="slots"></div>
      <div class="mapbox" id="mapbox"></div>
      <div class="pop panel" id="chatpop"></div>
      <div class="pop panel emo" id="emopop"></div>
      <div class="dock">
        <button class="btn blue tile" id="chat">${I.chat()}<span class="lbl">CHAT</span></button>
        <button class="btn blue tile" id="emo">${I.emoji()}<span class="lbl">EMOTES</span></button>
        <button class="btn big ready" id="ready"><span class="burst"></span>${I.play()}<span class="lbl">READY</span></button>
        <button class="btn purple" id="invite" style="font-size:calc(var(--u)*3.4);padding:calc(var(--u)*1.4) calc(var(--u)*3)">${I.userplus()}<span class="lbl">INVITE FRIENDS</span></button>
        <button class="btn gray tile settings" id="leave">${I.back()}<span class="lbl">LEAVE</span></button>
      </div>`);
    const phrases = ['Hi! 👋', 'Ready!', 'Good luck!', 'One more?', 'Wait for me!', 'GG!'];
    const emos = ['😀', '😎', '🔥', '😂', '😱', '👑', '🐸', '💥'];
    $('#chatpop').innerHTML = phrases.map((p) => `<button data-say="${esc(p)}">${esc(p)}</button>`).join('');
    $('#emopop').innerHTML = emos.map((p) => `<button data-say="${p}">${p}</button>`).join('');
    $('#chat').onclick = () => { click(); $('#emopop').classList.remove('on'); $('#chatpop').classList.toggle('on'); };
    $('#emo').onclick = () => { click(); $('#chatpop').classList.remove('on'); $('#emopop').classList.toggle('on'); $('#emopop').style.left = 'calc(var(--u)*14)'; };
    $$('[data-say]').forEach((b) => b.onclick = () => { click(); Net.set({ em: { t: Date.now(), s: b.dataset.say.slice(0, 20) } }); $$('.pop').forEach((p) => p.classList.remove('on')); });
    $('#ready').onclick = () => {
      click();
      const st = roomPeople();
      if (st.host && st.host.me) {
        const notReady = st.racers.filter((p) => !p.me && !p.rd);
        if (notReady.length) return toast(`Waiting for ${notReady.map((p) => p.n).join(', ')} to be ready`, true);
        hostStartRace(true);
      } else Net.set({ rd: (st.me && st.me.rd) ? 0 : 1 });
    };
    $('#invite').onclick = () => { click(); inviteModal(); };
    $('#leave').onclick = () => { click(); goMaps(); };
    renderLobby();
  }

  function hostMap() {
    const st = App.room ? roomPeople() : null;
    return (st && st.host && st.host.map) || App.mapId;
  }

  function renderLobby() {
    if (App.screen !== 'lobby' || !App.room) return;
    const st = roomPeople();
    const now = Date.now();
    $('#slots').innerHTML = [0, 1, 2, 3].map((i) => {
      const p = st.racers[i];
      if (!p) return `<div class="slot empty" data-inv="1"><div class="art"><svg class="ghost" viewBox="0 0 60 60"><circle cx="30" cy="20" r="12" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="5 4"/><path d="M8 56c0-14 10-22 22-22s22 8 22 22" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="5 4"/><path d="M30 26v16M22 34h16" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg></div><span class="pn">P${i + 1}</span><div class="nm">INVITE FRIEND</div></div>`;
      const lead = i === 0;
      const em = p.em && now - p.em.t < 4000 ? `<span class="bubble">${esc(p.em.s)}</span>` : '';
      return `<div class="slot ${lead ? 'lead' : ''}">${lead ? `<span class="crownabove">${I.crown()}</span>` : ''}${em}
        <div class="art"><img alt="" src="${full(p.c)}"></div><span class="pn">P${i + 1}</span><span class="ready ${lead || p.rd ? 'on' : ''}" title="${lead || p.rd ? 'Ready' : 'Not ready'}"></span>
        <div class="nm">${esc(p.n)}${p.me ? ' (you)' : ''}</div>${lead ? '<div class="leader">👑 PARTY LEADER</div>' : ''}</div>`;
    }).join('');
    $$('[data-inv]').forEach((el) => el.onclick = () => { click(); inviteModal(); });
    const isHost = st.host && st.host.me;
    const map = World3D.mapById(hostMap());
    $('#mapbox').innerHTML = `<span class="pill lbl">${I.refresh().replace('<svg', '<svg style="width:calc(var(--u)*2.6);height:calc(var(--u)*2.6)"')}<span class="t">ROTATING MAP</span></span>
      <div class="img" style="background-image:url(${App.previews[map.id]})"></div>
      ${isHost ? `<span class="arr l" data-m="-1">${I.chevL()}</span><span class="arr r" data-m="1">${I.chevR()}</span>` : ''}
      <div class="nm">${map.name}</div>`;
    $$('[data-m]').forEach((el) => el.onclick = () => { click(); const i = MAPS.findIndex((m) => m.id === map.id); App.mapId = MAPS[(i + +el.dataset.m + MAPS.length) % MAPS.length].id; Net.set({ map: App.mapId }); setTimeout(renderLobby, 60); });
    const rb = $('#ready');
    if (isHost) { const waiting = st.racers.filter((p) => !p.me && !p.rd).length; rb.querySelector('.lbl').textContent = waiting ? `WAITING (${waiting})` : 'START'; }
    else rb.querySelector('.lbl').textContent = st.me && st.me.rd ? 'NOT READY' : 'READY';
    const chips = $$('.topbar .chip');
    if (chips[0]) chips[0].innerHTML = `${I.users()}${st.racers.length}/4`;
    if (chips[1]) chips[1].innerHTML = Net.connected() ? I.wifi() : I.wifiOff();
  }

  function inviteUrl() {
    const base = window.claude ? ARTIFACT_URL : location.href.split('#')[0];
    return `${base}#room-${(App.room && App.room.code || '').toLowerCase()}`;
  }

  function inviteModal() {
    const url = inviteUrl();
    modal(`<h2>INVITE FRIENDS</h2>
      <div class="note">Send this link. Friends who open it land in your room. Room code: <b style="color:#ffd23f">${esc(App.room.code)}</b></div>
      <div class="link">${esc(url)}</div>
      <div style="display:flex;gap:calc(var(--u)*1.2);justify-content:center">
        <button class="btn blue" id="cp">${I.link()}<span class="lbl">COPY LINK</span></button>
        <a class="btn green" id="wa" href="https://wa.me/?text=${encodeURIComponent('Race me in Coin Hopper! ' + url)}" target="_blank" rel="noopener" style="text-decoration:none">${I.share()}<span class="lbl">WHATSAPP</span></a>
      </div>
      <p class="note" style="margin-top:calc(var(--u)*1.4)">Friends need a claude.ai account with access to this game (Share menu at the top of the page).</p>`, (m) => {
      $('#cp', m).onclick = () => {
        click();
        try { navigator.clipboard.writeText(url).then(() => toast('Link copied!'), () => toast('Select the link above and copy it', true)); } catch (e) { toast('Select the link above and copy it', true); }
      };
    }, 'invitebox');
  }

  // ---------------------------------------------------------------------------------
  // Starting races
  // ---------------------------------------------------------------------------------
  function botRoster(roster, map) {
    const used = new Set(roster.map((p) => p.c));
    const free = C.CHARACTERS.map((c) => c.id).filter((id) => !used.has(id));
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    for (let i = roster.length; i < 4; i++) {
      const c = free.splice(Math.floor(Math.random() * free.length), 1)[0] || 'robot';
      roster.push({ k: `${App.uid}-b${i}`, n: names[i], c, b: 1, sk: Math.round((0.55 + Math.random() * 0.4) * 100) / 100, up: {} });
    }
    return roster;
  }

  function startSolo() {
    const d = prof();
    const roster = botRoster([{ k: App.uid, n: d.name || 'Player', c: d.selected, up: P.upgradesOf(d.selected) }], App.mapId);
    App.match = { kind: 'solo', round: 1, total: 1, pts: {}, names: {} };
    beginRace({ e: 1, s: Math.floor(Math.random() * 1e9), map: App.mapId, round: 1, total: 1, h: App.uid, roster, kind: 'solo' }, true);
  }

  function hostStartRace(newMatch) {
    const st = roomPeople();
    const kind = App.room.kind;
    let m = App.match;
    if (newMatch || !m || m.round >= m.total) m = App.match = { round: 0, total: kind === 'private' ? ROUNDS : 1, pts: {}, names: {}, res: null, kind };
    m.round += 1;
    m.res = null;
    const roster = st.racers.map((p) => ({ k: p.u, n: String(p.n || 'Player').slice(0, 14), c: C.byId(p.c).id, up: p.up || {} }));
    // Two players with the same character: the later one switches to a free one.
    const seen = new Set();
    roster.forEach((p) => { if (seen.has(p.c)) p.c = C.CHARACTERS.map((c) => c.id).find((id) => !seen.has(id)); seen.add(p.c); });
    botRoster(roster);
    roster.forEach((p) => { if (!(p.k in m.pts)) m.pts[p.k] = 0; m.names[p.k] = [p.n, p.c, p.b || 0]; });
    let maxE = App.room.startedEpoch;
    st.racers.forEach((p) => { if (p.race && p.race.e > maxE) maxE = p.race.e; });
    const baseMap = hostMap();
    const map = kind === 'private' && m.round > 1 ? MAPS[(MAPS.findIndex((x) => x.id === baseMap) + m.round - 1) % MAPS.length].id : baseMap;
    const race = { e: maxE + 1, s: Math.floor(Math.random() * 1e9), map, round: m.round, total: m.total, h: App.uid, roster, kind };
    Net.set({ race, m, rd: 0 });
    beginRace(race, false);
  }

  function beginRace(race, solo) {
    clearTimeout(App.quickTimer);
    if (App.room) App.room.startedEpoch = Math.max(App.room.startedEpoch, race.e);
    App.race = race;
    App.finishMs = 0;
    App.shownRes = 0;
    const inRoster = race.roster.some((p) => p.k === App.uid);
    if (!solo) Net.set({ st: inRoster ? 'race' : 'watch', e: race.e, ft: 0, prog: 0, fx: [], h: [], bots: {}, res: null });
    window.Sound.music('race');
    setScreen('race', raceHud(race));
    wireHud();
    App.view = Race.start({
      seed: race.s, mapId: race.map, roster: race.roster, myKey: inRoster ? App.uid : '__spectator', isHost: race.h === App.uid, hostKey: race.h,
      solo, ranked: race.kind === 'ranked', e: race.e, hud: App.hud,
      onFinished: (ms) => { App.finishMs = ms; setTimeout(() => { if (App.screen === 'race' && !App.shownRes) showResults(false); }, 1400); },
      onRaceOver: (res) => hostRaceOver(res),
    });
  }

  // Host: score the race and tell everyone.
  function hostRaceOver(res) {
    const m = App.match;
    res.gained = {};
    res.order.forEach((k, i) => { const g = res.ft[k] ? POINTS[i] || 0 : 0; res.gained[k] = g; m.pts[k] = (m.pts[k] || 0) + g; });
    m.res = res;
    if (App.room) Net.set({ m, res });
    raceOver(res);
  }

  function raceOver(res) {
    if (!App.race || res.e !== App.race.e || App.shownRes === res.e) return;
    App.shownRes = res.e;
    if (App.view && App.view.endRace) App.view.endRace();
    // Rewards for me, once per race.
    if (App.rewarded !== `${App.race.s}-${res.e}` && App.race.roster.some((p) => p.k === App.uid)) {
      App.rewarded = `${App.race.s}-${res.e}`;
      const place = res.order.indexOf(App.uid) + 1;
      const humans = App.race.roster.filter((p) => !p.b).length;
      App.lastReward = P.reward({ place, players: humans, coinsPicked: App.view ? App.view.myResultCoins() : 0, ranked: App.race.kind === 'ranked', finished: !!res.ft[App.uid], timeMs: res.ft[App.uid] });
      App.lastPlace = place;
    }
    showResults(true);
  }

  // ---------------------------------------------------------------------------------
  // Race HUD
  // ---------------------------------------------------------------------------------
  function raceHud(race) {
    const humans = race.roster.filter((p) => !p.b).length;
    const kindLabel = race.kind === 'solo' ? 'VS BOTS' : race.kind === 'ranked' ? 'RANKED RACE' : race.kind === 'quick' ? 'ONLINE RACE' : 'PRIVATE ROOM';
    return `<div class="statusfx" id="sfx"></div><div class="tags" id="tags"></div>
      <div class="minilogo">${logo()}</div>
      <div class="modepill">${I.users()}<div>${kindLabel}<small>${humans} PLAYER${humans > 1 ? 'S' : ''} · ${race.roster.length - humans} BOT${race.roster.length - humans === 1 ? '' : 'S'}</small></div></div>
      <div class="board" id="board"></div>
      <div class="track" id="track"><div class="fill" id="fill"></div><span class="flag">${I.flag()}</span></div>
      <div class="lap">RACE <b>${race.round}/${race.total}</b></div>
      <div class="timer" id="timer">0:00.00</div>
      <div class="hurry" id="hurry" hidden></div>
      <div class="tr"><button class="btn gray sq" id="hset" aria-label="Settings">${I.gear()}</button><button class="btn purple sq" id="hpause" aria-label="Leave race">${I.pause()}</button></div>
      <div class="countdown" id="cd"></div>
      <div class="ctl l touchonly"><div class="bubblebtn" data-k="left">${I.left()}</div><div class="bubblebtn" data-k="right">${I.right()}</div></div>
      <div class="jumpwrap touchonly"><div class="bubblebtn jump" data-k="jump">${I.up()}</div></div>
      <div class="tray">${Race.POWER_KINDS.map((k, i) => `<div class="pw ${k} empty" data-pw="${k}" title="${k}"><span class="n">0</span><span class="k keyonly">${i + 1}</span></div>`).join('')}</div>`;
  }

  function wireHud() {
    window.touchInput = { left: false, right: false, jump: false };
    $$('.bubblebtn').forEach((b) => {
      const k = b.dataset.k;
      const set = (on) => { window.touchInput[k] = on; b.classList.toggle('down', on); };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) { /* old browser */ } set(true); if (k === 'jump' && App.hud.onJump) App.hud.onJump(); window.Sound.unlock(); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, () => set(false)));
    });
    $$('.pw').forEach((el) => {
      const c = World3D.iconCanvas(World3D.POWER_STYLE[el.dataset.pw].icon, 96);
      el.prepend(c);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); if (App.hud.onPower) App.hud.onPower(el.dataset.pw); });
    });
    $('#hset').onclick = () => { click(); openSettings(); };
    $('#hpause').onclick = () => {
      click();
      modal(`<h2>PAUSED</h2><p class="note" style="text-align:center">${App.room ? 'The race keeps going for the others.' : ''}</p>
        <div style="display:flex;gap:calc(var(--u)*1.4);justify-content:center"><button class="btn green" id="rs"><span class="lbl">RESUME</span></button><button class="btn red" id="qt"><span class="lbl">LEAVE RACE</span></button></div>`, (m) => {
        $('#rs', m).onclick = () => { click(); closeModal(); };
        $('#qt', m).onclick = () => { click(); closeModal(); Race.stop(); goHome(); };
      });
    };
    let lastCd = null;
    App.hud = {
      onPower: null, onJump: null,
      countdown(n) {
        if (n === lastCd) return;
        lastCd = n;
        const el = $('#cd');
        if (!el) return;
        if (n > 3) { el.textContent = ''; return; }
        el.className = 'countdown';
        el.textContent = n;
        el.style.animation = 'none'; void el.offsetWidth; el.style.animation = 'pop 0.35s';
        window.Sound.play('beep');
      },
      go() { const el = $('#cd'); if (!el) return; el.className = 'countdown go'; el.textContent = 'GO!'; el.style.animation = 'pop 0.35s'; setTimeout(() => { if (el) el.textContent = ''; }, 800); },
      toast(kind) { toast({ ice: '❄️ Ice ready!', slime: '🟢 Slime ready!', boost: '⚡ Boost ready!', shield: '🛡️ Shield ready!' }[kind]); },
      flash(msg) { toast(msg, true); },
      update(s) {
        if (App.screen !== 'race') return;
        $('#timer').textContent = fmtTime(s.time * 1000);
        const race = App.race;
        const board = $('#board');
        board.innerHTML = s.ranks.map((p, i) => `<div class="row ${p.k === s.myKey ? 'me' : ''}"><span class="pl">${ord(i + 1)}</span><span class="av"><img alt="" src="${head(p.c)}"></span><span class="nm">${esc(p.n)}</span>${i === 0 ? I.crown().replace('<svg', '<svg style="width:calc(var(--u)*2.6);height:calc(var(--u)*2.6)"') : ''}</div>`).join('');
        const track = $('#track');
        let marks = '';
        let mine = 0;
        s.ranks.forEach((p) => { if (p.k === s.myKey) mine = p.prog; marks += `<span class="mk ${p.k === s.myKey ? 'me' : ''}" style="left:calc(${3 + p.prog * 90}%)"><img alt="" src="${head(p.c)}"></span>`; });
        track.querySelectorAll('.mk').forEach((n) => n.remove());
        track.insertAdjacentHTML('beforeend', marks);
        $('#fill').style.width = `calc(${mine * 92}% )`;
        $('#tags').innerHTML = s.tags.map((t) => `<div class="tag ${t.rank === 1 ? 'first' : ''} ${t.me ? 'me' : ''}" style="left:${t.x * 100}%;top:${t.y * 100}%">${t.rank === 1 ? `<span class="cr">${I.crown()}</span>` : ''}<span class="t">${ord(t.rank)}</span></div>`).join('');
        if (s.powers) $$('.pw').forEach((el) => {
          const n = s.powers[el.dataset.pw] || 0;
          el.querySelector('.n').textContent = n;
          el.classList.toggle('empty', !n);
          el.classList.toggle('ready', n > 0 && s.cooldown <= 0);
        });
        const h = $('#hurry');
        if (s.hurry > 0) { h.hidden = false; h.textContent = `HURRY! ${s.hurry}`; } else h.hidden = true;
        $('#sfx').className = 'statusfx ' + (s.status.frozen ? 'frozen' : s.status.slow ? 'slow' : s.status.boost ? 'boost' : '');
      },
    };
  }

  // ---------------------------------------------------------------------------------
  // Results and podium
  // ---------------------------------------------------------------------------------
  function showResults(final) {
    const race = App.race;
    if (!race) return;
    const m = App.match || {};
    const res = final ? (m.res && m.res.e === race.e ? m.res : null) || App.finalRes : null;
    App.screen = 'results';
    const order = res ? res.order : race.roster.map((p) => p.k);
    const rosterOf = (k) => race.roster.find((p) => p.k === k) || { n: '?', c: 'astro' };
    const rows = order.map((k, i) => {
      const p = rosterOf(k);
      const ft = res ? res.ft[k] : k === App.uid ? App.finishMs : 0;
      const gain = res && res.gained ? res.gained[k] : 0;
      return `<div class="row ${k === App.uid ? 'me' : ''}"><span class="medal m${Math.min(4, i + 1)}">${res ? i + 1 : '–'}</span><span class="av"><img alt="" src="${head(p.c)}"></span>
        <span class="nm">${esc(p.n)}${k === App.uid ? ' (you)' : ''}${p.b ? ' 🤖' : ''}</span><span class="tm">${ft ? fmtTime(ft) : res ? 'DNF' : 'running…'}</span>${res && race.total > 1 ? `<span class="gain">+${gain}</span>` : ''}</div>`;
    }).join('');
    const rw = final ? App.lastReward : null;
    const d = prof();
    const place = App.lastPlace;
    const title = !res ? 'FINISHED!' : place === 1 ? 'YOU WIN!' : place ? `YOU PLACED ${['1ST', '2ND', '3RD', '4TH'][place - 1]}` : 'RACE OVER';
    const standings = res && race.total > 1 ? Object.entries(m.pts || {}).sort((a, b) => b[1] - a[1]).map(([k, pts]) => {
      const info = (m.names && m.names[k]) || ['?', 'astro'];
      const top = Math.max(1, ...Object.values(m.pts));
      return `<div class="srow"><span class="av" style="width:calc(var(--u)*3);height:calc(var(--u)*3);border-radius:50%;overflow:hidden;position:relative;border:2px solid #fff"><img alt="" src="${head(info[1])}" style="position:absolute;inset:-10%;width:120%"></span>${esc(info[0])}<span class="b2"><i style="width:${(pts / top) * 100}%;background:${C.byId(info[1]).ui}"></i></span><b>${pts}</b></div>`;
    }).join('') : '';
    const isHost = amHost();
    const last = !App.room || race.round >= race.total;
    const html = `<div class="titlewrap">${ribbon(title, race.total > 1 ? `RACE ${race.round} OF ${race.total}` : World3D.mapById(race.map).name.toUpperCase())}</div>
      <div class="panel res">${rows}</div>
      <div class="panel goldrim rewards">${rw ? `<h3>REWARDS</h3>
        <div class="items"><div class="item">${I.coin()}+${fmt(rw.coins)}</div><div class="item">${I.gem()}+${rw.gems}</div><div class="item">${I.lvlstar()}+${rw.xp} XP</div></div>
        <div class="xp" style="justify-content:center"><span class="lvl">${I.lvlstar()}${d.level}</span><span class="bar" style="width:calc(var(--u)*22)"><i style="width:${(d.xp / P.xpToNext(d.level)) * 100}%"></i><span class="txt">${d.xp} / ${P.xpToNext(d.level)} XP</span></span></div>
        ${rw.levelUps ? `<div class="lvlup">LEVEL UP! +${rw.levelUps * 5} GEMS</div>` : ''}
        ${rw.rank ? `<div class="note" style="margin-top:calc(var(--u)*1)">Rank ${rw.rank > 0 ? '+' : ''}${rw.rank} · ${P.rank().label}</div>` : ''}
        ${standings ? `<div class="standings">${standings}</div>` : ''}` : `<h3>WAITING FOR THE OTHERS…</h3><p class="note">The race ends when everyone finishes, or 20 seconds after the winner.</p>`}</div>
      <div class="dock">${res ? `
        <button class="btn gray" id="rh">${I.back()}<span class="lbl">HOME</span></button>
        ${!last && isHost ? `<button class="btn green big" id="rn" style="font-size:calc(var(--u)*3.6)"><span class="lbl">NEXT RACE</span></button>` : ''}
        ${!last && !isHost ? `<span class="chip">Waiting for the host…</span>` : ''}
        ${last && App.room && race.kind === 'private' ? `<button class="btn big" id="rp" style="font-size:calc(var(--u)*3.6)"><span class="lbl">PODIUM</span></button>` : ''}
        ${last && (!App.room || race.kind !== 'private') ? `<button class="btn big" id="ra" style="font-size:calc(var(--u)*3.6)">${I.play()}<span class="lbl">PLAY AGAIN</span></button>` : ''}` : ''}
      </div>`;
    const sec = document.createElement('section');
    sec.className = 'screen on';
    sec.id = 's-results';
    sec.innerHTML = html;
    $$('#s-results').forEach((n) => n.remove());
    $('#s-race') ? $('#s-race').after(sec) : ui.append(sec);
    if ($('#s-race')) ['.tray', '.ctl', '.jumpwrap', '.countdown'].forEach((q) => $$(q, $('#s-race')).forEach((n) => n.remove()));
    const b = (id, fn) => { const el = $('#' + id); if (el) el.onclick = () => { click(); fn(); }; };
    b('rh', () => { Race.stop(); goHome(); });
    b('rn', () => hostStartRace(false));
    b('rp', () => podium());
    b('ra', () => { Race.stop(); if (App.room) { const ranked = race.kind === 'ranked'; leaveRoom(true); quickMatch(ranked); } else startSolo(); });
    if (res && rw && App.lastPlace === 1) window.Sound.play('win');
    if (res && last && App.room && race.kind === 'private') setTimeout(() => { if (App.screen === 'results' && App.race === race) podium(); }, 4500);
  }

  function podium() {
    const m = App.match;
    if (!m) return goHome();
    const order = Object.entries(m.pts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const ids = order.map(([k]) => (m.names[k] || ['', 'astro'])[1]);
    const xs = [0, -1.9, 1.9], hs = [1.2, 0.8, 0.5], cols = [0xffc23f, 0xd6dce8, 0xe0904f];
    Race.run(Race.showcase({
      ids, cam: { pos: [0, 2.4, 8], look: [0, 1.4, 0] },
      positions: ids.map((_, i) => ({ x: xs[i], y: hs[i], z: 0.4, ry: -Math.PI / 2, s: i === 0 ? 1.25 : 1.05 })),
      pedestals: ids.map((_, i) => ({ x: xs[i], h: hs[i], color: cols[i] })),
      anim: (i, t) => (i === 0 ? 'cheer' : Math.floor(t * 0.7 + i) % 2 ? 'wave' : 'idle'),
    }));
    window.Sound.play('win');
    window.Sound.music('menu');
    const [wk] = order[0] || [];
    const wn = wk && m.names[wk] ? m.names[wk][0] : 'Someone';
    const isHost = amHost();
    setScreen('podium', `<div class="titlewrap" style="position:absolute;left:50%;top:calc(var(--u)*2);transform:translateX(-50%);text-align:center">${ribbon(wk === App.uid ? 'YOU WIN THE MATCH!' : esc(wn).toUpperCase() + ' WINS!', 'MATCH WINNER')}</div>
      ${order.map(([k, pts], i) => `<div class="pill" style="position:absolute;left:calc(50% + ${[0, -22, 22][i]} * var(--u));top:calc(var(--u) * ${[47, 51, 54][i]});transform:translateX(-50%);background:${C.byId(m.names[k][1]).ui}"><span class="t">${esc(m.names[k][0])} · ${pts}</span></div>`).join('')}
      <div style="position:absolute;right:calc(var(--u)*3);bottom:calc(var(--u)*2.4);display:flex;gap:calc(var(--u)*1.4)">
        <button class="btn gray" data-act="home">${I.back()}<span class="lbl">HOME</span></button>
        ${isHost ? `<button class="btn big" id="rm" style="font-size:calc(var(--u)*3.6)">${I.play()}<span class="lbl">REMATCH</span></button>` : `<span class="chip">Waiting for the host…</span>`}
      </div>
      <div id="confetti" class="pass" style="position:absolute;inset:0;overflow:hidden"></div>`);
    if ($('#rm')) $('#rm').onclick = () => { click(); goLobby(); };
    const cf = $('#confetti');
    const colors = ['#ff4d6d', '#ffd23f', '#4cbf5a', '#4f86da', '#e8559a', '#9b6bff'];
    for (let i = 0; i < 80; i++) {
      const p = document.createElement('i');
      p.style.cssText = `position:absolute;left:${Math.random() * 100}%;top:-5%;width:8px;height:14px;border-radius:2px;background:${colors[i % 6]};transform:rotate(${Math.random() * 360}deg);transition:top ${2 + Math.random() * 2}s linear, transform 3s;`;
      cf.append(p);
      setTimeout(() => { p.style.top = '110%'; p.style.transform = `rotate(${Math.random() * 720}deg)`; }, 50 + i * 30);
    }
  }

  // ---------------------------------------------------------------------------------
  // Shop
  // ---------------------------------------------------------------------------------
  function goShop(tab = 'characters') {
    leaveRoom();
    Race.run(Race.showcase({ ids: [], cam: { pos: [0, 2.6, 9.6], look: [0, 2.2, 0] } }));
    const d = prof();
    const priceTag = (pr) => (pr.gems ? `<span class="price">${I.gem()}${fmt(pr.gems)}</span>` : `<span class="price">${I.coin()}${fmt(pr.coins)}</span>`);
    const cardBg = { astro: '#5aa8ff', frog: '#7ae05a', cat: '#ff8ac8', robot: '#ffd23f', penguin: '#7fa0ff', fox: '#ffa060' };
    let body = '';
    if (tab === 'characters' || tab === 'bundles') {
      const missing = C.CHARACTERS.filter((c) => !d.owned[c.id]).length;
      body = `<div class="feature"><span class="tagbig">👑 FEATURED BUNDLE!</span>
          <div class="group">${['astro', 'frog', 'cat', 'robot', 'fox'].map((id, i) => `<img alt="" src="${full(id)}" style="left:${i * 18 - 4}%;bottom:${[0, 18, 4, 22, 2][i]}%;z-index:${[3, 1, 4, 2, 5][i]}">`).join('')}</div>
          <h4 class="stroke">ALL CHARACTERS BUNDLE</h4><p>Unlock all 6 mascots!</p>
          <div class="was"><span>${fmt(P.BUNDLE.was.coins)}</span><span>${fmt(P.BUNDLE.was.gems)}</span></div>
          <span class="save">SAVE<br>40%</span>
          <div class="prices"><button class="btn green small" data-bundle="coins">${I.coin()}<span class="lbl">${fmt(P.BUNDLE.coins)}</span></button><span class="or">OR</span><button class="btn purple small" data-bundle="gems">${I.gem()}<span class="lbl">${fmt(P.BUNDLE.gems)}</span></button></div>
          <button class="btn" data-bundle="${d.coins >= P.BUNDLE.coins ? 'coins' : 'gems'}" ${missing ? '' : 'disabled'}><span class="lbl">${missing ? '🛒 BUY' : 'ALL OWNED'}</span></button></div>
        <div class="grid">${C.CHARACTERS.map((c) => {
          const owned = d.owned[c.id];
          const pr = P.PRICES[c.id];
          return `<div class="ccard ${d.selected === c.id ? 'sel' : ''}" style="background:linear-gradient(${cardBg[c.id]}, ${shade(cardBg[c.id])})" data-card="${c.id}">
            ${owned ? `<span class="owned">${I.tick()}OWNED</span>` : `<span class="lock">${I.lock()}</span>`}
            <div class="art"><img alt="${c.name}" src="${full(c.id)}"></div>
            <div class="foot"><div class="nm">${c.short.toUpperCase()}</div>
              ${owned ? `<button class="btn gray small" data-sel="${c.id}"><span class="lbl">${d.selected === c.id ? 'SELECTED' : 'SELECT'}</span></button>` : `<button class="btn green small" data-buy="${c.id}">${priceTag(pr)}</button>`}</div></div>`;
        }).join('')}</div>`;
    } else {
      body = `<div class="extras">${[[10, 500], [30, 1600], [80, 4500]].map(([g, c]) => `<div class="extra">${I.coin().replace('<svg', '<svg class="big"')}<b>${fmt(c)} COINS</b><small>Trade gems for coins to unlock characters and upgrades.</small><button class="btn purple" data-ex="${g}">${I.gem()}<span class="lbl">${g}</span></button></div>`).join('')}</div>`;
    }
    setScreen('shop', `${topbar()}
      <div class="titlewrap">${ribbon('CHARACTER SHOP')}</div>
      <div class="tabs">${[['characters', I.users(), 'CHARACTERS'], ['bundles', I.gift(), 'BUNDLES'], ['extras', I.ticket(), 'EXTRAS']].map(([id, ic, n]) => `<div class="tab ${tab === id ? 'on' : ''}" data-tab="${id}">${ic}<span class="t">${n}</span></div>`).join('')}</div>
      <div class="panel shopbody">${body}</div>
      <button class="btn purple sq" data-act="home" style="position:absolute;left:calc(var(--u)*2);top:calc(var(--u)*11)" aria-label="Back">${I.back()}</button>`);
    $$('[data-tab]').forEach((el) => el.onclick = () => { click(); goShop(el.dataset.tab); });
    $$('[data-buy]').forEach((el) => el.onclick = (e) => {
      e.stopPropagation();
      const id = el.dataset.buy, pr = P.PRICES[id];
      const r = P.buyCharacter(id, pr.gems ? 'gems' : 'coins');
      if (r.ok) { window.Sound.play('finish'); toast(`${charName(id)} unlocked!`); P.select(id); goShop(tab); } else toast(r.why, true);
    });
    $$('[data-sel]').forEach((el) => el.onclick = (e) => { e.stopPropagation(); click(); P.select(el.dataset.sel); goShop(tab); });
    $$('[data-card]').forEach((el) => el.onclick = () => { click(); goChars(el.dataset.card); });
    $$('[data-bundle]').forEach((el) => el.onclick = () => { const r = P.buyBundle(el.dataset.bundle); if (r.ok) { window.Sound.play('win'); toast('All characters unlocked!'); goShop(tab); } else toast(r.why, true); });
    $$('[data-ex]').forEach((el) => el.onclick = () => { const r = P.exchangeGems(+el.dataset.ex); if (r.ok) { window.Sound.play('coin'); toast(`+${fmt(+el.dataset.ex * 50)} coins`); goShop(tab); } else toast(r.why, true); });
  }

  // ---------------------------------------------------------------------------------
  // Characters and upgrades
  // ---------------------------------------------------------------------------------
  function goChars(id) {
    leaveRoom();
    const d = prof();
    const cur = id || App.chosenChar || d.selected;
    App.chosenChar = cur;
    const c = C.byId(cur);
    const owned = d.owned[cur];
    const u = P.upgradesOf(cur);
    Race.run(Race.showcase({ ids: [cur], cam: { pos: [1.5, 1.7, 8.4], look: [1.5, 1.2, 0] }, positions: [{ x: -0.55, y: 0.18, z: 0.4, ry: -Math.PI / 2 + 0.35, s: 1.3 }], pedestals: [{ x: -0.55, h: 0.18, color: 0xc8a868 }], spin: true, anim: (i, t) => (Math.floor(t / 2.5) % 2 ? 'cheer' : 'wave') }));
    const rk = P.rank();
    const pct = (a, b) => Math.max(0, Math.min(100, (a / b) * 100));
    const row = (st, lvl, max, val, what, cost, icon) => `<div class="urow"><span class="ic">${icon}</span><div class="mid"><b>${st}</b><small>Lv. ${lvl} / ${max}</small><div class="segs">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>
      <div class="val">+${val}%<small>${what}</small></div>
      ${lvl >= max ? `<button class="btn gray small" disabled><span class="lbl">MAX</span></button>` : `<button class="btn green small" data-up="${st}" ${owned ? '' : 'disabled'}>${I.coin()}<span class="lbl">${fmt(cost)}</span></button>`}</div>`;
    const ICON = { speed: I.shoe(), jump: I.spring(), balance: I.scale(), accel: I.rocket() };
    setScreen('chars', `<div class="topbar" style="justify-content:space-between"><div class="minilogo" style="font-size:calc(var(--u)*3.4)">${logo()}</div><div class="grow"></div>
        <div class="cur">${I.coin()}<b>${fmt(d.coins)}</b><span class="plus" data-act="shop">${I.plus()}</span></div><div class="cur">${I.gem()}<b>${fmt(d.gems)}</b><span class="plus" data-act="extras">${I.plus()}</span></div></div>
      <div class="titlewrap">${ribbon('CHARACTER PROGRESSION')}<br><span class="subribbon">UPGRADES &amp; ABILITIES</span></div>
      <div class="panel clist">${C.CHARACTERS.map((x) => `<div class="it ${x.id === cur ? 'sel' : ''} ${d.owned[x.id] ? '' : 'locked'}" data-c="${x.id}">${d.selected === x.id ? `<span class="ck">${I.check()}</span>` : ''}<img alt="${x.name}" src="${head(x.id)}"></div>`).join('')}</div>
      <div class="cname"><div class="plate"><b>⭐ ${c.name.toUpperCase()}</b><small>${c.tagline}</small></div></div>
      <div class="clevel"><span class="shield">${I.shieldLv()}<small>Lv.</small>${d.level}</span><span class="bar"><i style="width:${pct(d.xp, P.xpToNext(d.level))}%"></i><span class="txt">${fmt(d.xp)} / ${fmt(P.xpToNext(d.level))}</span></span></div>
      <div class="panel rankcard"><div class="crest">${I.crest()}<div class="tx">RANK<b>${rk.tier} ${rk.div}</b></div></div>
        <div class="stars">${[1, 2, 3].map((i) => (i <= rk.stars ? I.star() : I.starGray())).join('')}</div>
        <div class="next">NEXT RANK<b>${rk.next}</b><span class="bar"><i style="width:${pct(rk.pts - rk.from, rk.to - rk.from)}%"></i><span class="txt">${Math.round(rk.pts)} / ${Math.round(rk.to)}</span></span></div></div>
      <div class="panel upg"><div class="hd">⬆ <span class="stroke">UPGRADES</span></div>
        ${P.UPGRADES.map((x) => row(x.name, u[x.id], x.max, +(u[x.id] * x.per).toFixed(1), x.what, P.upgradeCost(x.id, u[x.id]), ICON[x.id]).replace(`data-up="${x.name}"`, `data-up="${x.id}"`)).join('')}
        <div class="ability"><div class="hd2 stroke">⭐ SPECIAL ABILITY</div>
          ${row('BOOST DASH', u.ability, 5, u.ability * 5, 'Longer boosts', P.upgradeCost('ability', u.ability), I.boot()).replace('data-up="BOOST DASH"', 'data-up="ability"')}</div>
      </div>
      <div class="dock">
        <div class="left"><button class="btn blue tile" data-act="shop">${I.shop()}<span class="lbl">SHOP</span></button></div>
        ${owned ? (d.selected === cur ? `<button class="btn big play" data-act="play">${I.play()}<span class="lbl">PLAY</span></button>` : `<button class="btn big green play" id="pick"><span class="lbl">SELECT</span></button>`)
          : `<button class="btn big green play" id="buy">${(P.PRICES[cur].gems ? I.gem() : I.coin())}<span class="lbl">${fmt(P.PRICES[cur].gems || P.PRICES[cur].coins)}</span></button>`}
        <button class="btn gray tile settings" data-act="home">${I.back()}<span class="lbl">BACK</span></button>
      </div>`);
    $$('[data-c]').forEach((el) => el.onclick = () => { click(); goChars(el.dataset.c); });
    $$('[data-up]').forEach((el) => el.onclick = () => { const r = P.buyUpgrade(cur, el.dataset.up); if (r.ok) { window.Sound.play('box'); goChars(cur); } else toast(r.why, true); });
    if ($('#pick')) $('#pick').onclick = () => { click(); P.select(cur); toast(`${c.name} selected`); goChars(cur); };
    if ($('#buy')) $('#buy').onclick = () => { const pr = P.PRICES[cur]; const r = P.buyCharacter(cur, pr.gems ? 'gems' : 'coins'); if (r.ok) { window.Sound.play('finish'); toast(`${c.name} unlocked!`); P.select(cur); goChars(cur); } else toast(r.why, true); };
  }

  // ---------------------------------------------------------------------------------
  // Settings and modals
  // ---------------------------------------------------------------------------------
  function modal(html, wire, cls = '') {
    closeModal();
    const m = document.createElement('div');
    m.className = 'modal on';
    m.id = 'modal';
    m.innerHTML = `<div class="panel ${cls}">${html}<button class="btn red sq" id="mx" style="position:absolute;right:calc(var(--u)*1);top:calc(var(--u)*1)" aria-label="Close">${I.close()}</button></div>`;
    m.querySelector('.panel').style.position = 'relative';
    ui.append(m);
    $('#mx', m).onclick = () => { click(); closeModal(); };
    m.addEventListener('click', (e) => { if (e.target === m) closeModal(); });
    if (wire) wire(m);
  }
  function closeModal() { const m = $('#modal'); if (m) m.remove(); }

  function openSettings(first) {
    const d = prof();
    modal(`<h2>${first ? 'WELCOME, RACER!' : 'SETTINGS'}</h2>
      <div class="setrow"><span>Your name</span><input type="text" id="nm" maxlength="14" placeholder="Player" value="${esc(d.name)}"></div>
      <div class="setrow"><span>Sound effects</span><span class="switch ${d.settings.sfx ? 'on' : ''}" id="sw-sfx"><i></i></span></div>
      <div class="setrow"><span>Music</span><span class="switch ${d.settings.music ? 'on' : ''}" id="sw-music"><i></i></span></div>
      <div class="setrow"><span>Graphics</span><span class="seg3">${['low', 'medium', 'high'].map((q) => `<button data-q="${q}" class="${d.settings.quality === q ? 'on' : ''}">${q.toUpperCase()}</button>`).join('')}</span></div>
      <div class="setrow"><span>Progress</span><span class="note">${P.cloudOn() ? '☁️ Saved online to your claude.ai account' : '💾 Saved on this device'}</span></div>
      <div style="display:flex;gap:calc(var(--u)*1.4);justify-content:center;margin-top:calc(var(--u)*1.4)">
        <button class="btn green" id="ok"><span class="lbl">${first ? "LET'S GO!" : 'DONE'}</span></button>
        ${first ? '' : `<button class="btn gray small" id="rst"><span class="lbl">RESET PROGRESS</span></button>`}
      </div>
      <p class="note" style="text-align:center;margin-top:calc(var(--u)*1.2)">Keys: ← → run · Space jump (twice to double jump) · 1-4 use powers</p>`, (m) => {
      const sw = (id, key, fn) => { $(id, m).onclick = () => { const v = !P.get().settings[key]; P.setSetting(key, v); $(id, m).classList.toggle('on', v); fn(v); click(); }; };
      sw('#sw-sfx', 'sfx', (v) => window.Sound.setSfx(v));
      sw('#sw-music', 'music', (v) => window.Sound.setMusic(v));
      $$('[data-q]', m).forEach((b) => b.onclick = () => { click(); P.setSetting('quality', b.dataset.q); Race.setQuality(b.dataset.q); $$('[data-q]', m).forEach((x) => x.classList.toggle('on', x === b)); });
      $('#ok', m).onclick = () => {
        click();
        const n = ($('#nm', m).value || '').trim();
        if (first && !n) return toast('Pick a name first', true);
        if (n !== P.get().name) { P.setName(n || 'Player'); if (App.room) Net.set({ n: P.get().name }); }
        closeModal();
        if (['home', 'maps', 'chars', 'shop'].includes(App.screen)) refreshTop();
      };
      const rst = $('#rst', m);
      if (rst) rst.onclick = () => {
        if (rst.dataset.armed) { P.reset(); closeModal(); toast('Progress reset'); goHome(); return; }
        rst.dataset.armed = '1';
        rst.querySelector('.lbl').textContent = 'TAP AGAIN TO CONFIRM';
      };
    });
  }

  // ---------------------------------------------------------------------------------
  // Room events
  // ---------------------------------------------------------------------------------
  Net.onChange(() => {
    if (!App.room) return;
    const st = roomPeople();
    if (st.full) { leaveRoom(); toast('That room already has 4 players', true); goMaps(); return; }
    const h = st.host;
    if (h && !h.me && !App.room.sawHost) {
      App.room.sawHost = true;
      if (h.race && h.st !== 'lobby') App.room.startedEpoch = h.race.e;   // a race was already running
    }
    if (h && !h.me && h.race && h.race.e > App.room.startedEpoch && (App.screen === 'lobby' || App.screen === 'finding' || App.screen === 'results' || App.screen === 'podium' || App.screen === 'race')) {
      App.match = h.m || App.match;
      beginRace(h.race, false);
      return;
    }
    if (h && !h.me && h.m) App.match = h.m;
    if (App.race && h && !h.me && h.res && h.res.e === App.race.e) { App.finalRes = h.res; raceOver(h.res); }
    if (App.screen === 'lobby') renderLobby();
  });
  setInterval(() => { if (App.screen === 'lobby') renderLobby(); }, 1000);

  // First interaction unlocks audio.
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => window.Sound.unlock(), { passive: true }));

  window.CoinHopper = { App, goHome, goMaps, goShop, goChars, goLobby, startSolo, joinPrivate, roomPeople };
  boot().catch((e) => { console.error(e); ui.innerHTML = `<div class="toast bad" style="top:40%">Something went wrong while loading: ${esc(e.message)}</div>`; });
})();
