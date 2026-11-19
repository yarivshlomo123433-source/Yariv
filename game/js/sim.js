// Race simulation, independent of rendering: runner physics on the course (2.5D: the race
// moves along X with gravity on Y), the feel tuning, upgrades, status effects and bots.
// Units: one course column = 1. Ground height comes from world.surf(column).
window.Sim = (function () {
  const M = {
    RUN: 6.9, GRAV: 43.75, JUMP: 17.5, FALL_EXTRA: 28, MAX_FALL: 28,
    APEX_T: 0.35, APEX_G: 0.5, CUT: 0.6, MIN_HOLD: 0.15, COYOTE: 0.15, BUFFER: 0.16, STEP_UP: 0.55,
    ACC: 14, DEC: 20, TURN: 26, AIR_ACC: 8, AIR_DEC: 5,
    HW: 0.27, H: 0.95, STOMP: 13,
  };

  // Upgrades change feel a little; online races cap the total so skill still decides.
  function statsFrom(upg = {}, ranked = false) {
    const cap = ranked ? 0.5 : 1;
    const lv = (k) => Math.min(10, Math.max(0, upg[k] || 0));
    return {
      run: M.RUN * (1 + 0.012 * lv('speed') * cap),
      jump: M.JUMP * (1 + 0.008 * lv('jump') * cap),
      air: 1 + 0.03 * lv('balance') * cap,
      acc: 1 + 0.025 * lv('accel') * cap,
      boostMs: 3000 + 150 * lv('ability'),
    };
  }

  class Runner {
    constructor(opts) {
      Object.assign(this, {
        key: opts.key, name: opts.name, charId: opts.charId, bot: !!opts.bot, me: !!opts.me,
        x: opts.x, y: opts.y, vx: 0, vy: 0, onGround: false, facing: 1,
        jumps: 0, lastGround: -1e9, lastPress: -1e9, jumpT: -1e9, cutPending: false, wasGround: false, fallSpeed: 0,
        stunUntil: -1e9, slowUntil: -1e9, frozenUntil: -1e9, boostUntil: -1e9, shieldUntil: -1e9, invulnUntil: -1e9,
        finished: false, ft: 0, respawnAt: 0, safeX: opts.x, safeY: opts.y,
        powers: { ice: 0, slime: 0, boost: 0, shield: 0 }, powerCooldown: 0, coins: 0,
        events: [],
      });
      this.stats = statsFrom(opts.upgrades, opts.ranked);
    }

    get dead() { return this.respawnAt > 0; }

    // inp: { dir, jumpPressed, jumpHeld, jumpReleased }
    step(world, t, dt, inp, canMove) {
      if (this.respawnAt) {
        if (t >= this.respawnAt) {
          this.respawnAt = 0; this.x = this.safeX; this.y = this.safeY + 0.05; this.vx = this.vy = 0;
          this.invulnUntil = t + 1.2; this.events.push('respawn');
        }
        return;
      }
      if (this.y < -3) { this.respawnAt = t + 0.7; this.events.push('fall'); return; }
      const frozen = t < this.frozenUntil, stunned = t < this.stunUntil || frozen;
      const active = canMove && !stunned && !this.finished;
      const S = this.stats;
      const slow = t < this.slowUntil ? 0.55 : 1;
      const boost = t < this.boostUntil ? 1.45 : 1;
      if (this.onGround && this.vy <= 0) {
        this.lastGround = t; this.jumps = 0;
        const c = Math.floor(this.x), s = world.surf(c);
        if (s != null && Math.abs(this.y - s) < 0.05 && world.surf(Math.floor(this.x - 0.6)) === s && world.surf(Math.floor(this.x + 0.6)) === s) { this.safeX = this.x; this.safeY = this.y; }
      }
      if (this.onGround && !this.wasGround && this.fallSpeed > 5) this.events.push('land');
      this.wasGround = this.onGround;
      if (!this.onGround) this.fallSpeed = Math.max(0, -this.vy);

      // Run.
      const dir = active ? inp.dir : 0;
      const top = S.run * slow * boost;
      let rate;
      if (stunned) rate = this.onGround ? 4 : 1.5;
      else if (dir === 0) rate = this.onGround ? M.DEC : M.AIR_DEC * S.air;
      else if (this.vx !== 0 && Math.sign(this.vx) !== dir) rate = this.onGround ? M.TURN : M.AIR_ACC * 1.5 * S.air;
      else rate = (this.onGround ? M.ACC : M.AIR_ACC * S.air) * S.acc;
      this.vx += (dir * top - this.vx) * (1 - Math.exp(-rate * dt));
      if (dir === 0 && Math.abs(this.vx) < 0.15) this.vx = 0;
      if (frozen) this.vx *= 0.8;
      if (dir) this.facing = dir;

      // Jump, double jump, coyote time and buffering.
      if (active && inp.jumpPressed) {
        if (this.jumps === 0 && t - this.lastGround <= M.COYOTE) { this.jumps = 1; this.jump(false); }
        else if (this.jumps < 2) { this.jumps = 2; this.jump(true); }
        else this.lastPress = t;
      } else if (active && this.onGround && this.vy <= 0 && t - this.lastPress <= M.BUFFER) {
        this.jumps = 1; this.jump(false);
        if (!inp.jumpHeld) this.cutPending = true;
      }
      // Variable jump height. A release only shortens the jump after MIN_HOLD, so a quick tap
      // on a phone (press and release inside one frame) still gives a useful jump.
      this.jumpT = this.jumpT === -1 ? t : this.jumpT;
      if (inp.jumpReleased && this.vy > 0) this.cutPending = true;
      if (this.cutPending && t - this.jumpT >= M.MIN_HOLD) { if (this.vy > 0) this.vy *= M.CUT; this.cutPending = false; }
      if (this.vy <= 0) this.cutPending = false;
      const held = active && inp.jumpHeld;
      let g = M.GRAV;
      if (this.vy < 0 && !(held && -this.vy < S.jump * M.APEX_T)) g += M.FALL_EXTRA;
      else if (held && Math.abs(this.vy) < S.jump * M.APEX_T) g *= M.APEX_G;
      this.vy = Math.max(-M.MAX_FALL, this.vy - g * dt);

      this.move(world, dt);
    }

    jump(air) {
      this.vy = this.stats.jump;
      this.jumpT = -1; this.cutPending = false;   // stamped with the step time in step()
      this.lastPress = -1e9;
      this.onGround = false;
      this.events.push(air ? 'double' : 'jump');
    }

    // Axis-separated movement against column ground and one-way platforms.
    move(world, dt) {
      const hw = M.HW;
      let nx = this.x + this.vx * dt;
      if (this.vx !== 0) {
        const edge = nx + Math.sign(this.vx) * hw;
        const c = Math.floor(edge);
        const s = world.surf(c);
        if (s != null && s > this.y + 0.04) {
          if (s - this.y <= M.STEP_UP && (this.onGround || this.vy > -6)) {
            // Corner correction: a jump that ends just below the top still makes it.
            this.y = s; this.vy = Math.max(0, this.vy); this.onGround = true;
          } else {
            nx = this.vx > 0 ? c - hw - 0.001 : c + 1 + hw + 0.001;
            this.vx = 0;
          }
        }
      }
      this.x = Math.max(0.3, Math.min(world.width - 0.3, nx));
      const ny = this.y + this.vy * dt;
      this.onGround = false;
      if (this.vy <= 0) {
        let support = -Infinity;
        for (let c = Math.floor(this.x - hw); c <= Math.floor(this.x + hw); c++) {
          const s = world.surf(c);
          if (s != null && s <= this.y + 0.05) support = Math.max(support, s);
        }
        for (const p of world.plats) if (this.x + hw > p.x1 && this.x - hw < p.x2 && p.y <= this.y + 0.05) support = Math.max(support, p.y);
        if (ny <= support) { this.y = support; this.vy = 0; this.onGround = true; return; }
      }
      this.y = ny;
    }

    progress(world) {
      return Math.max(0, Math.min(1, (this.x - world.startX) / (world.finishX - world.startX)));
    }

    // Hostile effect, unless a shield soaks it.
    hit(kind, t) {
      if (this.finished || this.dead || t < this.invulnUntil) return 'none';
      if (t < this.shieldUntil) { this.shieldUntil = 0; this.invulnUntil = t + 0.6; this.events.push('blocked'); return 'blocked'; }
      if (kind === 'ice') { this.frozenUntil = t + 1.1; this.slowUntil = t + 2.6; }
      else if (kind === 'slime') { this.slowUntil = t + 2.2; this.stunUntil = t + 0.5; this.vx *= 0.3; }
      else if (kind === 'enemy') { this.stunUntil = t + 0.7; this.vy = 9; this.vx = -this.facing * 5; }
      this.invulnUntil = t + 1.4;
      this.events.push('hit-' + kind);
      return 'hit';
    }
  }

  // Bot driver: runs right, jumps gaps, steps, walls and enemies, and uses its powers.
  class Bot {
    constructor(runner, skill) {
      this.r = runner; this.skill = skill;
      this.holdUntil = 0; this.prevHeld = false; this.powerAt = 0; this.wantDouble = false; this.hesitate = 0;
    }

    support(world, c, foot) {
      const g = world.surf(c);
      let best = g;
      for (const p of world.plats) if (c >= p.x1 && c < p.x2 && p.y <= foot + 0.6 && (best == null || p.y > best)) best = p.y;
      return best;
    }

    think(world, t, others) {
      const r = this.r;
      const inp = { dir: t < this.hesitate ? 0 : 1, jumpPressed: false, jumpHeld: false, jumpReleased: false, power: null };
      const c = Math.floor(r.x), foot = r.y;
      let jump = false;
      if (r.onGround) {
        const a1 = this.support(world, c + 1, foot), a2 = this.support(world, c + 2, foot);
        const edge = c + 1 - r.x;
        if ((a1 == null || a1 < foot - 2.5) && edge < 0.45 + this.skill * 0.2) jump = true;
        const rise = a1 != null ? a1 - foot : 0, rise2 = a2 != null ? a2 - foot : 0;
        if ((rise >= 0.9 && edge < 0.8) || (rise2 >= 2.5 && edge < 0.3)) { jump = true; this.wantDouble = Math.max(rise, rise2) > 2.6; }
        for (const e of world.enemies) if (t >= e.deadUntil && e.hx - r.x > 0.3 && e.hx - r.x < 2.2 && Math.abs(e.hy - r.y) < 1.5) jump = true;
        if (jump && Math.random() > 0.975 + this.skill * 0.025) { jump = false; this.hesitate = t + 0.25; }
      } else if (r.jumps < 2 && r.vy < 2) {
        const ahead = this.support(world, Math.floor(r.x + 1.5), foot), under = this.support(world, c, foot);
        const pit = (ahead == null || ahead < foot - 3) && (under == null || under < foot - 3);
        const wall = ahead != null && ahead > foot + 0.3;
        if (pit || wall || this.wantDouble) { jump = true; this.wantDouble = false; }
      }
      if (jump && t >= this.holdUntil) { inp.jumpPressed = true; this.holdUntil = t + 0.28 + this.skill * 0.08; }
      inp.jumpHeld = t < this.holdUntil;
      inp.jumpReleased = this.prevHeld && !inp.jumpHeld;
      this.prevHeld = inp.jumpHeld;

      // Powers: use what it holds when it makes sense.
      const have = Object.keys(r.powers).filter((k) => r.powers[k] > 0);
      if (have.length && !this.powerAt) this.powerAt = t + 0.6 + Math.random() * 1.5;
      if (have.length && t > this.powerAt) {
        const ahead = others.filter((o) => o.key !== r.key && !o.finished && o.x > r.x);
        const behind = others.filter((o) => o.key !== r.key && !o.finished && o.x < r.x && r.x - o.x < 8);
        let pick = null;
        if (r.powers.boost && r.onGround) pick = 'boost';
        else if (r.powers.ice && ahead.length) pick = 'ice';
        else if (r.powers.slime && r.onGround && behind.length) pick = 'slime';
        else if (r.powers.shield && t > r.shieldUntil) pick = 'shield';
        else if (t - this.powerAt > 4) pick = have[0];
        if (pick) { inp.power = pick; this.powerAt = 0; }
      }
      return inp;
    }
  }

  // Deterministic enemy motion from race time, so every player sees the same thing.
  function enemyPos(e, t) {
    if (e.kind === 'walker') {
      const span = Math.max(0.1, e.R - e.L), d = (t * 1.7) % (2 * span);
      return { x: e.L + (d < span ? d : 2 * span - d), y: e.y, dir: d < span ? 1 : -1 };
    }
    return { x: e.cx + Math.sin(t * 0.9) * 1.25, y: e.cy + Math.sin(t * 2.6) * 0.95, dir: Math.cos(t * 0.9) > 0 ? 1 : -1 };
  }

  return { M, Runner, Bot, statsFrom, enemyPos };
})();
