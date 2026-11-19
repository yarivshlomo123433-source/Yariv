// A runner on the course: the physics body, movement feel and visuals shared by the local
// player and by bots. Input comes from the keyboard/touch (player) or a BotBrain.
window.CH = (function () {
  const TILE = 32;
  const S = 0.5;                 // art is drawn at 2x, shown at half size

  const M = {
    RUN_SPEED: 220,
    GROUND_ACCEL: 14, GROUND_DECEL: 20, TURN_RATE: 26, AIR_ACCEL: 8, AIR_DECEL: 5,
    GRAVITY: 1400, JUMP_VELOCITY: 560, FALL_EXTRA_GRAVITY: 900, MAX_FALL: 900,
    APEX_THRESHOLD: 0.35, APEX_GRAVITY: 0.5, JUMP_CUT: 0.5,
    COYOTE_MS: 100, BUFFER_MS: 120, STOMP_BOUNCE: 420, SPEED_BOOST: 1.6,
    INVULN_MS: 1300,
  };

  const COLORS = [
    { tex: 'player-blue', hex: '#4f86da', num: 0x4f86da },
    { tex: 'player-green', hex: '#4cbf5a', num: 0x4cbf5a },
    { tex: 'player-pink', hex: '#e8559a', num: 0xe8559a },
    { tex: 'player-gold', hex: '#f2c230', num: 0xf2c230 },
  ];

  const LABEL_STYLE = { fontFamily: 'Fredoka, Trebuchet MS, sans-serif', fontSize: '12px', color: '#ffffff', stroke: '#1b1f3b', strokeThickness: 4 };

  class Runner {
    constructor(scene, opts) {
      this.scene = scene;
      this.key = opts.key;
      this.name = opts.name;
      this.color = opts.color;
      this.isMe = !!opts.me;
      this.isBot = !!opts.bot;
      this.speedFactor = opts.speedFactor || 1;
      this.zone = scene.add.zone(opts.x, opts.y, 18, 28);
      scene.physics.add.existing(this.zone);
      this.body = this.zone.body;
      this.body.setCollideWorldBounds(true);
      this.body.setMaxVelocity(M.RUN_SPEED * M.SPEED_BOOST * 1.4, M.MAX_FALL);
      scene.physics.add.collider(this.zone, scene.solids);
      scene.physics.add.collider(this.zone, scene.platforms);
      this.hero = scene.add.image(opts.x, opts.y, COLORS[this.color].tex).setScale(S).setOrigin(0.5, 1).setDepth(this.isMe ? 5 : 4);
      this.stars = scene.add.graphics().setDepth(6);
      this.label = this.isMe ? null : scene.add.text(0, 0, this.name, { ...LABEL_STYLE, color: COLORS[this.color].hex }).setOrigin(0.5, 1).setDepth(9);
      this.jumpsUsed = 0;
      this.lastGround = -Infinity;
      this.lastPress = -Infinity;
      this.wasOnGround = false;
      this.fallSpeed = 0;
      this.spinning = false;
      this.stunUntil = 0;
      this.invulnUntil = 0;
      this.speedUntil = 0;
      this.power = null;
      this.coins = 0;
      this.respawning = false;
      this.finished = false;
      this.ft = 0;
      this.lastSafe = { x: opts.x, y: opts.y };
    }

    get x() { return this.zone.x; }
    get y() { return this.zone.y; }
    get stunned() { return this.scene.time.now < this.stunUntil; }
    sfx(name) { if (this.isMe) window.Sound.play(name); }

    progress() {
      const s = this.scene;
      return Phaser.Math.Clamp((this.zone.x - s.startX) / (s.flagX - s.startX), 0, 1);
    }

    // inp: { dir, jumpPressed, jumpHeld, jumpReleased }
    step(time, dt, inp, canMove) {
      const body = this.body;
      const s = this.scene;
      if (!this.respawning && this.zone.y > s.worldH + 40) { this.respawn(); return; }
      if (this.respawning) return;
      const stunned = time < this.stunUntil;
      const active = canMove && !stunned && !this.finished;
      const onGround = body.blocked.down || body.touching.down;
      if (onGround && body.velocity.y >= 0) {
        this.lastGround = time;
        this.jumpsUsed = 0;
        const t = s.colTop(Math.floor(this.zone.x / TILE));
        if (t != null && Math.abs(body.bottom - t * TILE) < 3) {
          const l = s.colTop(Math.floor((this.zone.x - 20) / TILE));
          const r = s.colTop(Math.floor((this.zone.x + 20) / TILE));
          if (l === t && r === t) this.lastSafe = { x: this.zone.x, y: this.zone.y };
        }
      }
      if (onGround && !this.wasOnGround && this.fallSpeed > 150) {
        const amount = Phaser.Math.Clamp((this.fallSpeed - 150) / 700, 0, 1);
        this.squash(1 + 0.3 * amount, 1 - 0.25 * amount, 180);
        s.spawnDust(this.zone.x, body.bottom, 2 + Math.round(amount * 4));
        if (amount > 0.25) this.sfx('land');
      }
      this.wasOnGround = onGround;
      if (!onGround) this.fallSpeed = Math.max(0, body.velocity.y);

      // Run.
      const dir = active ? inp.dir : 0;
      const top = M.RUN_SPEED * this.speedFactor * (time < this.speedUntil ? M.SPEED_BOOST : 1);
      const vx = body.velocity.x;
      let rate;
      if (stunned) rate = onGround ? 4 : 1.5;
      else if (dir === 0) rate = onGround ? M.GROUND_DECEL : M.AIR_DECEL;
      else if (vx !== 0 && Math.sign(vx) !== dir) rate = onGround ? M.TURN_RATE : M.AIR_ACCEL * 1.5;
      else rate = onGround ? M.GROUND_ACCEL : M.AIR_ACCEL;
      let newVx = vx + (dir * top - vx) * (1 - Math.exp(-rate * dt));
      if (dir === 0 && Math.abs(newVx) < 5) newVx = 0;
      body.setVelocityX(newVx);
      if (dir !== 0) this.hero.setFlipX(dir < 0);

      // Jump, double jump, coyote time and buffering.
      const pressed = active && inp.jumpPressed;
      if (pressed) {
        if (this.jumpsUsed === 0 && time - this.lastGround <= M.COYOTE_MS) { this.jumpsUsed = 1; this.jump(false); }
        else if (this.jumpsUsed < 2) { this.jumpsUsed = 2; this.jump(true); }
        else this.lastPress = time;
      } else if (active && onGround && body.velocity.y >= 0 && time - this.lastPress <= M.BUFFER_MS) {
        this.jumpsUsed = 1;
        this.jump(false);
        if (!inp.jumpHeld) body.setVelocityY(body.velocity.y * M.JUMP_CUT);
      }
      if (inp.jumpReleased && body.velocity.y < 0) body.setVelocityY(body.velocity.y * M.JUMP_CUT);
      const vy = body.velocity.y;
      const held = active && inp.jumpHeld;
      if (vy > 0 && !(held && vy < M.JUMP_VELOCITY * M.APEX_THRESHOLD)) body.setGravityY(M.FALL_EXTRA_GRAVITY);
      else if (held && Math.abs(vy) < M.JUMP_VELOCITY * M.APEX_THRESHOLD) body.setGravityY(-M.GRAVITY * (1 - M.APEX_GRAVITY));
      else body.setGravityY(0);
    }

    jump(isAir) {
      this.body.setVelocityY(-M.JUMP_VELOCITY);
      this.lastPress = -Infinity;
      this.squash(0.78, 1.25, 220);
      if (!isAir) {
        this.scene.spawnDust(this.zone.x, this.body.bottom, 3);
        this.sfx('jump');
      } else {
        this.scene.spawnPuff(this.zone.x, this.body.bottom, 0xffffff, 6);
        this.sfx('double');
        this.spinning = true;
        this.scene.tweens.add({ targets: this.hero, angle: this.hero.flipX ? -360 : 360, duration: 300, onComplete: () => { this.spinning = false; this.hero.setAngle(0); } });
      }
    }

    squash(sx, sy, duration) {
      this.scene.tweens.killTweensOf(this.hero, ['scaleX', 'scaleY']);
      this.hero.setScale(S * sx, S * sy);
      this.scene.tweens.add({ targets: this.hero, scaleX: S, scaleY: S, duration, ease: 'Back.easeOut' });
    }

    stun(ms, knockX = 0, knockY = -220) {
      const now = this.scene.time.now;
      if (now < this.invulnUntil || this.finished || this.respawning) return false;
      this.stunUntil = now + ms;
      this.invulnUntil = now + ms + M.INVULN_MS;
      this.body.setVelocity(knockX, knockY);
      if (this.isMe) {
        this.scene.addTrauma(0.5);
        this.scene.cameras.main.flash(80, 255, 255, 255);
        this.sfx('hit');
      }
      return true;
    }

    respawn() {
      const s = this.scene;
      this.respawning = true;
      if (this.isMe) s.addTrauma(0.4);
      this.body.setVelocity(0, 0);
      this.body.enable = false;
      s.time.delayedCall(650, () => {
        if (!this.zone.active) return;
        this.body.enable = true;
        this.body.reset(this.lastSafe.x, this.lastSafe.y - 4);
        this.respawning = false;
        this.invulnUntil = s.time.now + M.INVULN_MS;
        s.spawnPuff(this.zone.x, this.zone.y, 0xffffff, 8);
        this.sfx('respawn');
      });
    }

    sync(now) {
      const h = this.hero;
      h.x = this.zone.x;
      h.y = this.body.bottom + 1;
      if (!this.spinning) h.setAngle(this.body.velocity.x / M.RUN_SPEED * 4);
      const blink = now < this.invulnUntil && Math.floor(now / 90) % 2 === 0;
      h.setAlpha(this.respawning ? 0 : blink ? 0.35 : 1);
      if (now < this.stunUntil) h.setTint(0xb8c2ff); else h.clearTint();
      drawStars(this.stars, h.x, h.y - 36, now < this.stunUntil, now);
      if (this.label) this.label.setPosition(h.x, h.y - 36).setAlpha(this.respawning ? 0 : 1);
    }

    // What other players need to draw this runner.
    snapshot() {
      return {
        x: Math.round(this.zone.x), y: Math.round(this.body.bottom + 1), vx: Math.round(this.body.velocity.x),
        f: this.hero.flipX ? 1 : 0, a: this.respawning ? 'd' : this.stunned ? 's' : 'r',
        prog: Math.round(this.progress() * 1000) / 1000, ft: this.ft || 0,
      };
    }
  }

  function drawStars(g, x, y, on, now) {
    g.clear();
    if (!on) return;
    for (let i = 0; i < 3; i++) {
      const a = now / 180 + (i * Math.PI * 2) / 3;
      const sx = x + Math.cos(a) * 12, sy = y + Math.sin(a) * 4;
      g.fillStyle(0xffe14a, 1).lineStyle(1.5, 0x7a4a06, 1);
      g.fillCircle(sx, sy, 3.5).strokeCircle(sx, sy, 3.5);
    }
  }

  // Bot driver: runs right, jumps gaps, steps, walls and enemies, and uses powers sensibly.
  class BotBrain {
    constructor(runner, skill) {
      this.r = runner;
      this.skill = skill;              // 0..1, higher reacts faster and errs less
      this.holdUntil = 0;
      this.prevHeld = false;
      this.powerAt = 0;
      this.nextThink = 0;
      this.wantDouble = false;
      this.hesitateUntil = 0;
    }

    think(time) {
      const r = this.r;
      const s = r.scene;
      const b = r.body;
      const inp = { dir: 1, jumpPressed: false, jumpHeld: false, jumpReleased: false };
      if (time < this.hesitateUntil) inp.dir = 0;
      const onGround = b.blocked.down || b.touching.down;
      const c = Math.floor(r.x / TILE);
      const foot = b.bottom / TILE;
      const support = (col) => s.supportTop(col, foot);

      let jump = false;
      if (onGround) {
        const a1 = support(c + 1);
        const a2 = support(c + 2);
        const edge = (c + 1) * TILE - r.x;
        // Gap or drop ahead: jump at the edge.
        if ((a1 == null || a1 > foot + 2.5) && edge < 14 + this.skill * 6) jump = true;
        // A step or wall ahead.
        const rise = a1 != null ? foot - a1 : 0;
        const rise2 = a2 != null ? foot - a2 : 0;
        if ((rise >= 0.9 && edge < 26) || (rise2 >= 2.5 && edge < 10)) { jump = true; this.wantDouble = Math.max(rise, rise2) > 2.6; }
        // Enemy close ahead.
        for (const e of s.enemies) {
          if (time < e.deadUntil || !e.img.visible) continue;
          const dx = e.img.x - r.x;
          if (dx > 10 && dx < 70 && Math.abs(e.img.y - b.bottom) < 50) jump = true;
        }
        if (jump && Math.random() > 0.97 + this.skill * 0.03) { jump = false; this.hesitateUntil = time + 250; }
      } else if (r.jumpsUsed < 2 && b.velocity.y > -60) {
        // Second jump: over a pit, or when the wall ahead is still higher than the feet.
        const ahead = support(Math.floor((r.x + 48) / TILE));
        const under = support(c);
        const pit = (ahead == null || ahead > foot + 3) && (under == null || under > foot + 3);
        const wall = ahead != null && ahead < foot - 0.3;
        if (pit || wall || this.wantDouble) { jump = true; this.wantDouble = false; }
      }
      if (jump && time >= this.holdUntil) {
        inp.jumpPressed = true;
        this.holdUntil = time + 280 + this.skill * 80;
      }
      inp.jumpHeld = time < this.holdUntil;
      inp.jumpReleased = this.prevHeld && !inp.jumpHeld;
      this.prevHeld = inp.jumpHeld;

      // Powers.
      if (r.power && !this.powerAt) this.powerAt = time + 500 + Math.random() * 1500;
      inp.powerPressed = false;
      if (r.power && time > this.powerAt) {
        const others = s.racerPositions().filter((o) => o.k !== r.key && !o.ft);
        const ahead = others.filter((o) => o.x > r.x);
        const behind = others.filter((o) => o.x < r.x);
        const waited = time - this.powerAt;
        let use = false;
        if (r.power === 'speed') use = onGround;
        else if (r.power === 'slime') use = onGround && (behind.some((o) => r.x - o.x < 260) || waited > 3000);
        else if (r.power === 'fire') use = ahead.some((o) => o.x - r.x < 420 && Math.abs(o.y - r.y) < 30) || waited > 5000;
        else if (r.power === 'bolt') use = ahead.length > 0 || waited > 4000;
        if (use) { inp.powerPressed = true; this.powerAt = 0; }
      }
      return inp;
    }
  }

  return { TILE, S, M, COLORS, LABEL_STYLE, Runner, BotBrain, drawStars };
})();
