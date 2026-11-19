// Player profile and economy: coins, gems, XP and level, rank, owned characters, upgrades,
// settings and stats. Saved in this browser, and in the player's own private record on
// claude.ai (artifact `db`) when the page runs there, so progress follows them across devices.
window.Profile = (function () {
  const KEY = 'ch-profile-v2';
  const UPGRADES = [
    { id: 'speed', name: 'SPEED', what: 'Run Speed', per: 1.2, max: 10, icon: 'shoe' },
    { id: 'jump', name: 'JUMP', what: 'Jump Height', per: 0.8, max: 10, icon: 'spring' },
    { id: 'balance', name: 'BALANCE', what: 'Air Control', per: 3, max: 10, icon: 'scale' },
    { id: 'accel', name: 'ACCELERATION', what: 'Top Speed Gain', per: 2.5, max: 10, icon: 'rocket' },
  ];
  const ABILITY = { id: 'ability', name: 'BOOST DASH', what: 'Longer boosts', max: 5 };
  const PRICES = {
    astro: { coins: 0 }, frog: { coins: 1500 }, cat: { gems: 120 }, robot: { coins: 2500 }, penguin: { coins: 3000 }, fox: { gems: 200 },
  };
  const BUNDLE = { coins: 6000, gems: 400, was: { coins: 10000, gems: 680 } };
  const PLACE = { coins: [120, 80, 50, 30], xp: [100, 70, 50, 35], gems: [3, 1, 0, 0], rank: [30, 15, -5, -15] };
  const TIERS = [['BRONZE', 0], ['SILVER', 300], ['GOLD', 700], ['PLATINUM', 1200], ['DIAMOND', 1800]];

  const fresh = () => ({
    v: 2, name: '', coins: 500, gems: 20, xp: 0, level: 1, rankPts: 0,
    owned: { astro: true }, selected: 'astro', upgrades: {},
    stats: { races: 0, wins: 0, podiums: 0, best: 0, coins: 0 },
    settings: { sfx: true, music: true, quality: 'high' },
    updatedAt: 0,
  });

  let data = fresh();
  let cloud = null;      // { db, path } when saving online is available
  let saveTimer = null;
  const listeners = new Set();

  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) data = { ...fresh(), ...JSON.parse(raw) }; } catch (e) { /* storage blocked */ }
    return data;
  }

  // Connect to the player's private online save, and keep whichever copy is newer.
  async function connectCloud() {
    try {
      if (!window.claude || !window.claude.use) return false;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return false;
      const id = await user.id();
      if (!id) return false;
      const ref = db.doc(`data/users/${id}/save/profile`);
      const snap = await ref.get();
      const remote = snap && (snap.data ? snap.data() : snap);
      if (remote && remote.v === 2 && (remote.updatedAt || 0) > (data.updatedAt || 0)) {
        data = { ...fresh(), ...remote };
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage blocked */ }
        emit();
      }
      cloud = { ref };
      if ((data.updatedAt || 0) > ((remote && remote.updatedAt) || 0)) save();
      return true;
    } catch (e) {
      console.warn('online save unavailable', e);
      return false;
    }
  }

  function save() {
    data.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage blocked */ }
    emit();
    if (!cloud) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { cloud.ref.set(JSON.parse(JSON.stringify(data))).catch((e) => console.warn('online save failed', e)); }, 600);
  }

  function emit() { listeners.forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); }

  // ---- Levels and ranks ------------------------------------------------------------
  const xpToNext = (lvl) => 150 + (lvl - 1) * 75;
  function addXp(n) {
    data.xp += n;
    let ups = 0;
    while (data.xp >= xpToNext(data.level)) { data.xp -= xpToNext(data.level); data.level++; ups++; data.gems += 5; }
    return ups;
  }
  function rank(pts = data.rankPts) {
    let i = 0;
    while (i + 1 < TIERS.length && pts >= TIERS[i + 1][1]) i++;
    const [name, lo] = TIERS[i];
    const hi = TIERS[i + 1] ? TIERS[i + 1][1] : lo + 900;
    const third = (hi - lo) / 3;
    const div = Math.min(3, Math.floor((pts - lo) / third) + 1);
    const roman = ['III', 'II', 'I'][div - 1];
    const next = div < 3 ? `${name} ${['III', 'II', 'I'][div]}` : TIERS[i + 1] ? `${TIERS[i + 1][0]} III` : 'MAX';
    return { tier: name, div: roman, label: `${name} ${roman}`, stars: div, pts, from: lo + (div - 1) * third, to: lo + div * third, next };
  }

  // ---- Shop ------------------------------------------------------------------------
  function canAfford(price) { return (price.coins || 0) <= data.coins && (price.gems || 0) <= data.gems; }
  function buyCharacter(id, currency) {
    const p = PRICES[id];
    if (!p || data.owned[id]) return { ok: false, why: 'Already owned' };
    const cost = currency === 'gems' ? { gems: p.gems ?? Math.ceil((p.coins || 0) / 15) } : { coins: p.coins ?? (p.gems || 0) * 15 };
    if (!canAfford(cost)) return { ok: false, why: 'Not enough ' + (cost.gems ? 'gems' : 'coins') };
    data.coins -= cost.coins || 0;
    data.gems -= cost.gems || 0;
    data.owned[id] = true;
    save();
    return { ok: true };
  }
  function buyBundle(currency) {
    const missing = Object.keys(PRICES).filter((id) => !data.owned[id]);
    if (!missing.length) return { ok: false, why: 'You own every character' };
    const cost = currency === 'gems' ? { gems: BUNDLE.gems } : { coins: BUNDLE.coins };
    if (!canAfford(cost)) return { ok: false, why: 'Not enough ' + (cost.gems ? 'gems' : 'coins') };
    data.coins -= cost.coins || 0;
    data.gems -= cost.gems || 0;
    missing.forEach((id) => { data.owned[id] = true; });
    save();
    return { ok: true };
  }
  function exchangeGems(gems) {
    if (data.gems < gems) return { ok: false, why: 'Not enough gems' };
    data.gems -= gems;
    data.coins += gems * 50;
    save();
    return { ok: true };
  }

  // ---- Upgrades --------------------------------------------------------------------
  const upg = (id) => (data.upgrades[id] = data.upgrades[id] || { speed: 0, jump: 0, balance: 0, accel: 0, ability: 0 });
  const upgradeCost = (stat, lvl) => (stat === 'ability' ? Math.round(800 * Math.pow(1.55, lvl)) : Math.round(220 * Math.pow(1.32, lvl)));
  function buyUpgrade(charId, stat) {
    if (!data.owned[charId]) return { ok: false, why: 'Unlock this character first' };
    const u = upg(charId);
    const max = stat === 'ability' ? ABILITY.max : 10;
    if (u[stat] >= max) return { ok: false, why: 'Maxed out' };
    const cost = upgradeCost(stat, u[stat]);
    if (data.coins < cost) return { ok: false, why: 'Not enough coins' };
    data.coins -= cost;
    u[stat]++;
    save();
    return { ok: true };
  }

  // ---- Race rewards -------------------------------------------------------------------
  // place: 1-based finish place, or 0 for not finishing. players: racers in the race.
  function reward({ place, players, coinsPicked = 0, ranked = false, finished = true, timeMs = 0 }) {
    const i = finished && place ? Math.min(3, place - 1) : 3;
    const scale = players >= 2 ? 1 : 0.6;    // smaller rewards for bot-only races
    const r = {
      coins: Math.round((PLACE.coins[i] * scale) + coinsPicked * 5),
      xp: Math.round(PLACE.xp[i] * scale),
      gems: finished && players >= 2 ? PLACE.gems[i] : (finished && place === 1 ? 1 : 0),
      rank: ranked ? PLACE.rank[i] : 0,
    };
    data.coins += r.coins;
    data.gems += r.gems;
    data.rankPts = Math.max(0, data.rankPts + r.rank);
    r.levelUps = addXp(r.xp);
    data.stats.races++;
    data.stats.coins += coinsPicked;
    if (place === 1 && finished) data.stats.wins++;
    if (place && place <= 3 && finished) data.stats.podiums++;
    if (finished && timeMs && (!data.stats.best || timeMs < data.stats.best)) data.stats.best = timeMs;
    save();
    return r;
  }

  function setName(n) { data.name = String(n || '').trim().slice(0, 14); save(); }
  function select(id) { if (data.owned[id]) { data.selected = id; save(); return true; } return false; }
  function setSetting(k, v) { data.settings[k] = v; save(); }
  function reset() { data = fresh(); save(); }

  load();
  return {
    get: () => data, load, save, connectCloud, cloudOn: () => !!cloud, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    UPGRADES, ABILITY, PRICES, BUNDLE, xpToNext, rank, buyCharacter, buyBundle, exchangeGems, buyUpgrade, upgradeCost, upgradesOf: upg,
    reward, setName, select, setSetting, reset,
  };
})();
