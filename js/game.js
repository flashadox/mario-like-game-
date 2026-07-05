// ============================================================
// EMBER'S QUEST — a Mario-like run-n-gun platformer starring Ember,
// a soldier armed with a rapid-fire pistol, against a zombie horde.
// Vanilla JS + Canvas 2D, no external assets required.
// ============================================================

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const TILE = 40;
  const COLS = 185;
  const ROWS = 13;
  const WORLD_W = COLS * TILE;
  const WORLD_H = ROWS * TILE;
  const VIEW_W = canvas.width;
  const VIEW_H = canvas.height;
  const GRAVITY = 1800;
  const MAX_FALL = 1400;
  const NUM_LEVELS = 3;

  // Per-world visual themes and difficulty tuning
  const THEMES = [
    { name: 'Outskirts', sky: ['#5ec8ff', '#bdeaff', '#e8fbff'], hill1: '#8fd67f', hill2: '#79c766', orb: '#fff3b0', cloud: 'rgba(255,255,255,0.85)', speedMul: 1, spawnMul: 1 },
    { name: 'Graveyard', sky: ['#4a3d6b', '#8a6d9e', '#e8b98a'], hill1: '#3a3d4a', hill2: '#4a4d5a', orb: '#e8d6b0', cloud: 'rgba(180,170,200,0.5)', speedMul: 1.15, spawnMul: 1.3 },
    { name: 'Compound', sky: ['#0d1120', '#1c2440', '#38405c'], hill1: '#141824', hill2: '#1e2432', orb: '#cfe0ff', cloud: 'rgba(120,140,180,0.35)', speedMul: 1.3, spawnMul: 1.6 },
  ];

  // ---------------------------------------------------------
  // Tiny WebAudio SFX synth (no asset files needed)
  // ---------------------------------------------------------
  const Sfx = (() => {
    let actx = null;
    function ctxLazy() {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      return actx;
    }
    function tone(freq, dur, type = 'square', vol = 0.18, glideTo = null) {
      try {
        const ac = ctxLazy();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ac.currentTime);
        if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, ac.currentTime + dur);
        gain.gain.setValueAtTime(vol, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
        osc.connect(gain).connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + dur);
      } catch (e) { /* audio unavailable, ignore */ }
    }
    return {
      jump: () => tone(420, 0.16, 'square', 0.15, 720),
      coin: () => tone(880, 0.12, 'square', 0.15, 1400),
      stomp: () => tone(180, 0.14, 'sawtooth', 0.18, 60),
      power: () => tone(300, 0.35, 'triangle', 0.2, 900),
      hurt: () => tone(220, 0.3, 'sawtooth', 0.2, 80),
      bump: () => tone(500, 0.06, 'square', 0.12, 300),
      shoot: () => tone(900, 0.06, 'square', 0.1, 500),
      roar: () => { tone(140, 0.3, 'sawtooth', 0.2, 70); setTimeout(() => tone(110, 0.25, 'sawtooth', 0.18, 60), 120); },
      bossHit: () => tone(150, 0.1, 'square', 0.16, 90),
      bossDown: () => { tone(120, 0.5, 'sawtooth', 0.22, 40); setTimeout(() => tone(700, 0.4, 'square', 0.2, 1200), 260); },
      win: () => { tone(523, 0.15, 'square', 0.18, 523); setTimeout(() => tone(659, 0.15, 'square', 0.18, 659), 140); setTimeout(() => tone(784, 0.3, 'square', 0.18, 784), 280); },
      gameover: () => { tone(300, 0.2, 'sawtooth', 0.18, 200); setTimeout(() => tone(200, 0.35, 'sawtooth', 0.18, 100), 200); }
    };
  })();

  // ---------------------------------------------------------
  // Input
  // ---------------------------------------------------------
  const keys = { left: false, right: false, jump: false, jumpPressed: false, shoot: false };
  let pauseRequested = false, restartRequested = false;

  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' '].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
      if (!keys.jump) keys.jumpPressed = true;
      keys.jump = true;
    }
    if (e.key === 'x' || e.key === 'X' || e.key === 'Control') keys.shoot = true;
    if (e.key === 'p' || e.key === 'P') pauseRequested = true;
    if (e.key === 'r' || e.key === 'R') restartRequested = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') keys.jump = false;
    if (e.key === 'x' || e.key === 'X' || e.key === 'Control') keys.shoot = false;
  });

  function bindTouch(id, onDown, onUp) {
    const el = document.getElementById(id);
    const down = (e) => { e.preventDefault(); onDown(); };
    const up = (e) => { e.preventDefault(); onUp(); };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', up);
    el.addEventListener('mouseleave', up);
  }
  bindTouch('t-left', () => keys.left = true, () => keys.left = false);
  bindTouch('t-right', () => keys.right = true, () => keys.right = false);
  bindTouch('t-jump', () => { if (!keys.jump) keys.jumpPressed = true; keys.jump = true; }, () => keys.jump = false);
  bindTouch('t-shoot', () => keys.shoot = true, () => keys.shoot = false);

  // ---------------------------------------------------------
  // Level construction
  // ---------------------------------------------------------
  // Tile codes: '.' empty  'G' grass-top solid  'D' dirt solid  'B' brick solid
  // '?' gem-block (solid, pops a gem when bumped from below, then becomes 'U' used)
  // 'U' used block (solid)  'C' floating platform (solid)  '^' spikes (hazard, non-solid on top death touch)
  // 'P' crystal pillar (solid)
  const SOLID = new Set(['G', 'D', 'B', '?', 'U', 'C', 'P', 'X']);
  const HAZARD = new Set(['^']);

  function buildLevel(levelIndex) {
    const theme = THEMES[levelIndex];
    const tiles = [];
    for (let r = 0; r < ROWS; r++) tiles.push(new Array(COLS).fill('.'));

    const groundTop = ROWS - 3; // row index where grass starts
    // pits: [startCol, endCol] inclusive, no ground there (course runs through col ~146; the
    // boss arena and gate beyond that stay on solid ground)
    const pits = [[24, 25], [46, 48], [64, 65], [92, 95], [112, 113], [128, 130]];
    const isPit = (c) => pits.some(([a, b]) => c >= a && c <= b);

    for (let c = 0; c < COLS; c++) {
      if (isPit(c)) continue;
      tiles[groundTop][c] = 'G';
      for (let r = groundTop + 1; r < ROWS; r++) tiles[r][c] = 'D';
    }

    const coins = [];
    const berries = [];
    const enemies = [];
    let flag = null;

    const setTile = (c, r, t) => { if (r >= 0 && r < ROWS && c >= 0 && c < COLS) tiles[r][c] = t; };
    const addCoinRow = (c0, r, n, gap = 1) => { for (let i = 0; i < n; i++) coins.push({ c: c0 + i * gap, r }); };

    // --- Section 1: gentle intro, a few coins and one critter ---
    addCoinRow(6, groundTop - 3, 5);
    setTile(14, groundTop - 3, '?');
    coins.push({ c: 14, r: groundTop - 5 });
    enemies.push({ type: 'zombie', c: 18, r: groundTop - 1, range: [16, 22] });

    // pillar obstacle before first pit
    setTile(21, groundTop - 1, 'P');
    setTile(21, groundTop - 2, 'P');

    // --- Section 2: floating platform staircase over pit ---
    for (let i = 0; i < 4; i++) setTile(28 + i, groundTop - 3 - i, 'C');
    coins.push({ c: 29, r: groundTop - 5 }, { c: 30, r: groundTop - 6 }, { c: 31, r: groundTop - 7 });
    for (let i = 0; i < 4; i++) setTile(33 + i, groundTop - 6 + i, 'C');

    enemies.push({ type: 'zombie', c: 38, r: groundTop - 1, range: [36, 44] });
    enemies.push({ type: 'flyer', c: 41, r: groundTop - 5, range: [38, 45], baseR: groundTop - 5 });

    setTile(43, groundTop - 3, '?');
    berries.push({ c: 43, r: groundTop - 5 });

    setTile(50, groundTop - 1, 'P');
    setTile(51, groundTop - 1, 'P');
    setTile(51, groundTop - 2, 'P');

    // --- Section 3: brick bridge with gem block cluster ---
    for (let c = 54; c <= 62; c++) setTile(c, groundTop - 4, 'B');
    setTile(56, groundTop - 4, '?');
    setTile(58, groundTop - 4, '?');
    setTile(60, groundTop - 4, '?');
    addCoinRow(56, groundTop - 6, 5);

    enemies.push({ type: 'zombie', c: 70, r: groundTop - 1, range: [68, 78] });
    enemies.push({ type: 'zombie', c: 76, r: groundTop - 1, range: [68, 78] });

    setTile(83, groundTop - 1, 'P');
    setTile(84, groundTop - 1, 'P');
    setTile(83, groundTop - 2, 'P');
    setTile(84, groundTop - 2, 'P');

    // hazard spikes patch
    setTile(88, groundTop, '^');
    setTile(89, groundTop, '^');

    // --- Section 4: sky bridge over the big gap ---
    for (let i = 0; i < 3; i++) setTile(92 + i, groundTop - 6, 'C');
    coins.push({ c: 93, r: groundTop - 8 });
    for (let i = 0; i < 3; i++) setTile(96 + i, groundTop - 6, 'C');
    berries.push({ c: 97, r: groundTop - 8 });

    enemies.push({ type: 'flyer', c: 100, r: groundTop - 5, range: [97, 108], baseR: groundTop - 5 });
    enemies.push({ type: 'zombie', c: 105, r: groundTop - 1, range: [102, 111] });

    setTile(115, groundTop - 3, '?');
    setTile(117, groundTop - 3, '?');
    addCoinRow(115, groundTop - 5, 4);

    enemies.push({ type: 'zombie', c: 120, r: groundTop - 1, range: [118, 126] });
    enemies.push({ type: 'zombie', c: 124, r: groundTop - 1, range: [118, 126] });

    setTile(133, groundTop - 1, 'P');
    setTile(134, groundTop - 1, 'P');
    setTile(133, groundTop - 2, 'P');
    setTile(134, groundTop - 2, 'P');
    setTile(133, groundTop - 3, 'P');
    setTile(134, groundTop - 3, 'P');

    addCoinRow(140, groundTop - 3, 6);

    // --- Extra enemies on higher difficulty worlds, reusing existing safe ground ---
    if (levelIndex >= 1) {
      enemies.push({ type: 'zombie', c: 9, r: groundTop - 1, range: [7, 13] });
      enemies.push({ type: 'zombie', c: 61, r: groundTop - 1, range: [55, 63] });
    }
    if (levelIndex >= 2) {
      enemies.push({ type: 'zombie', c: 108, r: groundTop - 1, range: [103, 111] });
      enemies.push({ type: 'flyer', c: 60, r: groundTop - 6, range: [54, 63], baseR: groundTop - 6 });
    }

    // --- Boss arena: flat ground, sealed behind a gate until the boss falls ---
    const arenaStartCol = 150;
    const gateCol = COLS - 12;
    const flagCol = COLS - 5;

    for (let r = groundTop - 6; r < groundTop; r++) setTile(gateCol, r, 'X');

    const boss = {
      c: arenaStartCol + 4,
      r: groundTop - 1,
      rangeCols: [arenaStartCol + 1, gateCol - 2],
      hp: 12 + levelIndex * 6,
      kind: levelIndex === 0 ? 'brute' : levelIndex === 1 ? 'bog' : 'overlord',
      name: levelIndex === 0 ? 'GRAVE BRUTE' : levelIndex === 1 ? 'BOG ABOMINATION' : 'ZOMBIE OVERLORD',
      hasSpit: levelIndex >= 1,
    };

    // --- Flagpole goal, beyond the gate ---
    for (let r = groundTop - 8; r < groundTop; r++) setTile(flagCol, r, '|');
    flag = { c: flagCol, rTop: groundTop - 8, rBase: groundTop };

    // checkpoints: mid-course, and just outside the boss arena
    const checkpoints = [70, arenaStartCol];

    return { tiles, groundTop, coins, berries, enemies, flag, checkpoints, boss, gateCol, theme, levelIndex };
  }

  // ---------------------------------------------------------
  // Entities
  // ---------------------------------------------------------
  class Player {
    constructor(x, y) {
      this.reset(x, y);
    }
    reset(x, y) {
      this.x = x; this.y = y;
      this.w = 30; this.h = 38;
      this.vx = 0; this.vy = 0;
      this.onGround = false;
      this.facing = 1;
      this.big = false;
      this.invincible = 0; // seconds of hurt-invincibility
      this.starPower = 0; // seconds of star invincibility (visual rainbow, kills on touch)
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.animT = 0;
      this.squash = 1;
      this.dead = false;
      this.shootCooldown = 0;
      this.muzzleFlash = 0;
    }
    get hitboxH() { return this.big ? 54 : 38; }
    grow() {
      if (!this.big) {
        this.big = true;
        this.h = 54;
        this.y -= 16;
      }
    }
    shrink() {
      if (this.big) {
        this.big = false;
        this.h = 38;
        return true;
      }
      return false;
    }
  }

  class Zombie {
    constructor(c, r, range) {
      this.x = c * TILE; this.y = (r + 1) * TILE - 30;
      this.w = 32; this.h = 30;
      this.vx = -60;
      this.range = [range[0] * TILE, (range[1] + 1) * TILE];
      this.alive = true;
      this.squish = 0;
      this.legT = 0;
    }
  }

  class MutantBat {
    constructor(c, r, range, baseR) {
      this.x = c * TILE; this.baseY = baseR * TILE;
      this.y = this.baseY;
      this.w = 30; this.h = 26;
      this.vx = -50;
      this.range = [range[0] * TILE, (range[1] + 1) * TILE];
      this.t = Math.random() * 10;
      this.alive = true;
      this.squish = 0;
    }
  }

  class Boss {
    constructor(def, speedMul) {
      this.kind = def.kind;
      this.name = def.name;
      this.w = 70; this.h = 70;
      this.x = def.c * TILE; this.y = (def.r + 1) * TILE - this.h;
      this.baseSpeed = 90 * speedMul;
      this.vx = -this.baseSpeed;
      this.range = [def.rangeCols[0] * TILE, (def.rangeCols[1] + 1) * TILE];
      this.hp = def.hp; this.maxHp = def.hp;
      this.hasSpit = def.hasSpit;
      this.alive = true;
      this.squish = 0;
      this.hitFlash = 0;
      this.legT = 0;
      this.charging = false;
      this.chargeDur = 0;
      this.chargeTimer = 2.5 + Math.random() * 1.5;
      this.spitTimer = 3 + Math.random() * 1.5;
    }
  }

  // ---------------------------------------------------------
  // Particles
  // ---------------------------------------------------------
  let particles = [];
  function spawnBurst(x, y, color, n = 8, speed = 220) {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      particles.push({
        x, y, vx: Math.cos(a) * speed * (0.5 + Math.random() * 0.6),
        vy: Math.sin(a) * speed * (0.5 + Math.random() * 0.6) - 80,
        life: 0.5 + Math.random() * 0.3, t: 0, color, size: 3 + Math.random() * 3
      });
    }
  }
  function spawnFloatText(x, y, text, color = '#fff') {
    particles.push({ x, y, vx: 0, vy: -60, life: 0.7, t: 0, text, color, isText: true });
  }

  // ---------------------------------------------------------
  // Screen juice: shake + hit flash + boss intro banner
  // ---------------------------------------------------------
  let shakeT = 0, shakeMag = 0;
  let hitFlash = 0;
  let bossBanner = 0;
  let bossBannerShown = false;
  function shake(mag, dur) { shakeT = Math.max(shakeT, dur); shakeMag = Math.max(shakeMag, mag); }
  function flashHit(strength) { hitFlash = Math.max(hitFlash, strength); }

  // ---------------------------------------------------------
  // Game state
  // ---------------------------------------------------------
  const STATE = { START: 0, PLAY: 1, PAUSE: 2, OVER: 3, WIN: 4, LEVEL_COMPLETE: 5 };
  let state = STATE.START;

  let level, player, camX = 0;
  let entCoins, entBerries, entEnemies, blockBumps, bullets, entBoss, bossProjectiles;
  let score = 0, lives = 3, timeLeft = 400, checkpointX = 0;
  let deathTimer = 0;
  let flagSliding = false;
  let currentLevelIndex = 0;

  function loadLevel(idx) {
    currentLevelIndex = idx;
    level = buildLevel(idx);
    const startX = 3 * TILE;
    const startY = (level.groundTop - 2) * TILE;
    player = new Player(startX, startY);
    camX = 0;
    entCoins = level.coins.map(c => ({ x: c.c * TILE + TILE / 2, y: c.r * TILE + TILE / 2, taken: false, bob: Math.random() * 10 }));
    entBerries = level.berries.map(b => ({ x: b.c * TILE + TILE / 2, y: b.r * TILE + TILE / 2, taken: false, bob: Math.random() * 10 }));
    entEnemies = level.enemies.map(e => e.type === 'zombie'
      ? new Zombie(e.c, e.r, e.range)
      : new MutantBat(e.c, e.r, e.range, e.baseR));
    entEnemies.forEach(e => { e.vx *= level.theme.speedMul; });
    entBoss = new Boss(level.boss, level.theme.speedMul);
    bossProjectiles = [];
    blockBumps = {}; // key "c,r" -> {t}
    bullets = [];
    timeLeft = 400; checkpointX = startX;
    particles = [];
    deathTimer = 0; flagSliding = false;
    shakeT = 0; shakeMag = 0; hitFlash = 0; bossBanner = 0; bossBannerShown = false;
    updateHUD(true);
  }

  function newGame() {
    score = 0; lives = 3;
    loadLevel(0);
    state = STATE.START;
  }

  function respawnAtCheckpoint() {
    player.reset(checkpointX, (level.groundTop - 2) * TILE);
  }

  function tileAt(c, r) {
    if (r < 0) return '.';
    if (r >= ROWS || c < 0 || c >= COLS) return 'D';
    return level.tiles[r][c];
  }
  function setTileAt(c, r, t) { if (r >= 0 && r < ROWS && c >= 0 && c < COLS) level.tiles[r][c] = t; }

  // ---------------------------------------------------------
  // Collision helpers (axis separated AABB vs tilemap)
  // ---------------------------------------------------------
  function rectVsTilesX(ent, dx) {
    if (dx === 0) return ent.x;
    const dir = Math.sign(dx);
    const newX = ent.x + dx;
    const top = Math.floor(ent.y / TILE);
    const bottom = Math.floor((ent.y + ent.h - 1) / TILE);
    const edgeCol = dir > 0 ? Math.floor((newX + ent.w - 1) / TILE) : Math.floor(newX / TILE);
    for (let r = top; r <= bottom; r++) {
      const t = tileAt(edgeCol, r);
      if (SOLID.has(t)) {
        return dir > 0 ? edgeCol * TILE - ent.w : (edgeCol + 1) * TILE;
      }
    }
    return newX;
  }

  function rectVsTilesY(ent, dy, onLand, onHeadBump) {
    if (dy === 0) return { y: ent.y, ground: false };
    const dir = Math.sign(dy);
    const newY = ent.y + dy;
    const left = Math.floor(ent.x / TILE);
    const right = Math.floor((ent.x + ent.w - 1) / TILE);
    const edgeRow = dir > 0 ? Math.floor((newY + ent.h - 1) / TILE) : Math.floor(newY / TILE);
    for (let c = left; c <= right; c++) {
      const t = tileAt(c, edgeRow);
      if (SOLID.has(t)) {
        if (dir > 0) {
          if (onLand) onLand();
          return { y: edgeRow * TILE - ent.h, ground: true };
        } else {
          if (onHeadBump) onHeadBump(c, edgeRow, t);
          return { y: (edgeRow + 1) * TILE, ground: false };
        }
      }
    }
    return { y: newY, ground: false };
  }

  function hazardTouch(ent) {
    const top = Math.floor(ent.y / TILE);
    const bottom = Math.floor((ent.y + ent.h - 1) / TILE);
    const left = Math.floor(ent.x / TILE);
    const right = Math.floor((ent.x + ent.w - 1) / TILE);
    for (let r = top; r <= bottom; r++)
      for (let c = left; c <= right; c++)
        if (HAZARD.has(tileAt(c, r))) return true;
    return false;
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------------------------------------------------------
  // Update
  // ---------------------------------------------------------
  const JUMP_V = -700;
  const BIG_JUMP_V = -740;
  const RUN_ACCEL = 2200;
  const RUN_MAX = 260;
  const FRICTION = 2600;
  const COYOTE_TIME = 0.09;
  const JUMP_BUFFER = 0.1;
  const BULLET_SPEED = 820;
  const FIRE_RATE_NORMAL = 0.26;
  const FIRE_RATE_FAST = 0.13;

  function hurtPlayer() {
    if (player.invincible > 0 || player.starPower > 0) return;
    Sfx.hurt();
    flashHit(0.3);
    shake(3, 0.12);
    if (player.shrink()) {
      player.invincible = 1.6;
    } else {
      loseLife();
    }
  }

  function loseLife() {
    lives--;
    updateHUD();
    flashHit(0.55);
    shake(7, 0.25);
    if (lives < 0) {
      gameOver();
    } else {
      deathTimer = 0.9;
      player.dead = true;
      Sfx.hurt();
    }
  }

  function gameOver() {
    state = STATE.OVER;
    Sfx.gameover();
    document.getElementById('final-score').textContent = `Score: ${score}`;
    document.getElementById('gameover-screen').classList.remove('hidden');
  }

  function winLevel() {
    score += Math.floor(timeLeft) * 10;
    updateHUD();
    if (currentLevelIndex < NUM_LEVELS - 1) {
      state = STATE.LEVEL_COMPLETE;
      Sfx.win();
      document.getElementById('levelcomplete-title').textContent = `${level.theme.name.toUpperCase()} CLEARED!`;
      document.getElementById('levelcomplete-score').textContent = `Score: ${score}`;
      document.getElementById('levelcomplete-screen').classList.remove('hidden');
    } else {
      state = STATE.WIN;
      Sfx.win();
      document.getElementById('win-score').textContent = `Score: ${score}`;
      document.getElementById('win-screen').classList.remove('hidden');
    }
  }

  function update(dt) {
    if (state !== STATE.PLAY) return;

    if (deathTimer > 0) {
      deathTimer -= dt;
      player.vy += GRAVITY * dt * 0.4;
      player.y += player.vy * dt;
      if (deathTimer <= 0) {
        if (lives < 0) return;
        respawnAtCheckpoint();
        player.dead = false;
      }
      return;
    }

    if (flagSliding) {
      player.y += 260 * dt;
      const baseY = (level.groundTop) * TILE - player.h;
      if (player.y >= baseY) {
        player.y = baseY;
        flagSliding = false;
        player.vx = 160;
        winLevel();
      }
      camX = clamp(player.x - VIEW_W * 0.35, 0, WORLD_W - VIEW_W);
      return;
    }

    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; loseLife(); }

    if (player.invincible > 0) player.invincible -= dt;
    if (player.starPower > 0) player.starPower -= dt;

    // horizontal movement
    const accel = RUN_ACCEL;
    if (keys.left && !keys.right) {
      player.vx -= accel * dt;
      player.facing = -1;
    } else if (keys.right && !keys.left) {
      player.vx += accel * dt;
      player.facing = 1;
    } else {
      const f = FRICTION * dt;
      if (player.vx > 0) player.vx = Math.max(0, player.vx - f);
      else if (player.vx < 0) player.vx = Math.min(0, player.vx + f);
    }
    player.vx = clamp(player.vx, -RUN_MAX, RUN_MAX);

    // jump buffering + coyote time
    if (keys.jumpPressed) player.jumpBuffer = JUMP_BUFFER;
    keys.jumpPressed = false;
    player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
    player.coyote = player.onGround ? COYOTE_TIME : Math.max(0, player.coyote - dt);

    if (player.jumpBuffer > 0 && player.coyote > 0) {
      player.vy = player.big ? BIG_JUMP_V : JUMP_V;
      player.jumpBuffer = 0;
      player.coyote = 0;
      player.onGround = false;
      player.squash = 1.25;
      Sfx.jump();
    }
    // variable jump height: cut upward velocity if jump released early
    if (!keys.jump && player.vy < -250) player.vy = -250;

    // gravity
    player.vy += GRAVITY * dt;
    if (player.vy > MAX_FALL) player.vy = MAX_FALL;

    // move X
    player.x = rectVsTilesX(player, player.vx * dt);
    player.x = clamp(player.x, 0, WORLD_W - player.w);

    // move Y
    player.onGround = false;
    const res = rectVsTilesY(player, player.vy * dt, () => {
      player.vy = 0; player.onGround = true;
    }, (c, r, t) => {
      player.vy = 40;
      handleBlockBump(c, r, t);
    });
    player.y = res.y;
    if (res.ground) player.onGround = true;

    // fell into pit
    if (player.y > WORLD_H + 100) {
      loseLife();
      return;
    }

    // hazards
    if (hazardTouch(player)) hurtPlayer();

    // checkpoints
    for (const cpCol of level.checkpoints) {
      const cpX = cpCol * TILE;
      if (player.x >= cpX && cpX > checkpointX) checkpointX = cpX;
    }

    // squash/stretch cosmetic recovery
    player.squash += (1 - player.squash) * Math.min(1, dt * 10);
    player.animT += dt * (Math.abs(player.vx) / RUN_MAX) * 10;

    // shooting
    player.shootCooldown = Math.max(0, player.shootCooldown - dt);
    player.muzzleFlash = Math.max(0, player.muzzleFlash - dt);
    if (keys.shoot && player.shootCooldown <= 0) {
      fireBullet();
      player.shootCooldown = player.big ? FIRE_RATE_FAST : FIRE_RATE_NORMAL;
      player.muzzleFlash = 0.06;
    }

    updateCoins(dt);
    updateBerries(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateBoss(dt);
    updateBossProjectiles(dt);
    updateFlag();

    camX = clamp(player.x - VIEW_W * 0.4, 0, WORLD_W - VIEW_W);

    updateParticles(dt);
  }

  function handleBlockBump(c, r, t) {
    if (t === '?') {
      setTileAt(c, r, 'U');
      entCoins.push({ x: c * TILE + TILE / 2, y: r * TILE - 10, taken: false, bob: 0, popped: true, popT: 0.4 });
      score += 50;
      Sfx.coin();
      updateHUD();
    } else {
      Sfx.bump();
    }
    blockBumps[`${c},${r}`] = { t: 0.15 };
  }

  function updateCoins(dt) {
    for (const g of entCoins) {
      if (g.taken) continue;
      g.bob += dt * 4;
      if (g.popped) {
        g.popT -= dt;
        g.y -= 80 * dt;
        if (g.popT <= 0) g.taken = true;
        continue;
      }
      const box = { x: g.x - 12, y: g.y - 12, w: 24, h: 24 };
      if (aabb(player, box)) {
        g.taken = true;
        score += 50;
        Sfx.coin();
        spawnBurst(g.x, g.y, '#ffd44d', 6, 140);
        updateHUD();
      }
    }
  }

  function updateBerries(dt) {
    for (const b of entBerries) {
      if (b.taken) continue;
      b.bob += dt * 3;
      const box = { x: b.x - 14, y: b.y - 14, w: 28, h: 28 };
      if (aabb(player, box)) {
        b.taken = true;
        player.grow();
        score += 200;
        Sfx.power();
        spawnFloatText(player.x + player.w / 2, player.y - 10, '+200', '#ffd44d');
        updateHUD();
      }
    }
  }

  function updateEnemies(dt) {
    for (const e of entEnemies) {
      if (!e.alive) continue;
      if (e.squish !== undefined && e.squish > 0) {
        e.squish -= dt;
        if (e.squish <= 0) e.alive = false;
        continue;
      }
      if (e instanceof Zombie) {
        const nx = e.x + e.vx * dt;
        if (nx < e.range[0] || nx + e.w > e.range[1]) e.vx *= -1;
        else {
          const dir = Math.sign(e.vx);
          const testX = dir > 0 ? nx + e.w : nx;
          const footR = Math.floor((e.y + e.h + 2) / TILE);
          const footC = Math.floor(testX / TILE);
          if (!SOLID.has(tileAt(footC, footR)) && !HAZARD.has(tileAt(footC, footR))) e.vx *= -1;
          else e.x = clamp(nx, 0, WORLD_W);
        }
        e.legT += dt * 8;
      } else {
        e.t += dt;
        e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(e.t * 2.4) * 22;
        if (e.x < e.range[0] || e.x + e.w > e.range[1]) e.vx *= -1;
      }

      if (aabb(player, e)) {
        const falling = player.vy > 0;
        const stomp = falling && (player.y + player.h) - e.y < 20;
        if (stomp && player.starPower <= 0) {
          e.squish = 0.25;
          e.vx = 0;
          player.vy = JUMP_V * 0.55;
          score += 100;
          Sfx.stomp();
          spawnBurst(e.x + e.w / 2, e.y + e.h / 2, '#6b8f47', 7, 160);
          spawnFloatText(e.x + e.w / 2, e.y, '+100', '#fff');
          updateHUD();
        } else if (player.starPower > 0) {
          e.alive = false;
          score += 100;
          Sfx.stomp();
          spawnBurst(e.x + e.w / 2, e.y + e.h / 2, '#6b8f47', 7, 160);
          updateHUD();
        } else {
          hurtPlayer();
        }
      }
    }
  }

  function fireBullet() {
    const dir = player.facing;
    const mx = player.x + player.w / 2 + dir * (player.w * 1.22);
    const my = player.y + player.h * 0.44;
    bullets.push({ x: mx - 5, y: my - 2, w: 10, h: 4, vx: dir * BULLET_SPEED, dead: false });
    Sfx.shoot();
    spawnBurst(mx, my, '#ffe27a', 3, 90);
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      if (b.dead) continue;
      b.x += b.vx * dt;

      const edgeX = b.vx > 0 ? b.x + b.w : b.x;
      const c = Math.floor(edgeX / TILE);
      const r = Math.floor((b.y + b.h / 2) / TILE);
      if (SOLID.has(tileAt(c, r))) {
        b.dead = true;
        spawnBurst(b.x + b.w / 2, b.y + b.h / 2, '#cfcfcf', 4, 90);
        continue;
      }

      for (const e of entEnemies) {
        if (!e.alive || e.squish > 0) continue;
        if (aabb(b, e)) {
          b.dead = true;
          e.squish = 0.25;
          e.vx = 0;
          score += 100;
          Sfx.stomp();
          spawnBurst(e.x + e.w / 2, e.y + e.h / 2, '#6b8f47', 7, 160);
          spawnFloatText(e.x + e.w / 2, e.y, '+100', '#fff');
          updateHUD();
          break;
        }
      }

      if (!b.dead && entBoss.alive && entBoss.squish <= 0 && aabb(b, entBoss)) {
        b.dead = true;
        damageBoss(1);
      }
    }
    bullets = bullets.filter(b => !b.dead);
  }

  function damageBoss(amount) {
    if (!entBoss.alive || entBoss.squish > 0) return;
    entBoss.hp -= amount;
    entBoss.hitFlash = Math.max(entBoss.hitFlash, 0.3);
    Sfx.bossHit();
    shake(2.5, 0.1);
    spawnBurst(entBoss.x + entBoss.w / 2, entBoss.y + entBoss.h / 2, '#6b8f47', 5, 130);
    if (entBoss.hp <= 0) {
      entBoss.hp = 0;
      entBoss.squish = 0.7;
      entBoss.vx = 0;
      score += 1000;
      Sfx.bossDown();
      shake(12, 0.5);
      spawnBurst(entBoss.x + entBoss.w / 2, entBoss.y + entBoss.h / 2, '#6b8f47', 22, 260);
      spawnFloatText(entBoss.x + entBoss.w / 2, entBoss.y, 'BOSS DOWN! +1000', '#ffd44d');
      updateHUD();
    }
  }

  function onBossDefeated() {
    for (let r = level.groundTop - 6; r < level.groundTop; r++) setTileAt(level.gateCol, r, '.');
  }

  function updateBoss(dt) {
    const b = entBoss;
    if (!b.alive) return;

    if (!bossBannerShown && Math.abs(player.x - b.x) < 480) {
      bossBannerShown = true;
      bossBanner = 2.6;
    }

    if (b.squish > 0) {
      b.squish -= dt;
      if (b.squish <= 0) { b.alive = false; onBossDefeated(); }
      return;
    }
    if (b.hitFlash > 0) b.hitFlash -= dt;

    const speedMul = level.theme.speedMul;
    if (b.charging) {
      b.chargeDur -= dt;
      b.x = clamp(b.x + b.vx * dt, b.range[0], b.range[1] - b.w);
      if (b.chargeDur <= 0) {
        b.charging = false;
        b.vx = (b.vx < 0 ? -1 : 1) * b.baseSpeed;
      }
    } else {
      b.chargeTimer -= dt;
      const nx = b.x + b.vx * dt;
      if (nx < b.range[0] || nx + b.w > b.range[1]) b.vx *= -1;
      else b.x = nx;
      b.legT += dt * 6;
      if (b.chargeTimer <= 0) {
        b.charging = true;
        b.chargeDur = 0.85;
        const dir = player.x < b.x ? -1 : 1;
        b.vx = dir * b.baseSpeed * 3;
        b.chargeTimer = 3 + Math.random() * 2;
        Sfx.roar();
        shake(4, 0.2);
      }
    }

    if (b.hasSpit) {
      b.spitTimer -= dt;
      if (b.spitTimer <= 0 && !b.charging) {
        b.spitTimer = 2.5 + Math.random() * 1.5;
        const dir = player.x < b.x ? -1 : 1;
        bossProjectiles.push({ x: b.x + b.w / 2, y: b.y + b.h * 0.3, w: 14, h: 14, vx: dir * 260 * speedMul, vy: -140, alive: true });
      }
    }

    if (aabb(player, b)) {
      const falling = player.vy > 0;
      const stomp = falling && (player.y + player.h) - b.y < 26;
      if (stomp && b.hitFlash <= 0) {
        player.vy = JUMP_V * 0.55;
        damageBoss(3);
      } else if (b.hitFlash <= 0) {
        hurtPlayer();
      }
    }
  }

  function updateBossProjectiles(dt) {
    for (const p of bossProjectiles) {
      if (!p.alive) continue;
      p.vy += GRAVITY * 0.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const c = Math.floor((p.x + p.w / 2) / TILE);
      const r = Math.floor((p.y + p.h / 2) / TILE);
      if (SOLID.has(tileAt(c, r)) || p.y > WORLD_H + 100) {
        p.alive = false;
        continue;
      }
      if (aabb(player, p)) {
        p.alive = false;
        hurtPlayer();
      }
    }
    bossProjectiles = bossProjectiles.filter(p => p.alive);
  }

  function updateFlag() {
    if (!level.flag || flagSliding) return;
    const poleBox = { x: level.flag.c * TILE + 14, y: level.flag.rTop * TILE, w: 12, h: (level.flag.rBase - level.flag.rTop) * TILE };
    if (aabb(player, poleBox)) {
      flagSliding = true;
      player.vx = 0;
      player.x = poleBox.x - player.w / 2;
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (!p.isText) p.vy += 400 * dt;
    }
    particles = particles.filter(p => p.t < p.life);
    for (const k in blockBumps) {
      blockBumps[k].t -= dt;
      if (blockBumps[k].t <= 0) delete blockBumps[k];
    }

    if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
    if (hitFlash > 0) hitFlash = Math.max(0, hitFlash - dt * 2.2);
    if (bossBanner > 0) bossBanner = Math.max(0, bossBanner - dt);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------
  function verticalGradient(x0, y0, x1, y1, colorTop, colorBottom) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, colorTop);
    g.addColorStop(1, colorBottom);
    return g;
  }

  function drawGroundShadow(cx, footY, radius, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(cx, footY - 2, radius, radius * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBackground() {
    const theme = level.theme;
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, theme.sky[0]);
    g.addColorStop(0.75, theme.sky[1]);
    g.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // sun / moon
    ctx.fillStyle = theme.orb;
    ctx.beginPath();
    ctx.arc(VIEW_W - 90, 80, 46, 0, Math.PI * 2);
    ctx.fill();

    // parallax hills
    const hillParX = camX * 0.3;
    ctx.fillStyle = theme.hill1;
    for (let i = -1; i < 6; i++) {
      const bx = i * 320 - (hillParX % 320);
      ctx.beginPath();
      ctx.ellipse(bx + 140, VIEW_H - 60, 170, 90, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = theme.hill2;
    for (let i = -1; i < 8; i++) {
      const bx = i * 220 - (hillParX * 1.4 % 220);
      ctx.beginPath();
      ctx.ellipse(bx + 100, VIEW_H - 40, 120, 60, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // clouds / fog
    const cloudParX = camX * 0.15;
    ctx.fillStyle = theme.cloud;
    for (let i = -1; i < 6; i++) {
      const bx = i * 260 - (cloudParX % 260);
      const by = 60 + (i % 3) * 40;
      drawCloud(bx + 60, by);
    }
  }

  function drawCloud(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.arc(x + 22, y - 8, 22, 0, Math.PI * 2);
    ctx.arc(x + 46, y, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTiles() {
    const firstCol = Math.max(0, Math.floor(camX / TILE) - 1);
    const lastCol = Math.min(COLS - 1, Math.ceil((camX + VIEW_W) / TILE) + 1);
    for (let r = 0; r < ROWS; r++) {
      for (let c = firstCol; c <= lastCol; c++) {
        const t = level.tiles[r][c];
        if (t === '.') continue;
        const x = c * TILE - camX;
        const y = r * TILE;
        const bump = blockBumps[`${c},${r}`];
        const by = bump ? -Math.sin((0.15 - bump.t) / 0.15 * Math.PI) * 8 : 0;
        drawTile(t, x, y + by, c, r);
      }
    }
  }

  function drawTile(t, x, y, c, r) {
    switch (t) {
      case 'G': {
        ctx.fillStyle = '#7a4a2b';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#5a9c3f';
        ctx.fillRect(x, y, TILE, 12);
        ctx.fillStyle = '#6fbd4f';
        for (let i = 0; i < 3; i++) ctx.fillRect(x + 4 + i * 12, y, 6, 6);
        break;
      }
      case 'D': {
        ctx.fillStyle = '#6b4327';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
        break;
      }
      case 'B': {
        ctx.fillStyle = '#b5602f';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = '#7c3f1c';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
        ctx.beginPath();
        ctx.moveTo(x + TILE / 2, y + 2); ctx.lineTo(x + TILE / 2, y + TILE - 2);
        ctx.stroke();
        break;
      }
      case '?': {
        ctx.fillStyle = '#ffb238';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = '#a6461e';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
        ctx.fillStyle = '#a6461e';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('?', x + TILE / 2, y + 27);
        break;
      }
      case 'U': {
        ctx.fillStyle = '#8a6a4a';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
        break;
      }
      case 'C': {
        ctx.fillStyle = '#c98a4a';
        ctx.fillRect(x, y, TILE, TILE * 0.5);
        ctx.fillStyle = '#a66a34';
        ctx.fillRect(x, y + TILE * 0.5, TILE, TILE * 0.5);
        break;
      }
      case 'P': {
        ctx.fillStyle = '#4fd6c9';
        ctx.fillRect(x + 2, y, TILE - 4, TILE);
        ctx.fillStyle = '#2fa89d';
        ctx.fillRect(x + 2, y, 6, TILE);
        ctx.fillStyle = '#8ff0e6';
        ctx.fillRect(x + TILE - 10, y, 6, TILE);
        break;
      }
      case '^': {
        ctx.fillStyle = '#d63b3b';
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.moveTo(x + i * 20, y + TILE);
          ctx.lineTo(x + i * 20 + 10, y + TILE - 26);
          ctx.lineTo(x + i * 20 + 20, y + TILE);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case '|': {
        ctx.fillStyle = '#c9c9c9';
        ctx.fillRect(x + TILE / 2 - 4, y, 8, TILE);
        if (r === level.flag.rTop) {
          ctx.fillStyle = '#ff5c5c';
          ctx.beginPath();
          ctx.moveTo(x + TILE / 2 + 4, y + 4);
          ctx.lineTo(x + TILE / 2 + 34, y + 14);
          ctx.lineTo(x + TILE / 2 + 4, y + 24);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'X': {
        ctx.fillStyle = '#2a1830';
        ctx.fillRect(x, y, TILE, TILE);
        const pulse = 0.5 + Math.sin(performance.now() / 220 + r) * 0.5;
        ctx.fillStyle = `rgba(200,80,255,${0.35 + pulse * 0.35})`;
        ctx.fillRect(x + 3, y, TILE - 6, TILE);
        ctx.strokeStyle = '#c060ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 3, y + 2, TILE - 6, TILE - 4);
        break;
      }
    }
  }

  function drawCoin(g, t) {
    if (g.taken) return;
    const x = g.x - camX;
    const y = g.y + Math.sin(g.bob) * 4;
    if (x < -30 || x > VIEW_W + 30) return;
    const squeeze = Math.abs(Math.cos(g.bob * 0.7)) * 8 + 6;
    ctx.fillStyle = '#ffd44d';
    ctx.beginPath();
    ctx.ellipse(x, y, squeeze, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c98a1e';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawBerry(b) {
    if (b.taken) return;
    const x = b.x - camX;
    const y = b.y + Math.sin(b.bob) * 3;
    if (x < -30 || x > VIEW_W + 30) return;
    ctx.fillStyle = '#ff5c8a';
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd44d';
    ctx.beginPath();
    ctx.arc(x - 4, y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a1f38';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#4a8f3d';
    ctx.beginPath();
    ctx.ellipse(x + 4, y - 14, 5, 8, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawZombie(e) {
    const x = e.x - camX;
    if (x < -60 || x > VIEW_W + 60) return;
    const squish = e.squish > 0 ? 0.35 : 1;
    const w = e.w, h = e.h;
    const dir = e.vx < 0 ? -1 : 1;
    const stagger = Math.sin(e.legT) * 3;
    const sway = Math.sin(e.legT * 0.5) * 0.03;
    const outline = 'rgba(10,16,6,0.5)';

    drawGroundShadow(x + w / 2, e.y + h, w * 0.5, 0.3);

    ctx.save();
    ctx.translate(x + w / 2, e.y + h);
    ctx.rotate(sway * dir);
    ctx.scale(1, squish);
    ctx.translate(-(w / 2), -h);

    // legs, staggering shuffle
    ctx.fillStyle = '#3a4a2e';
    ctx.fillRect(w * 0.28 - 4, h - 10 + Math.max(0, stagger), 8, 10 - Math.max(0, stagger));
    ctx.fillRect(w * 0.68 - 4, h - 10 + Math.max(0, -stagger), 8, 10 - Math.max(0, -stagger));

    // torso, tattered shirt
    const torsoGrad = verticalGradient(0, h * 0.34, 0, h * 0.78, '#749a5c', '#3c5230');
    ctx.fillStyle = torsoGrad;
    ctx.fillRect(w * 0.2, h * 0.36, w * 0.6, h * 0.4);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1;
    ctx.strokeRect(w * 0.2, h * 0.36, w * 0.6, h * 0.4);
    ctx.fillStyle = '#3a5028';
    for (let i = 0; i < 3; i++) ctx.fillRect(w * 0.2 + i * (w * 0.6 / 3), h * 0.36 + h * 0.4 - 4, w * 0.6 / 3 - 2, 6);

    // arms reaching out toward direction of travel
    ctx.fillStyle = '#7c9a63';
    ctx.fillRect(w * 0.5, h * 0.42, w * 0.42 * dir, 5);
    ctx.fillRect(w * 0.5, h * 0.58, w * 0.3 * dir, 5);

    // head
    const headGrad = verticalGradient(0, h * 0.02, 0, h * 0.4, '#9cba7e', '#71915a');
    ctx.fillStyle = headGrad;
    ctx.beginPath(); ctx.arc(w / 2, h * 0.22, w * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(w / 2, h * 0.22, w * 0.34, 0, Math.PI * 2); ctx.stroke();
    // matted hair patches
    ctx.fillStyle = '#2a2a1a';
    ctx.beginPath(); ctx.arc(w * 0.34, h * 0.06, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.6, h * 0.04, 3, 0, Math.PI * 2); ctx.fill();
    // sickly wound spot
    ctx.fillStyle = '#3a5c2e';
    ctx.beginPath(); ctx.arc(w * 0.28, h * 0.28, 3, 0, Math.PI * 2); ctx.fill();
    // glowing red eyes (subtle pulse)
    const eyePulse = 2.2 + Math.sin(performance.now() / 260 + e.legT) * 0.5;
    ctx.fillStyle = '#ff3020';
    ctx.beginPath(); ctx.arc(w * 0.4, h * 0.2, eyePulse, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.62, h * 0.2, eyePulse, 0, Math.PI * 2); ctx.fill();
    // groaning mouth
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(w * 0.42, h * 0.29, w * 0.18, 3);
    ctx.restore();
  }

  function drawMutantBat(e) {
    const x = e.x - camX;
    if (x < -60 || x > VIEW_W + 60) return;
    const squish = e.squish > 0 ? 0.35 : 1;
    const w = e.w, h = e.h;
    ctx.save();
    ctx.translate(x + w / 2, e.y + h / 2);
    ctx.scale(1, squish);
    const wing = Math.sin(performance.now() / 60) * 10;

    const wingGrad = verticalGradient(0, -h * 0.4, 0, h * 0.5, '#4a3a5c', '#2a2038');
    ctx.fillStyle = wingGrad;
    ctx.beginPath();
    ctx.moveTo(-w * 0.15, 0);
    ctx.quadraticCurveTo(-w * 0.9, wing - 6, -w * 0.75, 10);
    ctx.quadraticCurveTo(-w * 0.4, 4, -w * 0.15, -2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.15, 0);
    ctx.quadraticCurveTo(w * 0.9, -wing - 6, w * 0.75, 10);
    ctx.quadraticCurveTo(w * 0.4, 4, w * 0.15, -2);
    ctx.closePath(); ctx.fill();

    // gaunt undead body
    const bodyGrad = verticalGradient(0, -h * 0.44, 0, h * 0.44, '#6c7f5a', '#455636');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.34, h * 0.44, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(10,16,6,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.34, h * 0.44, 0, 0, Math.PI * 2); ctx.stroke();
    // ears
    ctx.fillStyle = '#455636';
    ctx.beginPath(); ctx.moveTo(-6, -h * 0.4); ctx.lineTo(-10, -h * 0.72); ctx.lineTo(-2, -h * 0.42); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6, -h * 0.4); ctx.lineTo(10, -h * 0.72); ctx.lineTo(2, -h * 0.42); ctx.closePath(); ctx.fill();
    // glowing eyes with soft halo
    const glow = ctx.createRadialGradient(0, -2, 0, 0, -2, 10);
    glow.addColorStop(0, 'rgba(255,60,30,0.55)');
    glow.addColorStop(1, 'rgba(255,60,30,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-14, -16, 28, 28);
    ctx.fillStyle = '#ff3020';
    ctx.beginPath(); ctx.arc(-4, -2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -2, 3, 0, Math.PI * 2); ctx.fill();
    // fangs
    ctx.fillStyle = '#e8e8d8';
    ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(-2, 12); ctx.lineTo(0, 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(4, 6); ctx.lineTo(2, 12); ctx.lineTo(0, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  const BOSS_PALETTE = {
    brute: { skin: '#7a3226', skinLight: '#a85038', jacket: '#4a2018', eye: '#ff5030' },
    bog: { skin: '#3a6b4a', skinLight: '#5c9470', jacket: '#254a34', eye: '#a0ff60' },
    overlord: { skin: '#241830', skinLight: '#3e2850', jacket: '#150c1e', eye: '#c060ff' },
  };

  function drawBoss(e) {
    const x = e.x - camX;
    if (x < -140 || x > VIEW_W + 140) return;
    const w = e.w, h = e.h;
    const squish = e.squish > 0 ? 0.4 : 1;
    const dir = e.vx < 0 ? -1 : 1;
    const stagger = Math.sin(e.legT) * 4;
    const pal = BOSS_PALETTE[e.kind];

    drawGroundShadow(x + w / 2, e.y + h, w * 0.55, 0.4);
    if (e.charging) {
      for (let i = 1; i <= 2; i++) {
        ctx.save();
        ctx.globalAlpha = 0.12 * (3 - i);
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.ellipse(x + w / 2 - dir * i * 16, e.y + h * 0.55, w * 0.4, h * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(x + w / 2, e.y + h);
    ctx.scale(1, squish);
    ctx.translate(-(w / 2), -h);
    if (e.hitFlash > 0) ctx.filter = 'brightness(2.2)';

    const outline = 'rgba(0,0,0,0.5)';

    // legs
    ctx.fillStyle = pal.jacket;
    ctx.fillRect(w * 0.28 - 7, h - 20 + Math.max(0, stagger), 14, 20 - Math.max(0, stagger));
    ctx.fillRect(w * 0.68 - 7, h - 20 + Math.max(0, -stagger), 14, 20 - Math.max(0, -stagger));

    // torso
    const torsoGrad = verticalGradient(0, h * 0.3, 0, h * 0.76, pal.skinLight, pal.skin);
    ctx.fillStyle = torsoGrad;
    ctx.fillRect(w * 0.16, h * 0.32, w * 0.68, h * 0.42);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.16, h * 0.32, w * 0.68, h * 0.42);
    ctx.fillStyle = pal.jacket;
    for (let i = 0; i < 4; i++) ctx.fillRect(w * 0.16 + i * (w * 0.68 / 4), h * 0.32 + h * 0.42 - 8, w * 0.68 / 4 - 3, 10);

    // arms reaching toward direction of travel
    ctx.fillStyle = pal.skin;
    ctx.fillRect(w * 0.5, h * 0.4, w * 0.5 * dir, 10);
    ctx.fillRect(w * 0.5, h * 0.58, w * 0.36 * dir, 9);

    // head
    const headGrad = verticalGradient(0, h * 0, 0, h * 0.5, pal.skinLight, pal.skin);
    ctx.fillStyle = headGrad;
    ctx.beginPath(); ctx.arc(w / 2, h * 0.2, w * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(w / 2, h * 0.2, w * 0.3, 0, Math.PI * 2); ctx.stroke();
    // eye glow halo
    ctx.fillStyle = pal.eye;
    ctx.globalAlpha = 0.18;
    ctx.beginPath(); ctx.arc(w / 2, h * 0.18, w * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.eye;
    ctx.beginPath(); ctx.arc(w * 0.38, h * 0.18, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.62, h * 0.18, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#160a0a';
    ctx.fillRect(w * 0.4, h * 0.27, w * 0.2, 4);

    // kind-specific flair
    if (e.kind === 'overlord') {
      ctx.fillStyle = pal.eye;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.35 + i * w * 0.15, h * 0.02);
        ctx.lineTo(w * 0.4 + i * w * 0.15, -h * 0.12);
        ctx.lineTo(w * 0.45 + i * w * 0.15, h * 0.02);
        ctx.closePath(); ctx.fill();
      }
    } else if (e.kind === 'bog') {
      ctx.fillStyle = 'rgba(160,255,96,0.6)';
      ctx.beginPath(); ctx.ellipse(w * 0.3, h * 0.5, 4, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(w * 0.7, h * 0.55, 4, 12, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = pal.jacket;
      ctx.beginPath(); ctx.moveTo(w * 0.2, h * 0.1); ctx.lineTo(w * 0.1, -h * 0.05); ctx.lineTo(w * 0.3, h * 0.08); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w * 0.8, h * 0.1); ctx.lineTo(w * 0.9, -h * 0.05); ctx.lineTo(w * 0.7, h * 0.08); ctx.closePath(); ctx.fill();
    }

    ctx.restore();
  }

  function drawBossProjectiles() {
    for (const p of bossProjectiles) {
      const x = p.x - camX;
      if (x < -30 || x > VIEW_W + 30) continue;
      ctx.fillStyle = 'rgba(140,220,90,0.9)';
      ctx.beginPath(); ctx.arc(x + p.w / 2, p.y + p.h / 2, p.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(200,255,160,0.6)';
      ctx.beginPath(); ctx.arc(x + p.w / 2, p.y + p.h / 2, p.w / 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawBossHealthBar() {
    const b = entBoss;
    if (!b || (!b.alive && b.squish <= 0)) return;
    const onScreen = b.x - camX > -300 && b.x - camX < VIEW_W + 300;
    if (!onScreen) return;
    const w = 320, h = 16, x = (VIEW_W - w) / 2, y = 56;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    const pct = Math.max(0, b.hp / b.maxHp);
    ctx.fillStyle = '#3a1010';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = pct > 0.4 ? '#d63b3b' : '#ff8a3d';
    ctx.fillRect(x, y, w * pct, h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.name, VIEW_W / 2, y - 6);
  }

  // --- Ember, a run-n-gun soldier ---
  function drawPlayer() {
    const x = player.x - camX;
    const y = player.y;
    const w = player.w, h = player.h;
    const blink = player.invincible > 0 && Math.floor(player.invincible * 12) % 2 === 0;
    if (blink) return;

    drawGroundShadow(x + w / 2, y + h, w * 0.55, player.onGround ? 0.32 : 0.14);

    ctx.save();
    ctx.translate(x + w / 2, y + h);
    const run = Math.abs(player.vx) > 10 && player.onGround;
    const idleBob = (!run && player.onGround) ? Math.sin(performance.now() / 480) * 0.018 : 0;
    const stretch = player.squash + idleBob;
    ctx.scale(player.facing / stretch, stretch);
    ctx.translate(0, -h);

    const star = player.starPower > 0;
    const hueShift = star ? (performance.now() / 5) % 360 : 0;
    let jacketLight, jacketDark, pantsLight, pantsDark;
    if (star) {
      jacketLight = `hsl(${hueShift},85%,65%)`; jacketDark = `hsl(${hueShift},85%,38%)`;
      pantsLight = `hsl(${(hueShift + 30) % 360},70%,45%)`; pantsDark = `hsl(${(hueShift + 30) % 360},70%,22%)`;
    } else if (player.big) {
      jacketLight = '#5c8aac'; jacketDark = '#22384a';
      pantsLight = '#4a5c38'; pantsDark = '#232d1b';
    } else {
      jacketLight = '#6b9c56'; jacketDark = '#33481f';
      pantsLight = '#4a5c38'; pantsDark = '#232d1b';
    }
    const jacketColor = star ? `hsl(${hueShift},80%,55%)` : (player.big ? '#355c78' : '#4a6b3a');
    const skinColor = '#e8b488';
    const outline = 'rgba(18,16,10,0.55)';

    const legSwing = run ? Math.sin(player.animT) * 10 : 0;
    const bw = w, bh = h;
    const headY = bh * 0.24;

    // legs
    const legGrad = verticalGradient(0, bh * 0.6, 0, bh, pantsLight, pantsDark);
    ctx.fillStyle = legGrad;
    ctx.fillRect(bw * 0.32 - 5, bh - 14 + Math.max(0, legSwing), 10, 14 - Math.max(0, legSwing));
    ctx.fillRect(bw * 0.68 - 5, bh - 14 + Math.max(0, -legSwing), 10, 14 - Math.max(0, -legSwing));
    // boots
    ctx.fillStyle = '#1a1a12';
    ctx.fillRect(bw * 0.32 - 6, bh - 5 + Math.max(0, legSwing) * 0.3, 12, 5);
    ctx.fillRect(bw * 0.68 - 6, bh - 5 + Math.max(0, -legSwing) * 0.3, 12, 5);

    // backpack
    ctx.fillStyle = '#2e3a22';
    ctx.fillRect(bw * 0.06, bh * 0.36, bw * 0.16, bh * 0.32);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1;
    ctx.strokeRect(bw * 0.06, bh * 0.36, bw * 0.16, bh * 0.32);

    // torso / jacket
    const jacketGrad = verticalGradient(0, bh * 0.3, 0, bh * 0.75, jacketLight, jacketDark);
    ctx.fillStyle = jacketGrad;
    ctx.fillRect(bw * 0.2, bh * 0.32, bw * 0.58, bh * 0.4);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(bw * 0.2, bh * 0.32, bw * 0.58, bh * 0.4);
    // belt
    ctx.fillStyle = '#2a2a1a';
    ctx.fillRect(bw * 0.2, bh * 0.64, bw * 0.58, bh * 0.06);
    // chest strap accent
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(bw * 0.24, bh * 0.33); ctx.lineTo(bw * 0.62, bh * 0.62);
    ctx.stroke();

    // gun arm, reaching forward in facing direction (local +x)
    ctx.fillStyle = jacketColor;
    ctx.fillRect(bw * 0.55, bh * 0.4, bw * 0.3, bh * 0.13);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(bw * 0.82, bh * 0.4, bw * 0.4, bh * 0.09);
    ctx.fillStyle = '#161616';
    ctx.fillRect(bw * 0.78, bh * 0.36, bw * 0.1, bh * 0.06);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(bw * 0.84, bh * 0.4, bw * 0.36, 1.5);

    // muzzle flash
    if (player.muzzleFlash > 0) {
      const fx = bw * 1.22, fy = bh * 0.44;
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        const r = i % 2 === 0 ? 9 : 4;
        ctx.lineTo(fx + Math.cos(a) * r, fy + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }

    // head
    ctx.fillStyle = skinColor;
    ctx.beginPath(); ctx.arc(bw / 2, headY + 4, bw * 0.3, 0, Math.PI * 2); ctx.fill();
    // jaw/chin shadow
    ctx.fillStyle = '#c99968';
    ctx.beginPath(); ctx.arc(bw * 0.56, headY + 10, bw * 0.12, 0, Math.PI * 2); ctx.fill();

    // helmet dome + brim
    const helmetGrad = verticalGradient(0, headY - bh * 0.1, 0, headY, jacketLight, jacketDark);
    ctx.fillStyle = helmetGrad;
    ctx.beginPath(); ctx.arc(bw / 2, headY, bw * 0.34, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(bw / 2, headY, bw * 0.34, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = jacketDark;
    ctx.fillRect(bw * 0.14, headY - 3, bw * 0.72, bh * 0.06);
    ctx.fillStyle = '#ffd44d';
    ctx.fillRect(bw * 0.42, headY - bh * 0.02, bw * 0.16, bh * 0.05);
    // helmet highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.arc(bw * 0.4, headY - bh * 0.06, bw * 0.08, 0, Math.PI * 2); ctx.fill();

    // eyes
    ctx.fillStyle = '#1a1a2a';
    ctx.beginPath(); ctx.arc(bw * 0.44, headY + 3, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bw * 0.6, headY + 3, 2.6, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  function drawBullets() {
    for (const b of bullets) {
      const x = b.x - camX;
      if (x < -20 || x > VIEW_W + 20) continue;
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,226,122,0.5)';
      ctx.fillRect(x - (b.vx > 0 ? 14 : -4), b.y, 14, b.h);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = 1 - p.t / p.life;
      const x = p.x - camX;
      if (p.isText) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, x, p.y);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function render() {
    ctx.save();
    if (shakeT > 0) {
      const s = shakeMag * (shakeT / Math.max(shakeT, 0.001));
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    drawBackground();
    drawTiles();
    for (const g of entCoins) drawCoin(g);
    for (const b of entBerries) drawBerry(b);
    for (const e of entEnemies) {
      if (!e.alive) continue;
      if (e instanceof Zombie) drawZombie(e); else drawMutantBat(e);
    }
    if (entBoss && (entBoss.alive || entBoss.squish > 0)) drawBoss(entBoss);
    drawBossProjectiles();
    drawBullets();
    if (player && !(deathTimer > 0 && lives < 0)) drawPlayer();
    drawParticles();
    drawBossHealthBar();
    drawBossBanner();

    ctx.restore();

    if (hitFlash > 0) {
      ctx.fillStyle = `rgba(200,20,20,${hitFlash * 0.35})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  function drawWarningTriangle(cx, cy, size) {
    ctx.fillStyle = '#ff5030';
    ctx.beginPath();
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size * 0.9, cy + size * 0.7);
    ctx.lineTo(cx - size * 0.9, cy + size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#20080a';
    ctx.fillRect(cx - 1.5, cy - size * 0.35, 3, size * 0.7);
    ctx.beginPath();
    ctx.arc(cx, cy + size * 0.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBossBanner() {
    if (bossBanner <= 0 || !entBoss) return;
    const t = bossBanner;
    const slide = t > 2.1 ? (2.6 - t) / 0.5 : t < 0.4 ? t / 0.4 : 1;
    const y = 150;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, slide));
    ctx.fillStyle = 'rgba(20,6,10,0.65)';
    ctx.fillRect(0, y - 26, VIEW_W, 52);
    ctx.strokeStyle = '#ff3020';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, y - 26, VIEW_W, 52);
    ctx.fillStyle = '#ff5030';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(entBoss.name, VIEW_W / 2, y + 10);
    const textWidth = ctx.measureText(entBoss.name).width;
    drawWarningTriangle(VIEW_W / 2 - textWidth / 2 - 30, y, 16);
    drawWarningTriangle(VIEW_W / 2 + textWidth / 2 + 30, y, 16);
    ctx.restore();
  }

  // ---------------------------------------------------------
  // HUD
  // ---------------------------------------------------------
  function updateHUD(force) {
    document.getElementById('hud-score').textContent = score;
    document.getElementById('hud-gems').textContent = entCoins ? entCoins.filter(c => c.taken).length : 0;
    document.getElementById('hud-lives').textContent = Math.max(0, lives);
    document.getElementById('hud-time').textContent = Math.ceil(timeLeft);
    document.getElementById('hud-world').textContent = `${currentLevelIndex + 1}-1`;
    const pips = document.querySelectorAll('#world-pips .pip');
    pips.forEach((pip, i) => {
      pip.classList.toggle('done', i < currentLevelIndex);
      pip.classList.toggle('current', i === currentLevelIndex);
    });
  }

  // ---------------------------------------------------------
  // Screens / state transitions
  // ---------------------------------------------------------
  const overlay = document.getElementById('overlay');
  const pauseScreen = document.getElementById('pause-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const winScreen = document.getElementById('win-screen');
  const levelCompleteScreen = document.getElementById('levelcomplete-screen');

  function hideAllScreens() {
    overlay.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
    winScreen.classList.add('hidden');
    levelCompleteScreen.classList.add('hidden');
  }

  function startGame() {
    newGame();
    hideAllScreens();
    state = STATE.PLAY;
  }

  function goToNextLevel() {
    loadLevel(currentLevelIndex + 1);
    hideAllScreens();
    state = STATE.PLAY;
  }

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('retry-btn').addEventListener('click', startGame);
  document.getElementById('win-retry-btn').addEventListener('click', startGame);
  document.getElementById('next-level-btn').addEventListener('click', goToNextLevel);
  document.getElementById('resume-btn').addEventListener('click', () => {
    pauseScreen.classList.add('hidden');
    state = STATE.PLAY;
  });

  // draw a small preview of Ember on the start screen using a mini canvas
  function drawHeroPreview() {
    const holder = document.getElementById('hero-preview');
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    holder.innerHTML = '';
    holder.appendChild(c);
    const pctx = c.getContext('2d');
    pctx.translate(20, 56);
    const jacketGrad = pctx.createLinearGradient(0, -36, 0, -14);
    jacketGrad.addColorStop(0, '#6b9c56'); jacketGrad.addColorStop(1, '#33481f');
    const pantsGrad = pctx.createLinearGradient(0, -14, 0, -2);
    pantsGrad.addColorStop(0, '#4a5c38'); pantsGrad.addColorStop(1, '#232d1b');

    // ground shadow
    pctx.fillStyle = 'rgba(0,0,0,0.3)';
    pctx.beginPath(); pctx.ellipse(2, 0, 16, 4, 0, 0, Math.PI * 2); pctx.fill();

    // legs + boots
    pctx.fillStyle = pantsGrad;
    pctx.fillRect(-9, -14, 8, 12);
    pctx.fillRect(1, -14, 8, 12);
    pctx.fillStyle = '#1a1a12';
    pctx.fillRect(-10, -4, 10, 4);
    pctx.fillRect(0, -4, 10, 4);
    // backpack
    pctx.fillStyle = '#2e3a22';
    pctx.fillRect(-13, -34, 6, 14);
    // torso
    pctx.fillStyle = jacketGrad;
    pctx.fillRect(-9, -36, 22, 22);
    pctx.strokeStyle = 'rgba(18,16,10,0.55)';
    pctx.lineWidth = 1;
    pctx.strokeRect(-9, -36, 22, 22);
    pctx.fillStyle = '#2a2a1a';
    pctx.fillRect(-9, -18, 22, 3);
    // gun arm + gun
    pctx.fillStyle = '#4a6b3a';
    pctx.fillRect(11, -30, 12, 6);
    pctx.fillStyle = '#3a3a3a';
    pctx.fillRect(21, -29, 18, 4);
    pctx.fillStyle = '#161616';
    pctx.fillRect(19, -32, 5, 4);
    // head + helmet
    pctx.fillStyle = '#e8b488';
    pctx.beginPath(); pctx.arc(2, -42, 10, 0, Math.PI * 2); pctx.fill();
    pctx.fillStyle = '#6b9c56';
    pctx.beginPath(); pctx.arc(2, -45, 11, Math.PI, 0); pctx.fill();
    pctx.strokeStyle = 'rgba(18,16,10,0.55)';
    pctx.beginPath(); pctx.arc(2, -45, 11, Math.PI, 0); pctx.stroke();
    pctx.fillStyle = '#33481f';
    pctx.fillRect(-8, -47, 20, 4);
    pctx.fillStyle = '#ffd44d';
    pctx.fillRect(0, -45, 5, 3);
    pctx.fillStyle = 'rgba(255,255,255,0.3)';
    pctx.beginPath(); pctx.arc(-2, -47, 3, 0, Math.PI * 2); pctx.fill();
    pctx.fillStyle = '#1a1a2a';
    pctx.beginPath(); pctx.arc(-1, -42, 1.6, 0, Math.PI * 2); pctx.fill();
    pctx.beginPath(); pctx.arc(6, -42, 1.6, 0, Math.PI * 2); pctx.fill();
  }
  drawHeroPreview();

  // ---------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 1 / 30);

    if (restartRequested) {
      restartRequested = false;
      startGame();
    }
    if (pauseRequested) {
      pauseRequested = false;
      if (state === STATE.PLAY) { state = STATE.PAUSE; pauseScreen.classList.remove('hidden'); }
      else if (state === STATE.PAUSE) { state = STATE.PLAY; pauseScreen.classList.add('hidden'); }
    }

    if (state === STATE.PLAY) {
      update(dt);
      updateHUD();
    }
    if (level) render();

    requestAnimationFrame(frame);
  }

  newGame();
  requestAnimationFrame(frame);
})();
