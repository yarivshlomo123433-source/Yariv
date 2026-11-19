// Coin Hopper: a small Phaser 4 platformer.
// All art is drawn at boot with Graphics, so the game has no image files to load
// and runs straight from index.html.

const TILE = 32;
const VIEW_W = 800;
const VIEW_H = 448;

// Movement tuning (pixels, seconds). One jump reaches about 3.5 tiles, a double jump about 7.
const RUN_SPEED = 220;
const GROUND_ACCEL = 18;   // how fast horizontal speed approaches the target, per second
const AIR_ACCEL = 11;
const GRAVITY = 1400;
const JUMP_VELOCITY = 560;
const FALL_EXTRA_GRAVITY = 900;  // heavier fall than rise, so the jump feels less floaty
const MAX_FALL = 900;
const JUMP_CUT = 0.5;      // releasing jump early while rising gives a shorter hop
const COYOTE_MS = 100;     // grace period to jump after walking off a ledge
const BUFFER_MS = 120;     // a press shortly before landing still jumps
const ENEMY_SPEED = 60;
const STOMP_BOUNCE = 420;

const HUD_STYLE = {
  fontFamily: 'Trebuchet MS, Verdana, sans-serif',
  fontSize: '20px',
  color: '#ffffff',
  stroke: '#1d2433',
  strokeThickness: 5,
};

function makeTextures(scene) {
  const g = scene.add.graphics();
  const tex = (key, w, h, draw) => {
    g.clear();
    draw(g);
    g.generateTexture(key, w, h);
  };

  // Player: a round-cornered hero with a scarf and eyes, facing right.
  tex('player', 24, 32, (g) => {
    g.fillStyle(0x2b3a67, 1).fillRoundedRect(2, 4, 20, 26, 6);
    g.fillStyle(0xff7a59, 1).fillRect(2, 16, 20, 4);
    g.fillStyle(0xffffff, 1).fillRect(12, 8, 6, 6);
    g.fillStyle(0x1d2433, 1).fillRect(15, 9, 3, 4);
    g.fillStyle(0x2b3a67, 1).fillRect(4, 28, 6, 4).fillRect(14, 28, 6, 4);
  });

  // Enemy: a spiky purple blob.
  tex('enemy', 28, 24, (g) => {
    g.fillStyle(0x8e44ad, 1);
    g.fillTriangle(4, 8, 8, 0, 12, 8).fillTriangle(12, 8, 16, 0, 20, 8).fillTriangle(18, 8, 22, 0, 26, 8);
    g.fillRoundedRect(0, 6, 28, 18, 8);
    g.fillStyle(0xffffff, 1).fillRect(6, 11, 6, 6).fillRect(16, 11, 6, 6);
    g.fillStyle(0x1d2433, 1).fillRect(7, 13, 3, 4).fillRect(17, 13, 3, 4);
  });

  tex('coin', 16, 16, (g) => {
    g.fillStyle(0xe1a500, 1).fillCircle(8, 8, 8);
    g.fillStyle(0xffd43b, 1).fillCircle(8, 8, 6);
    g.fillStyle(0xfff3bf, 1).fillRect(6, 4, 2, 8);
  });

  tex('grass', TILE, TILE, (g) => {
    g.fillStyle(0x9c6b3c, 1).fillRect(0, 0, TILE, TILE);
    g.fillStyle(0x7d532c, 1).fillRect(6, 16, 4, 4).fillRect(20, 24, 4, 4).fillRect(24, 12, 3, 3);
    g.fillStyle(0x4caf50, 1).fillRect(0, 0, TILE, 9);
    g.fillStyle(0x7bd36f, 1).fillRect(0, 0, TILE, 3);
  });

  tex('dirt', TILE, TILE, (g) => {
    g.fillStyle(0x9c6b3c, 1).fillRect(0, 0, TILE, TILE);
    g.fillStyle(0x7d532c, 1).fillRect(4, 6, 4, 4).fillRect(18, 18, 4, 4).fillRect(24, 4, 3, 3).fillRect(10, 24, 3, 3);
  });

  tex('plank', TILE, 12, (g) => {
    g.fillStyle(0x6d4c2f, 1).fillRect(0, 0, TILE, 12);
    g.fillStyle(0xc68e52, 1).fillRect(0, 0, TILE, 9);
    g.fillStyle(0x8a5d36, 1).fillRect(15, 0, 2, 9);
  });

  tex('flag', 32, 64, (g) => {
    g.fillStyle(0xdee2e6, 1).fillRect(4, 0, 4, 64);
    g.fillStyle(0xffd43b, 1).fillCircle(6, 3, 4);
    g.fillStyle(0xff4d6d, 1).fillTriangle(8, 6, 32, 15, 8, 24);
    g.fillStyle(0x6d4c2f, 1).fillRect(0, 58, 12, 6);
  });

  tex('puff', 12, 12, (g) => {
    g.fillStyle(0xffffff, 1).fillCircle(6, 6, 6);
  });

  tex('cloud', 96, 40, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(24, 24, 16).fillCircle(48, 16, 16).fillCircle(72, 24, 16).fillRect(24, 24, 48, 16);
  });

  g.destroy();
}

