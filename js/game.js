// ============================================================
// EMBER'S QUEST — a Mario-like platformer starring Ember the fire fox
// Vanilla JS + Canvas 2D, no external assets required.
// ============================================================

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const TILE = 40;
  const COLS = 150;
  const ROWS = 13;
  const WORLD_W = COLS * TILE;
  const WORLD_H = ROWS * TILE;
  const VIEW_W = canvas.width;
  const VIEW_H = canvas.height;
  const GRAVITY = 1800;
  const MAX_FALL = 1400;

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
      win: () => { tone(523, 0.15, 'square', 0.18, 523); setTimeout(() => tone(659, 0.15, 'square', 0.18, 659), 140); setTimeout(() => tone(784, 0.3, 'square', 0.18, 784), 280); },
      gameover: () => { tone(300, 0.2, 'sawtooth', 0.18, 200); setTimeout(() => tone(200, 0.35, 'sawtooth', 0.18, 100), 200); }
    };
  })();

  // ---------------------------------------------------------
  // Input
  // ---------------------------------------------------------
  const keys = { left: false, right: false, jump: false, jumpPressed: false };
  let pauseRequested = false, restartRequested = false;

  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' '].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
      if (!keys.jump) keys.jumpPressed = true;
      keys.jump = true;
    }
    if (e.key === 'p' || e.key === 'P') pauseRequested = true;
    if (e.key === 'r' || e.key === 'R') restartRequested = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') keys.jump = false;
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

  // ---------------------------------------------------------
  // Level construction
  // ---------------------------------------------------------
  // Tile codes: '.' empty  'G' grass-top solid  'D' dirt solid  'B' brick solid
  // '?' gem-block (solid, pops a gem when bumped from below, then becomes 'U' used)
  // 'U' used block (solid)  'C' floating platform (solid)  '^' spikes (hazard, non-solid on top death touch)
  // 'P' crystal pillar (solid)
  const SOLID = new Set(['G', 'D', 'B', '?', 'U', 'C', 'P']);
  const HAZARD = new Set(['^']);

  function buildLevel() {
    const tiles = [];
    for (let r = 0; r < ROWS; r++) tiles.push(new Array(COLS).fill('.'));

    const groundTop = ROWS - 3; // row index where grass starts
    // pits: [startCol, endCol] inclusive, no ground there
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
    enemies.push({ type: 'critter', c: 18, r: groundTop - 1, range: [16, 22] });

    // pillar obstacle before first pit
    setTile(21, groundTop - 1, 'P');
    setTile(21, groundTop - 2, 'P');

    // --- Section 2: floating platform staircase over pit ---
    for (let i = 0; i < 4; i++) setTile(28 + i, groundTop - 3 - i, 'C');
    coins.push({ c: 29, r: groundTop - 5 }, { c: 30, r: groundTop - 6 }, { c: 31, r: groundTop - 7 });
    for (let i = 0; i < 4; i++) setTile(33 + i, groundTop - 6 + i, 'C');

    enemies.push({ type: 'critter', c: 38, r: groundTop - 1, range: [36, 44] });
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

    enemies.push({ type: 'critter', c: 70, r: groundTop - 1, range: [68, 78] });
    enemies.push({ type: 'critter', c: 76, r: groundTop - 1, range: [68, 78] });

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
    enemies.push({ type: 'critter', c: 105, r: groundTop - 1, range: [102, 111] });

    setTile(115, groundTop - 3, '?');
    setTile(117, groundTop - 3, '?');
    addCoinRow(115, groundTop - 5, 4);

    enemies.push({ type: 'critter', c: 120, r: groundTop - 1, range: [118, 126] });
    enemies.push({ type: 'critter', c: 124, r: groundTop - 1, range: [118, 126] });

    setTile(133, groundTop - 1, 'P');
    setTile(134, groundTop - 1, 'P');
    setTile(133, groundTop - 2, 'P');
    setTile(134, groundTop - 2, 'P');
    setTile(133, groundTop - 3, 'P');
    setTile(134, groundTop - 3, 'P');

    addCoinRow(140, groundTop - 3, 6);

    // --- Flagpole goal ---
    const flagCol = COLS - 5;
    for (let r = groundTop - 8; r < groundTop; r++) setTile(flagCol, r, '|');
    flag = { c: flagCol, rTop: groundTop - 8, rBase: groundTop };

    // checkpoint roughly mid-level (no tile, just a column marker)
    const checkpointCol = 70;

    return { tiles, groundTop, coins, berries, enemies, flag, checkpointCol };
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

  class Critter {
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

  class Flyer {
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
  // Game state
  // ---------------------------------------------------------
  const STATE = { START: 0, PLAY: 1, PAUSE: 2, OVER: 3, WIN: 4 };
  let state = STATE.START;

  let level, player, camX = 0;
  let entCoins, entBerries, entEnemies, blockBumps;
  let score = 0, lives = 3, timeLeft = 400, checkpointX = 0;
  let winTimer = 0, deathTimer = 0;
  let flagSliding = false, flagWinX = 0;

  function newGame() {
    level = buildLevel();
    const startX = 3 * TILE;
    const startY = (level.groundTop - 2) * TILE;
    player = new Player(startX, startY);
    camX = 0;
    entCoins = level.coins.map(c => ({ x: c.c * TILE + TILE / 2, y: c.r * TILE + TILE / 2, taken: false, bob: Math.random() * 10 }));
    entBerries = level.berries.map(b => ({ x: b.c * TILE + TILE / 2, y: b.r * TILE + TILE / 2, taken: false, bob: Math.random() * 10 }));
    entEnemies = level.enemies.map(e => e.type === 'critter'
      ? new Critter(e.c, e.r, e.range)
      : new Flyer(e.c, e.r, e.range, e.baseR));
    blockBumps = {}; // key "c,r" -> {t}
    score = 0; lives = 3; timeLeft = 400; checkpointX = startX;
    particles = [];
    winTimer = 0; deathTimer = 0; flagSliding = false;
    state = STATE.START;
    updateHUD(true);
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
    if (dx === 0) return 0;
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

  function hurtPlayer() {
    if (player.invincible > 0 || player.starPower > 0) return;
    Sfx.hurt();
    if (player.shrink()) {
      player.invincible = 1.6;
    } else {
      loseLife();
    }
  }

  function loseLife() {
    lives--;
    updateHUD();
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
    state = STATE.WIN;
    Sfx.win();
    score += Math.floor(timeLeft) * 10;
    updateHUD();
    document.getElementById('win-score').textContent = `Score: ${score}`;
    document.getElementById('win-screen').classList.remove('hidden');
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

    // checkpoint
    if (player.x > checkpointX && player.x > level.checkpointCol * TILE) {
      checkpointX = level.checkpointCol * TILE;
    }

    // squash/stretch cosmetic recovery
    player.squash += (1 - player.squash) * Math.min(1, dt * 10);
    player.animT += dt * (Math.abs(player.vx) / RUN_MAX) * 10;

    updateCoins(dt);
    updateBerries(dt);
    updateEnemies(dt);
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
      if (e instanceof Critter) {
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
          spawnBurst(e.x + e.w / 2, e.y + e.h / 2, '#c96a2b', 7, 160);
          spawnFloatText(e.x + e.w / 2, e.y, '+100', '#fff');
          updateHUD();
        } else if (player.starPower > 0) {
          e.alive = false;
          score += 100;
          Sfx.stomp();
          spawnBurst(e.x + e.w / 2, e.y + e.h / 2, '#c96a2b', 7, 160);
          updateHUD();
        } else {
          hurtPlayer();
        }
      }
    }
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
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------
  function drawBackground(t) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#5ec8ff');
    g.addColorStop(0.75, '#bdeaff');
    g.addColorStop(1, '#e8fbff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // sun
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(VIEW_W - 90, 80, 46, 0, Math.PI * 2);
    ctx.fill();

    // parallax hills
    const hillParX = camX * 0.3;
    ctx.fillStyle = '#8fd67f';
    for (let i = -1; i < 6; i++) {
      const bx = i * 320 - (hillParX % 320);
      ctx.beginPath();
      ctx.ellipse(bx + 140, VIEW_H - 60, 170, 90, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#79c766';
    for (let i = -1; i < 8; i++) {
      const bx = i * 220 - (hillParX * 1.4 % 220);
      ctx.beginPath();
      ctx.ellipse(bx + 100, VIEW_H - 40, 120, 60, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // clouds
    const cloudParX = camX * 0.15;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
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

  function drawCritter(e) {
    const x = e.x - camX;
    if (x < -60 || x > VIEW_W + 60) return;
    const squish = e.squish > 0 ? 0.35 : 1;
    ctx.save();
    ctx.translate(x + e.w / 2, e.y + e.h);
    ctx.scale(1, squish);
    ctx.translate(-(e.w / 2), -e.h);
    ctx.fillStyle = '#8a4fd6';
    ctx.beginPath();
    ctx.ellipse(e.w / 2, e.h * 0.55, e.w / 2, e.h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5c2ea3';
    const legOff = Math.sin(e.legT) * 4;
    ctx.fillRect(4, e.h - 6, 8, 8 + legOff);
    ctx.fillRect(e.w - 12, e.h - 6, 8, 8 - legOff);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(e.w * 0.32, e.h * 0.45, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e.w * 0.68, e.h * 0.45, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a2a';
    const dir = e.vx < 0 ? -1 : 1;
    ctx.beginPath(); ctx.arc(e.w * 0.32 + dir * 1.5, e.h * 0.45, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e.w * 0.68 + dir * 1.5, e.h * 0.45, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawFlyer(e) {
    const x = e.x - camX;
    if (x < -60 || x > VIEW_W + 60) return;
    const squish = e.squish > 0 ? 0.35 : 1;
    ctx.save();
    ctx.translate(x + e.w / 2, e.y + e.h / 2);
    ctx.scale(1, squish);
    const wing = Math.sin(performance.now() / 60) * 10;
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    ctx.ellipse(-e.w / 2 + 2, wing * 0.3, 12, 6, 0.3, 0, Math.PI * 2);
    ctx.ellipse(e.w / 2 - 2, -wing * 0.3, 12, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8663f';
    ctx.beginPath();
    ctx.ellipse(0, 0, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-4, -2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a2a';
    ctx.beginPath(); ctx.arc(-4, -2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // --- Ember the fire fox ---
  function drawPlayer() {
    const x = player.x - camX;
    const y = player.y;
    const w = player.w, h = player.h;
    const blink = player.invincible > 0 && Math.floor(player.invincible * 12) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(x + w / 2, y + h);
    const stretch = player.squash;
    ctx.scale(player.facing / stretch, stretch);
    ctx.translate(0, -h);

    const star = player.starPower > 0;
    const hueShift = star ? (performance.now() / 5) % 360 : 0;
    const bodyColor = star ? `hsl(${hueShift},80%,55%)` : (player.big ? '#ff7a2e' : '#ff8a3d');
    const bellyColor = star ? `hsl(${(hueShift + 40) % 360},90%,85%)` : '#fff3d6';

    const run = Math.abs(player.vx) > 10 && player.onGround;
    const legSwing = run ? Math.sin(player.animT) * 10 : 0;
    const bw = w, bh = h;

    // legs
    ctx.fillStyle = '#c9541f';
    ctx.fillRect(bw * 0.2 - 5, bh - 12 + Math.max(0, legSwing), 10, 12 - Math.max(0, legSwing));
    ctx.fillRect(bw * 0.8 - 5, bh - 12 + Math.max(0, -legSwing), 10, 12 - Math.max(0, -legSwing));

    // tail
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(-bw * 0.15, bh * 0.55, 10, 16, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath();
    ctx.ellipse(-bw * 0.28, bh * 0.42, 5, 7, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(bw / 2, bh * 0.62, bw * 0.42, bh * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    // belly
    ctx.fillStyle = bellyColor;
    ctx.beginPath();
    ctx.ellipse(bw / 2, bh * 0.72, bw * 0.24, bh * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();

    // head
    const headY = bh * 0.28;
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(bw / 2, headY, bw * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // ears
    ctx.fillStyle = bodyColor;
    ctx.beginPath(); ctx.moveTo(bw * 0.18, headY - 6); ctx.lineTo(bw * 0.08, headY - 26); ctx.lineTo(bw * 0.38, headY - 10); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bw * 0.82, headY - 6); ctx.lineTo(bw * 0.92, headY - 26); ctx.lineTo(bw * 0.62, headY - 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5c2410';
    ctx.beginPath(); ctx.moveTo(bw * 0.2, headY - 10); ctx.lineTo(bw * 0.15, headY - 21); ctx.lineTo(bw * 0.32, headY - 12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bw * 0.8, headY - 10); ctx.lineTo(bw * 0.85, headY - 21); ctx.lineTo(bw * 0.68, headY - 12); ctx.closePath(); ctx.fill();

    // flame tuft
    ctx.fillStyle = '#ffd44d';
    ctx.beginPath();
    ctx.moveTo(bw * 0.5, headY - bw * 0.36);
    ctx.quadraticCurveTo(bw * 0.42, headY - bw * 0.6, bw * 0.5, headY - bw * 0.78);
    ctx.quadraticCurveTo(bw * 0.6, headY - bw * 0.55, bw * 0.5, headY - bw * 0.36);
    ctx.fill();

    // snout
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath();
    ctx.ellipse(bw * 0.58, headY + 6, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a1e12';
    ctx.beginPath();
    ctx.arc(bw * 0.66, headY + 5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.fillStyle = '#1a1a2a';
    ctx.beginPath(); ctx.arc(bw * 0.42, headY - 2, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bw * 0.6, headY - 4, 3.2, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
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
    drawBackground();
    drawTiles();
    for (const g of entCoins) drawCoin(g);
    for (const b of entBerries) drawBerry(b);
    for (const e of entEnemies) {
      if (!e.alive) continue;
      if (e instanceof Critter) drawCritter(e); else drawFlyer(e);
    }
    if (player && !(deathTimer > 0 && lives < 0)) drawPlayer();
    drawParticles();
  }

  // ---------------------------------------------------------
  // HUD
  // ---------------------------------------------------------
  function updateHUD(force) {
    document.getElementById('hud-score').textContent = score;
    document.getElementById('hud-gems').textContent = entCoins ? entCoins.filter(c => c.taken).length : 0;
    document.getElementById('hud-lives').textContent = Math.max(0, lives);
    document.getElementById('hud-time').textContent = Math.ceil(timeLeft);
  }

  // ---------------------------------------------------------
  // Screens / state transitions
  // ---------------------------------------------------------
  const overlay = document.getElementById('overlay');
  const pauseScreen = document.getElementById('pause-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const winScreen = document.getElementById('win-screen');

  function hideAllScreens() {
    overlay.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
    winScreen.classList.add('hidden');
  }

  function startGame() {
    newGame();
    hideAllScreens();
    state = STATE.PLAY;
  }

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('retry-btn').addEventListener('click', startGame);
  document.getElementById('win-retry-btn').addEventListener('click', startGame);
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
    pctx.translate(32, 56);
    pctx.fillStyle = '#c9541f';
    pctx.fillRect(-9, -14, 8, 12);
    pctx.fillRect(1, -14, 8, 12);
    pctx.fillStyle = '#ff8a3d';
    pctx.beginPath(); pctx.ellipse(0, -22, 15, 14, 0, 0, Math.PI * 2); pctx.fill();
    pctx.fillStyle = '#fff3d6';
    pctx.beginPath(); pctx.ellipse(0, -18, 8, 8, 0, 0, Math.PI * 2); pctx.fill();
    pctx.fillStyle = '#ff8a3d';
    pctx.beginPath(); pctx.arc(0, -40, 13, 0, Math.PI * 2); pctx.fill();
    pctx.beginPath(); pctx.moveTo(-6, -46); pctx.lineTo(-11, -60); pctx.lineTo(1, -50); pctx.closePath(); pctx.fill();
    pctx.beginPath(); pctx.moveTo(6, -46); pctx.lineTo(11, -60); pctx.lineTo(-1, -50); pctx.closePath(); pctx.fill();
    pctx.fillStyle = '#ffd44d';
    pctx.beginPath();
    pctx.moveTo(0, -52); pctx.quadraticCurveTo(-5, -62, 0, -70); pctx.quadraticCurveTo(5, -62, 0, -52);
    pctx.fill();
    pctx.fillStyle = '#1a1a2a';
    pctx.beginPath(); pctx.arc(-4, -41, 2, 0, Math.PI * 2); pctx.fill();
    pctx.beginPath(); pctx.arc(4, -41, 2, 0, Math.PI * 2); pctx.fill();
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
