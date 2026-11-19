// Online play over the claude.ai artifact "room" capability: everyone who has this page open
// right now can meet in a named room (one per race group, picked by a short code).
// All game data travels in each player's own presence object, so anyone admitted to the
// room can play; nothing is stored. Without the capability (a local file, signed out) the
// game runs solo only.
window.Net = (function () {
  let lobby = null;
  let room = null;
  let unsubs = [];
  const listeners = new Set();
  let pending = null;
  let flushTimer = null;

  async function init() {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') return false;
      lobby = await window.claude.use('room');
      return !!lobby;
    } catch (e) {
      return false;
    }
  }

  function notify() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }

  async function join(code) {
    if (!lobby) throw new Error('offline');
    await leave();
    room = await lobby.join('race-' + code);
    unsubs.push(room.onPeers(() => notify(), () => notify()));
    unsubs.push(room.onConnection(() => notify()));
    return room;
  }

  async function leave() {
    unsubs.forEach((u) => { try { u(); } catch (e) { /* already gone */ } });
    unsubs = [];
    pending = null;
    if (room) {
      const r = room;
      room = null;
      try { await r.leave(); } catch (e) { /* already gone */ }
    }
  }

  // Merge fields into my presence. Calls are coalesced, so this is safe every frame.
  function set(patch) {
    if (!room) return;
    pending = Object.assign(pending || {}, patch);
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const p = pending;
      pending = null;
      if (room && p) room.presence(p).catch(() => {});
    }, 45);
  }

  function peers() {
    if (!room) return [];
    return room.peers().map((p) => ({ peer: p.peer, me: p.isMe && p.sameTab, ...p.presence }));
  }

  return {
    init,
    join,
    leave,
    set,
    peers,
    inRoom: () => !!room,
    connected: () => !!room && room.connected(),
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