class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }
  create() {
    makeTextures(this);
    this.scene.start('title');
  }
}

class TitleScene extends Phaser.Scene {
  constructor() { super('title'); }
  create() {
    this.cameras.main.setBackgroundColor('#7ec8f0');
    this.add.image(160, 90, 'cloud').setAlpha(0.9);
    this.add.image(640, 130, 'cloud').setAlpha(0.8);
    for (let x = 0; x < VIEW_W; x += TILE) this.add.image(x + 16, VIEW_H - 16, 'grass');

    this.add.text(VIEW_W / 2, 120, 'COIN HOPPER', { ...HUD_STYLE, fontSize: '56px', strokeThickness: 8 }).setOrigin(0.5);
    this.add.text(VIEW_W / 2, 210,
      '← →  or  A D   to run\n↑  W  or  Space   to jump\npress jump again in the air for a double jump\nstomp enemies from above, reach the flag',
      { ...HUD_STYLE, fontSize: '20px', align: 'center', lineSpacing: 8 }).setOrigin(0.5, 0);
    const prompt = this.add.text(VIEW_W / 2, 385, 'Press Space or click to start', { ...HUD_STYLE, fontSize: '24px', color: '#ffd43b' }).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });

    const start = () => this.scene.start('play', { level: 0, score: 0 });
    this.input.keyboard.once('keydown-SPACE', start);
    this.input.keyboard.once('keydown-ENTER', start);
    this.input.once('pointerdown', start);
  }
}

class PlayScene extends Phaser.Scene {
  constructor() { super('play'); }

  init(data) {
    this.levelIndex = data.level ?? 0;
    this.startScore = data.score ?? 0;   // coins carried in from earlier levels
    this.levelCoins = 0;
    this.dead = false;
    this.finished = false;
    this.jumpsUsed = 0;
    this.lastGround = -Infinity;
    this.lastPress = -Infinity;
  }

  create() {
    const level = window.LEVELS[this.levelIndex];
    const cols = Math.max(...level.map.map((r) => r.length));
    this.grid = level.map.map((r) => r.padEnd(cols, '.'));
    this.worldW = cols * TILE;
    this.worldH = this.grid.length * TILE;

    this.cameras.main.setBackgroundColor('#7ec8f0');
    this.drawBackground();

    this.physics.world.setBounds(0, 0, this.worldW, this.worldH + 400);
    this.physics.world.setBoundsCollision(true, true, true, false); // open at the bottom: pits kill

    this.solids = this.physics.add.staticGroup();
    this.platforms = this.physics.add.staticGroup();
    this.coins = this.physics.add.group({ allowGravity: false, immovable: true });
    this.enemies = this.physics.add.group();
    let start = { x: TILE, y: TILE };

    this.grid.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        const x = c * TILE;
        const y = r * TILE;
        if (ch === '#') {
          const above = r > 0 ? this.grid[r - 1][c] : '.';
          this.solids.create(x + TILE / 2, y + TILE / 2, above === '#' ? 'dirt' : 'grass');
        } else if (ch === '=') {
          const p = this.platforms.create(x + TILE / 2, y + 6, 'plank');
          p.body.checkCollision.down = false;
          p.body.checkCollision.left = false;
          p.body.checkCollision.right = false;
        } else if (ch === 'o') {
          const coin = this.coins.create(x + TILE / 2, y + TILE / 2, 'coin');
          this.tweens.add({ targets: coin, y: coin.y - 4, duration: 700 + (c % 3) * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        } else if (ch === 'E') {
          const e = this.enemies.create(x + TILE / 2, y + TILE - 12, 'enemy');
          e.dir = -1;
          e.setCollideWorldBounds(true);
          e.body.setSize(24, 20).setOffset(2, 4);
        } else if (ch === 'P') {
          start = { x: x + TILE / 2, y: y + TILE / 2 };
        } else if (ch === 'F') {
          this.flag = this.physics.add.staticImage(x + TILE / 2, y + TILE - 32, 'flag');
          this.flag.body.setSize(16, 64);
        }
      });
    });
    this.totalCoins = this.coins.countActive();

    this.player = this.physics.add.sprite(start.x, start.y, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(18, 28).setOffset(3, 4);
    this.player.body.setMaxVelocity(RUN_SPEED * 2, MAX_FALL);

    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.enemies, this.solids);
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.overlap(this.player, this.coins, (_p, coin) => this.collectCoin(coin));
    this.physics.add.overlap(this.player, this.enemies, (_p, enemy) => this.touchEnemy(enemy));
    this.physics.add.overlap(this.player, this.flag, () => this.reachFlag());

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.worldW, this.worldH);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.fadeIn(250);

    this.keys = this.input.keyboard.addKeys({
      left: 'LEFT', right: 'RIGHT', up: 'UP', a: 'A', d: 'D', w: 'W', space: 'SPACE',
    });

    this.hud = this.add.text(16, 12, '', HUD_STYLE).setScrollFactor(0).setDepth(10);
    this.updateHud();
    const banner = this.add.text(VIEW_W / 2, 90, `Level ${this.levelIndex + 1}: ${level.name}`, { ...HUD_STYLE, fontSize: '32px' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(10);
    this.tweens.add({ targets: banner, alpha: 0, delay: 1200, duration: 500 });
  }

  drawBackground() {
    for (let x = 80; x < this.worldW; x += 320) {
      this.add.image(x, 60 + ((x / 320) % 3) * 30, 'cloud').setScrollFactor(0.3).setAlpha(0.85);
    }
    const hills = this.add.graphics().setScrollFactor(0.5);
    hills.fillStyle(0x9ad7a0, 1);
    for (let x = 0; x < this.worldW; x += 260) hills.fillCircle(x, this.worldH + 40, 180);
  }

  isSolid(c, r) {
    const ch = this.grid[r]?.[c];
    return ch === '#' || ch === '=';
  }

  updateHud() {
    this.hud.setText(`Level ${this.levelIndex + 1}/${window.LEVELS.length}    Coins ${this.levelCoins}/${this.totalCoins}    Total ${this.startScore + this.levelCoins}`);
  }

  collectCoin(coin) {
    coin.disableBody(true, true);
    this.levelCoins += 1;
    this.updateHud();
    this.spawnPuff(coin.x, coin.y, 0xffd43b, 5);
  }

  touchEnemy(enemy) {
    if (this.dead || this.finished || !enemy.active) return;
    const body = this.player.body;
    const falling = body.velocity.y > 0;
    if (falling && body.bottom <= enemy.body.top + 12) {
      // Stomp: the enemy is flattened and the player bounces, with the double jump restored.
      enemy.disableBody(false, false);
      this.tweens.add({ targets: enemy, scaleY: 0.2, alpha: 0, y: enemy.y + 8, duration: 250, onComplete: () => enemy.destroy() });
      body.setVelocityY(-STOMP_BOUNCE);
      this.jumpsUsed = 1;
      this.spawnPuff(enemy.x, enemy.y, 0xd0bfff, 6);
    } else {
      this.die();
    }
  }

  reachFlag() {
    if (this.finished || this.dead) return;
    this.finished = true;
    this.player.body.setVelocity(0, this.player.body.velocity.y);
    const score = this.startScore + this.levelCoins;
    const last = this.levelIndex === window.LEVELS.length - 1;
    this.add.text(VIEW_W / 2, VIEW_H / 2 - 40, 'Level complete!', { ...HUD_STYLE, fontSize: '40px', color: '#ffd43b' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(10);
    this.time.delayedCall(1300, () => {
      if (last) this.scene.start('win', { score });
      else this.scene.start('play', { level: this.levelIndex + 1, score });
    });
  }

  die() {
    if (this.dead || this.finished) return;
    this.dead = true;
    this.cameras.main.shake(200, 0.01);
    this.player.setTint(0xff6b6b);
    this.player.body.enable = false;
    this.tweens.add({ targets: this.player, y: this.player.y - 40, angle: 180, duration: 350, yoyo: true });
    this.time.delayedCall(900, () => this.scene.restart({ level: this.levelIndex, score: this.startScore }));
  }

  spawnPuff(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const p = this.add.image(x, y, 'puff').setTint(color).setScale(0.6);
      const a = (Math.PI * 2 * i) / count;
      this.tweens.add({ targets: p, x: x + Math.cos(a) * 18, y: y + Math.sin(a) * 18, alpha: 0, scale: 0.1, duration: 300, onComplete: () => p.destroy() });
    }
  }

  jump(isAir) {
    this.player.body.setVelocityY(-JUMP_VELOCITY);
    this.lastPress = -Infinity;
    if (isAir) {
      this.spawnPuff(this.player.x, this.player.body.bottom, 0xffffff, 6);
      this.tweens.add({ targets: this.player, angle: this.player.flipX ? -360 : 360, duration: 300, onComplete: () => this.player.setAngle(0) });
    }
  }

  update(time, delta) {
    if (this.dead) return;
    if (this.player.y > this.worldH + 32) { this.die(); return; }
    if (this.finished) { this.player.body.setVelocityX(0); this.updateEnemies(); return; }

    const body = this.player.body;
    const k = this.keys;
    const JustDown = Phaser.Input.Keyboard.JustDown;
    const JustUp = Phaser.Input.Keyboard.JustUp;
    const onGround = body.blocked.down || body.touching.down;
    // Only count as grounded while not moving up, so the frame after a jump does not refill jumps.
    if (onGround && body.velocity.y >= 0) {
      this.lastGround = time;
      this.jumpsUsed = 0;
    }

    // Run.
    const dir = ((k.right.isDown || k.d.isDown) ? 1 : 0) - ((k.left.isDown || k.a.isDown) ? 1 : 0);
    const accel = (onGround ? GROUND_ACCEL : AIR_ACCEL) * (delta / 1000);
    body.setVelocityX(body.velocity.x + (dir * RUN_SPEED - body.velocity.x) * Math.min(1, accel));
    if (Math.abs(body.velocity.x) < 4 && dir === 0) body.setVelocityX(0);
    if (dir !== 0) this.player.setFlipX(dir < 0);

    // Jump, double jump, coyote time and jump buffering.
    const pressed = JustDown(k.up) | JustDown(k.w) | JustDown(k.space);
    const released = JustUp(k.up) | JustUp(k.w) | JustUp(k.space);
    const held = k.up.isDown || k.w.isDown || k.space.isDown;
    if (pressed) {
      if (this.jumpsUsed === 0 && time - this.lastGround <= COYOTE_MS) {
        this.jumpsUsed = 1;
        this.jump(false);
      } else if (this.jumpsUsed < 2) {
        this.jumpsUsed = 2;   // walking off a ledge also leaves exactly one air jump
        this.jump(true);
      } else {
        this.lastPress = time;
      }
    } else if (onGround && body.velocity.y >= 0 && time - this.lastPress <= BUFFER_MS) {
      this.jumpsUsed = 1;
      this.jump(false);
      if (!held) body.setVelocityY(body.velocity.y * JUMP_CUT);
    }
    if (released && body.velocity.y < 0) body.setVelocityY(body.velocity.y * JUMP_CUT);
    body.setGravityY(body.velocity.y > 0 ? FALL_EXTRA_GRAVITY : 0);

    // Lean into the motion a little.
    if (!this.tweens.isTweening(this.player)) {
      this.player.setScale(onGround ? 1 : 0.92, onGround ? 1 : 1.08);
    }

    this.updateEnemies();
  }

  updateEnemies() {
    for (const e of this.enemies.getChildren()) {
      if (!e.active || !e.body.enable) continue;
      if (e.body.blocked.left) e.dir = 1;
      else if (e.body.blocked.right) e.dir = -1;
      else if (e.body.blocked.down) {
        // Turn around at ledges instead of walking off.
        const aheadCol = Math.floor((e.x + e.dir * 14) / TILE);
        const belowRow = Math.floor((e.body.bottom + 2) / TILE);
        if (!this.isSolid(aheadCol, belowRow)) e.dir *= -1;
      }
      e.setVelocityX(e.dir * ENEMY_SPEED);
      e.setFlipX(e.dir > 0);
    }
  }
}

class WinScene extends Phaser.Scene {
  constructor() { super('win'); }
  create(data) {
    this.cameras.main.setBackgroundColor('#7ec8f0');
    for (let x = 0; x < VIEW_W; x += TILE) this.add.image(x + 16, VIEW_H - 16, 'grass');
    this.add.image(VIEW_W / 2, VIEW_H - 64, 'flag');
    this.add.text(VIEW_W / 2, 130, 'You win!', { ...HUD_STYLE, fontSize: '56px', strokeThickness: 8, color: '#ffd43b' }).setOrigin(0.5);
    this.add.text(VIEW_W / 2, 210, `Coins collected: ${data.score}`, { ...HUD_STYLE, fontSize: '28px' }).setOrigin(0.5);
    this.add.text(VIEW_W / 2, 270, 'Press Space or click to play again', { ...HUD_STYLE, fontSize: '22px' }).setOrigin(0.5);
    const again = () => this.scene.start('play', { level: 0, score: 0 });
    this.input.keyboard.once('keydown-SPACE', again);
    this.input.once('pointerdown', again);
  }
}

window.game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#7ec8f0',
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: GRAVITY }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, PlayScene, WinScene],
});
