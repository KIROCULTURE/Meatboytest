// CHICLE — plataformas de precisión inspirado en la movilidad de Super Meat Boy.
// Motor de paso fijo (120 Hz), colisiones AABB contra rejilla de tiles.
'use strict';

const TILE = 24, COLS = 40, ROWS = 22;
const W = COLS * TILE, H = ROWS * TILE;
const STEP = 1 / 120;

// Todas las constantes de movilidad en un sitio para poder afinarlas.
const P = {
  size: 18,
  maxRun: 330,
  accelGround: 3200, decelGround: 3800,
  accelAir: 2400, decelAir: 1000,
  turnBoost: 1.6,          // multiplicador al invertir dirección (giros secos)
  gravity: 2300, maxFall: 950,
  jumpV: 730, jumpCut: 0.45,
  coyote: 0.09, buffer: 0.12,
  wallSlide: 170, wallJumpX: 390, wallJumpY: 690, wallGrace: 0.08,
  bubbleTime: 1.0, bubbleGravity: 0.12, bubbleMaxFall: 70, popV: 560,
  ceilSpeed: 240, ceilTime: 2.5,
  maxRemnants: 3,
  respawnDelay: 0.35,
};

// ---------------------------------------------------------------- input
const keys = new Set();
const pressed = new Set();
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowDown: 'down', KeyS: 'down',
  ArrowUp: 'jump', Space: 'jump', KeyZ: 'jump', KeyW: 'jump', KeyK: 'jump',
  KeyX: 'bubble', ShiftLeft: 'bubble', ShiftRight: 'bubble', KeyJ: 'bubble',
  KeyR: 'restart', KeyN: 'skip', Escape: 'pause', KeyP: 'pause', Enter: 'jump',
};
addEventListener('keydown', e => {
  const a = KEYMAP[e.code];
  if (!a) return;
  e.preventDefault();
  if (!keys.has(a)) pressed.add(a);
  keys.add(a);
});
addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) keys.delete(a); });
addEventListener('blur', () => keys.clear());

// Controles táctiles: botones con data-act.
const touchHeld = new Map();
document.querySelectorAll('[data-act]').forEach(btn => {
  const act = btn.dataset.act;
  const on = e => { e.preventDefault(); if (!touchHeld.get(act)) pressed.add(act); touchHeld.set(act, true); btn.classList.add('on'); };
  const off = e => { e.preventDefault(); touchHeld.set(act, false); btn.classList.remove('on'); };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('pointerleave', off);
});

// Mando (Gamepad API).
let padPrev = {};
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && [...pads].find(p => p);
  const now = {};
  if (gp) {
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const b = i => gp.buttons[i] && gp.buttons[i].pressed;
    now.left = ax < -0.35 || b(14);
    now.right = ax > 0.35 || b(15);
    now.down = ay > 0.5 || b(13);
    now.jump = b(0) || b(3);
    now.bubble = b(2) || b(1) || b(5) || b(7);
    now.restart = b(8);
    now.pause = b(9);
  }
  for (const k in now) if (now[k] && !padPrev[k]) pressed.add(k);
  padPrev = now;
}
const held = a => keys.has(a) || touchHeld.get(a) || padPrev[a];

// ---------------------------------------------------------------- audio (sintetizado)
let actx = null;
function beep(freq, dur, type = 'square', vol = 0.08, slide = 0) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), actx.currentTime + dur);
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch (_) { /* sin audio */ }
}
const sfx = {
  jump: () => beep(520, 0.09, 'square', 0.05, 300),
  wall: () => beep(420, 0.08, 'square', 0.05, 250),
  bubble: () => beep(300, 0.2, 'sine', 0.07, 400),
  pop: () => beep(900, 0.08, 'triangle', 0.08, -500),
  stick: () => beep(160, 0.1, 'sawtooth', 0.04, -60),
  toggle: () => beep(660, 0.05, 'triangle', 0.03),
  die: () => { beep(200, 0.25, 'sawtooth', 0.08, -170); beep(90, 0.3, 'square', 0.05, -40); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.12, 'square', 0.05), i * 70)); },
};

// ---------------------------------------------------------------- estado
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = W; canvas.height = H;

const game = {
  mode: 'title',        // title | play | clear | end | pause
  levelIndex: 0,
  level: null,
  deaths: 0, levelDeaths: 0,
  time: 0, levelTime: 0,
  results: [],
  shake: 0,
  flash: 0,
  t: 0,
};

let player, particles = [], stains = [];

function loadLevel(i) {
  const src = LEVELS[i];
  const grid = src.map.map(r => r.split(''));
  let spawn = { x: 2, y: 2 }, goal = { x: 0, y: 0 };
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const c = grid[y][x];
    if (c === 'S') { spawn = { x, y }; grid[y][x] = '.'; }
    if (c === 'G') { goal = { x, y }; grid[y][x] = '.'; }
  }
  game.level = {
    name: src.name, hint: src.hint, grid, spawn, goal,
    saws: (src.saws || []).map(s => ({ ...s, cx: s.x * TILE, cy: s.y * TILE, angle: 0 })),
    remnants: [],   // {x,y} en tiles: el chicle de muertes anteriores
    phase: 0,       // 0: bloques A sólidos · 1: bloques B sólidos
    ghosts: new Set(),
  };
  game.levelIndex = i;
  game.levelDeaths = 0;
  game.levelTime = 0;
  stains = [];
  particles = [];
  spawnPlayer();
}

function spawnPlayer() {
  const L = game.level;
  L.phase = 0; L.ghosts.clear();
  player = {
    x: L.spawn.x * TILE + (TILE - P.size) / 2,
    y: (L.spawn.y + 1) * TILE - P.size,
    w: P.size, h: P.size,
    vx: 0, vy: 0,
    onGround: false, wall: 0, wallTimer: 0, lastWall: 0,
    coyote: 0, buffer: 0, cut: true,
    bubbleReady: true, bubble: 0,
    ceiling: false, gum: P.ceilTime,
    facing: 1, dead: false, deadTimer: 0,
    sx: 1, sy: 1, // squash & stretch
  };
}

// ---------------------------------------------------------------- tiles
function tileAt(tx, ty) {
  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return '#';
  return game.level.grid[ty][tx];
}
function hasRemnant(tx, ty) { return game.level.remnants.some(r => r.x === tx && r.y === ty); }
function solidAt(tx, ty) {
  const c = tileAt(tx, ty);
  const L = game.level;
  if (c === '#' || c === '~') return true;
  if ((c === 'A' || c === 'B') && !L.ghosts.has(tx + ',' + ty)) return (c === 'A') === (L.phase === 0);
  return hasRemnant(tx, ty);
}
function greasyAt(tx, ty) { return tileAt(tx, ty) === '~'; }

function rectTiles(x, y, w, h, fn) {
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.001) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (fn(tx, ty)) return true;
  return false;
}
const rectSolid = (x, y, w, h) => rectTiles(x, y, w, h, solidAt);

// Superficie en un lateral: devuelve 'none' | 'wall' | 'grease'.
function sideSurface(dir) {
  const p = player;
  const x = dir > 0 ? p.x + p.w + 1 : p.x - 1;
  let found = 'none';
  rectTiles(x, p.y + 2, 0.5, p.h - 4, (tx, ty) => {
    if (!solidAt(tx, ty)) return false;
    found = greasyAt(tx, ty) ? 'grease' : 'wall';
    return found === 'wall';
  });
  return found;
}
function ceilingSurface() {
  const p = player;
  let found = 'none';
  rectTiles(p.x + 2, p.y - 1, p.w - 4, 0.5, (tx, ty) => {
    if (!solidAt(tx, ty)) return false;
    found = greasyAt(tx, ty) ? 'grease' : 'wall';
    return found === 'wall';
  });
  return found;
}

// Alternar bloques de ritmo. Los que aparecen encima del jugador quedan "fantasma"
// hasta que salga de ellos, para no aplastarlo injustamente.
function togglePhase() {
  const L = game.level;
  let any = false;
  for (const row of L.grid) if (row.includes('A') || row.includes('B')) { any = true; break; }
  if (!any) return;
  L.phase ^= 1;
  L.ghosts.clear();
  const p = player;
  rectTiles(p.x, p.y, p.w, p.h, (tx, ty) => {
    const c = tileAt(tx, ty);
    if (c === 'A' || c === 'B') L.ghosts.add(tx + ',' + ty);
    return false;
  });
  sfx.toggle();
}

// ---------------------------------------------------------------- física
function approach(v, target, amt) { return v < target ? Math.min(v + amt, target) : Math.max(v - amt, target); }

function moveX(dx) {
  const p = player;
  p.x += dx;
  if (rectSolid(p.x, p.y, p.w, p.h)) {
    if (dx > 0) p.x = Math.floor((p.x + p.w) / TILE) * TILE - p.w;
    else p.x = Math.floor(p.x / TILE + 1) * TILE;
    p.vx = 0;
    return true;
  }
  return false;
}
function moveY(dy) {
  const p = player;
  p.y += dy;
  if (rectSolid(p.x, p.y, p.w, p.h)) {
    if (dy > 0) p.y = Math.floor((p.y + p.h) / TILE) * TILE - p.h;
    else p.y = Math.floor(p.y / TILE + 1) * TILE;
    return true;
  }
  return false;
}
function move(dx, dy) {
  // subpasos para no atravesar tiles a velocidad alta
  const n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8) || 1;
  let hitX = false, hitY = false;
  for (let i = 0; i < n; i++) {
    if (!hitX && moveX(dx / n)) hitX = true;
    if (!hitY && moveY(dy / n)) hitY = true;
  }
  return { hitX, hitY };
}

function update(dt) {
  const p = player, L = game.level;
  updateSaws(dt);

  // limpiar fantasmas de los que ya salió
  if (L.ghosts.size) {
    for (const k of [...L.ghosts]) {
      const [tx, ty] = k.split(',').map(Number);
      const overlap = p.x < (tx + 1) * TILE && p.x + p.w > tx * TILE && p.y < (ty + 1) * TILE && p.y + p.h > ty * TILE;
      if (!overlap) L.ghosts.delete(k);
    }
  }

  if (p.dead) {
    p.deadTimer -= dt;
    if (p.deadTimer <= 0) spawnPlayer();
    return;
  }
  game.levelTime += dt;
  game.time += dt;

  const dir = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
  if (dir) p.facing = dir;
  if (pressed.has('jump')) p.buffer = P.buffer; else p.buffer -= dt;
  const jumpHeld = held('jump');

  // --- pegado al techo (mecánica original #1)
  if (p.ceiling) {
    p.vx = approach(p.vx, dir * P.ceilSpeed, P.accelGround * dt);
    p.vy = 0;
    p.gum -= dt;
    move(p.vx * dt, 0);
    if (Math.random() < 0.3) addStain(p.x + Math.random() * p.w, p.y - 1, true);
    if (!jumpHeld || held('down') || p.gum <= 0 || ceilingSurface() !== 'wall') {
      p.ceiling = false; p.vy = 40; p.cut = true;
    }
    finishStep(dt);
    return;
  }

  // --- horizontal
  let accel = p.onGround ? (dir ? P.accelGround : P.decelGround) : (dir ? P.accelAir : P.decelAir);
  if (dir && p.vx && Math.sign(p.vx) !== dir) accel *= P.turnBoost;
  p.vx = approach(p.vx, dir * P.maxRun, accel * dt);

  // --- vertical
  let g = P.gravity, maxF = P.maxFall;
  if (p.bubble > 0) {
    g *= P.bubbleGravity; maxF = P.bubbleMaxFall;
    p.bubble -= dt;
    if (!held('bubble') || p.bubble <= 0) popBubble(false);
  }
  const wallSurf = !p.onGround ? (sideSurface(1) === 'wall' ? 1 : sideSurface(-1) === 'wall' ? -1 : 0) : 0;
  p.wall = wallSurf;
  if (wallSurf) { p.lastWall = wallSurf; p.wallTimer = P.wallGrace; } else p.wallTimer -= dt;
  if (wallSurf && dir === wallSurf && p.vy > 0 && p.bubble <= 0) {
    maxF = P.wallSlide;
    if (Math.random() < 0.4) addStain(wallSurf > 0 ? p.x + p.w + 1 : p.x - 1, p.y + Math.random() * p.h, false);
  }
  p.vy = Math.min(p.vy + g * dt, maxF);

  // --- saltos
  if (p.buffer > 0) {
    if (p.onGround || p.coyote > 0) {
      p.vy = -P.jumpV; p.cut = false; p.buffer = 0; p.coyote = 0; p.onGround = false;
      p.sx = 0.7; p.sy = 1.35; burst(p.x + p.w / 2, p.y + p.h, 5, '#ff8fc7');
      sfx.jump(); togglePhase();
    } else if (p.wallTimer > 0) {
      const d = p.lastWall;
      p.vy = -P.wallJumpY; p.vx = -d * P.wallJumpX; p.cut = false; p.buffer = 0; p.wallTimer = 0;
      p.facing = -d; p.sx = 0.75; p.sy = 1.3;
      burst(d > 0 ? p.x + p.w : p.x, p.y + p.h / 2, 5, '#ff8fc7');
      sfx.wall(); togglePhase();
    } else if (p.bubble > 0) {
      popBubble(true);
    }
  }
  if (!jumpHeld && p.vy < 0 && !p.cut) { p.vy *= P.jumpCut; p.cut = true; }

  // --- burbuja (mecánica original #2)
  if (pressed.has('bubble') && !p.onGround && p.bubbleReady && p.bubble <= 0) {
    p.bubbleReady = false;
    p.bubble = P.bubbleTime;
    p.vy = p.vy > 0 ? p.vy * 0.15 : p.vy * 0.5;
    p.cut = true;
    sfx.bubble();
  }

  const wasGround = p.onGround;
  const vyBefore = p.vy;
  const hit = move(p.vx * dt, p.vy * dt);
  if (hit.hitY) {
    // techo: ¿pegarse?
    if (vyBefore < 0 && jumpHeld && p.gum > 0.05 && ceilingSurface() === 'wall') {
      p.ceiling = true; p.bubble = 0; p.bubbleReady = true;
      p.sx = 1.3; p.sy = 0.75; sfx.stick();
    }
    p.vy = 0;
  }
  p.onGround = p.vy >= 0 && rectSolid(p.x, p.y + 1, p.w, p.h);
  if (p.onGround && !wasGround) {
    p.sx = 1.35; p.sy = 0.7;
    if (vyBefore > 400) burst(p.x + p.w / 2, p.y + p.h, 6, '#ff8fc7');
  }

  if (p.onGround) {
    p.coyote = P.coyote; p.bubbleReady = true; p.gum = P.ceilTime; p.bubble = 0;
    if (Math.abs(p.vx) > 100 && Math.random() < 0.35) addStain(p.x + Math.random() * p.w, p.y + p.h + 1, false);
  } else p.coyote -= dt;
  if (p.wall) p.bubbleReady = true;

  finishStep(dt);
}

function popBubble(boost) {
  const p = player;
  p.bubble = 0;
  if (boost) {
    p.vy = -P.popV; p.cut = false; p.buffer = 0;
    p.sx = 0.75; p.sy = 1.3;
    togglePhase();
  }
  burst(p.x + p.w / 2, p.y + p.h / 2, 10, '#bfe9ff');
  sfx.pop();
}

function finishStep(dt) {
  const p = player, L = game.level;
  p.sx += (1 - p.sx) * Math.min(1, dt * 14);
  p.sy += (1 - p.sy) * Math.min(1, dt * 14);

  // peligros
  if (p.y > H + 40) return die();
  const hx = p.x + 3, hy = p.y + 3, hw = p.w - 6, hh = p.h - 6;
  const spiked = rectTiles(hx, hy, hw, hh, (tx, ty) => {
    const c = tileAt(tx, ty);
    if (c !== '^') return false;
    return hy + hh > ty * TILE + TILE * 0.45; // sólo la mitad inferior del tile
  });
  if (spiked) return die();
  for (const s of L.saws) {
    const nx = Math.max(p.x, Math.min(s.cx, p.x + p.w));
    const ny = Math.max(p.y, Math.min(s.cy, p.y + p.h));
    if ((nx - s.cx) ** 2 + (ny - s.cy) ** 2 < (s.r - 3) ** 2) return die();
  }
  // meta
  const gx = L.goal.x * TILE, gy = L.goal.y * TILE;
  if (p.x < gx + TILE && p.x + p.w > gx && p.y < gy + TILE && p.y + p.h > gy) winLevel();
}

function updateSaws(dt) {
  const t = game.levelTime;
  for (const s of game.level.saws) {
    s.angle += dt * 12;
    if (!s.path) continue;
    const ph = (t % s.path.period) / s.path.period;
    if (s.path.type === 'line') {
      const k = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);
      s.cx = (s.x + (s.path.x2 - s.x) * k) * TILE;
      s.cy = (s.y + (s.path.y2 - s.y) * k) * TILE;
    } else if (s.path.type === 'circle') {
      s.cx = (s.x + Math.cos(ph * Math.PI * 2) * s.path.rad) * TILE;
      s.cy = (s.y + Math.sin(ph * Math.PI * 2) * s.path.rad) * TILE;
    }
  }
}

// Mecánica original #3: los restos. Cada muerte deja un bloque de chicle sólido.
function die() {
  const p = player, L = game.level;
  if (p.dead) return;
  p.dead = true; p.deadTimer = P.respawnDelay;
  game.deaths++; game.levelDeaths++;
  game.shake = 0.25; game.flash = 0.12;
  burst(p.x + p.w / 2, p.y + p.h / 2, 40, '#ff4fa3', 520);
  sfx.die();

  let tx = Math.floor((p.x + p.w / 2) / TILE), ty = Math.floor((p.y + p.h / 2) / TILE);
  for (let k = 0; k < 4 && ty > 0 && (solidAt(tx, ty) || tileAt(tx, ty) === '^'); k++) ty--;
  const nearSpawn = Math.abs(tx - L.spawn.x) <= 1 && Math.abs(ty - L.spawn.y) <= 2;
  const nearGoal = tx === L.goal.x && ty === L.goal.y;
  if (tileAt(tx, ty) === '.' && !hasRemnant(tx, ty) && !nearSpawn && !nearGoal && p.y < H) {
    L.remnants.push({ x: tx, y: ty, born: game.t });
    if (L.remnants.length > P.maxRemnants) L.remnants.shift();
  }
}

function winLevel() {
  const L = game.level;
  game.results[game.levelIndex] = { time: game.levelTime, deaths: game.levelDeaths };
  game.mode = 'clear';
  burst(L.goal.x * TILE + 12, L.goal.y * TILE + 12, 50, '#ffe36e', 400);
  sfx.win();
}

// ---------------------------------------------------------------- partículas y manchas
function burst(x, y, n, color, speed = 220) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.4 + Math.random() * 0.5, color, r: 2 + Math.random() * 3 });
  }
}
function addStain(x, y) {
  stains.push({ x, y, r: 1.5 + Math.random() * 2.5 });
  if (stains.length > 900) stains.shift();
}
function updateParticles(dt) {
  for (const q of particles) {
    q.vy += 1200 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt;
    const tx = Math.floor(q.x / TILE), ty = Math.floor(q.y / TILE);
    if (solidAt(tx, ty)) { q.life = 0; if (q.color !== '#bfe9ff') addStain(q.x, q.y); }
  }
  particles = particles.filter(q => q.life > 0);
}

// ---------------------------------------------------------------- render
const COL = {
  bg1: '#1b1030', bg2: '#2d1846',
  solid: '#4a3566', solidTop: '#6e5391', solidDark: '#2e2044',
  grease: '#8a7a2e', greaseTop: '#d8c45a',
  A: '#ff5fa8', B: '#43c6ff',
  spike: '#e8e3f0',
  gum: '#ff7ab8', gumDark: '#d9468c',
};

function draw() {
  const L = game.level;
  ctx.save();
  if (game.shake > 0) ctx.translate((Math.random() - 0.5) * 10 * game.shake / 0.25, (Math.random() - 0.5) * 10 * game.shake / 0.25);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, COL.bg1); bg.addColorStop(1, COL.bg2);
  ctx.fillStyle = bg; ctx.fillRect(-20, -20, W + 40, H + 40);
  // estrellitas de fondo
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 40; i++) ctx.fillRect((i * 173) % W, (i * 97) % H, 2, 2);

  if (L) {
    drawTiles(L);
    ctx.fillStyle = COL.gumDark;
    for (const s of stains) { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }
    drawRemnants(L);
    drawGoal(L);
    for (const s of L.saws) drawSaw(s);
    if (!player.dead) drawPlayer();
    for (const q of particles) { ctx.globalAlpha = Math.min(1, q.life * 2); ctx.fillStyle = q.color; ctx.fillRect(q.x - q.r / 2, q.y - q.r / 2, q.r, q.r); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (game.flash > 0) { ctx.fillStyle = `rgba(255,120,180,${game.flash * 3})`; ctx.fillRect(0, 0, W, H); }
  if (L) drawHud(L);
  drawOverlay();
}

function drawTiles(L) {
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const c = L.grid[y][x], px = x * TILE, py = y * TILE;
    if (c === '#' || c === '~') {
      const gr = c === '~';
      ctx.fillStyle = gr ? COL.grease : COL.solid;
      ctx.fillRect(px, py, TILE, TILE);
      if (!solidAt(x, y - 1)) { ctx.fillStyle = gr ? COL.greaseTop : COL.solidTop; ctx.fillRect(px, py, TILE, 4); }
      if (!solidAt(x, y + 1)) { ctx.fillStyle = COL.solidDark; ctx.fillRect(px, py + TILE - 3, TILE, 3); }
      if (gr) { // brillo de grasa
        ctx.fillStyle = 'rgba(255,245,170,0.35)';
        ctx.fillRect(px + 5, py + ((x * 7 + y * 5 + game.t * 20) % 18), 3, 6);
      }
    } else if (c === 'A' || c === 'B') {
      const on = solidAt(x, y);
      ctx.strokeStyle = COL[c]; ctx.fillStyle = COL[c];
      if (on) {
        ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(px + 1, py + 1, TILE - 2, 4);
      } else {
        ctx.globalAlpha = 0.5; ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
        ctx.strokeRect(px + 3, py + 3, TILE - 6, TILE - 6);
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    } else if (c === '^') {
      ctx.fillStyle = COL.spike;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(px + i * 8, py + TILE); ctx.lineTo(px + i * 8 + 4, py + TILE * 0.35); ctx.lineTo(px + i * 8 + 8, py + TILE);
        ctx.fill();
      }
    }
  }
}

function drawRemnants(L) {
  for (const r of L.remnants) {
    const px = r.x * TILE, py = r.y * TILE;
    const age = Math.min(1, (game.t - r.born) * 6);
    ctx.fillStyle = COL.gumDark;
    roundRect(px + 1, py + 2 + (1 - age) * 10, TILE - 2, TILE - 2 - (1 - age) * 10, 7); ctx.fill();
    ctx.fillStyle = COL.gum;
    roundRect(px + 3, py + 3, TILE - 6, 8, 4); ctx.fill();
    // goteo
    ctx.fillStyle = COL.gumDark;
    ctx.fillRect(px + 6, py + TILE - 2, 3, 4 + Math.sin(game.t * 2 + r.x) * 2);
  }
}

function drawGoal(L) {
  const x = L.goal.x * TILE + TILE / 2, y = L.goal.y * TILE + TILE / 2 + Math.sin(game.t * 4) * 3;
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(game.t * 2) * 0.15);
  // caramelo envuelto
  ctx.fillStyle = '#ffe36e';
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-16, -7); ctx.lineTo(-16, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(16, -7); ctx.lineTo(16, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
  ctx.strokeStyle = '#ff7ab8'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 6, -1, 1.5); ctx.stroke();
  ctx.restore();
}

function drawSaw(s) {
  ctx.save(); ctx.translate(s.cx, s.cy); ctx.rotate(s.angle);
  const n = 12;
  ctx.fillStyle = '#cfd3dc';
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2, r = i % 2 ? s.r * 0.78 : s.r;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.fill();
  ctx.fillStyle = '#7d8290'; ctx.beginPath(); ctx.arc(0, 0, s.r * 0.35, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a2a33'; ctx.beginPath(); ctx.arc(0, 0, s.r * 0.12, 0, 7); ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const p = player;
  const cx = p.x + p.w / 2, by = p.y + p.h;
  const w = p.w * p.sx, h = p.h * p.sy;
  ctx.save();
  ctx.translate(cx, p.ceiling ? p.y : by);
  if (p.ceiling) ctx.scale(1, -1);
  ctx.fillStyle = COL.gum;
  roundRect(-w / 2, -h, w, h, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  roundRect(-w / 2 + 3, -h + 3, w * 0.35, 4, 2); ctx.fill();
  // ojos
  const ex = p.facing * 3;
  ctx.fillStyle = '#fff';
  ctx.fillRect(ex - 6, -h + 5, 5, 6); ctx.fillRect(ex + 1, -h + 5, 5, 6);
  ctx.fillStyle = '#2a1030';
  ctx.fillRect(ex - 4 + p.facing, -h + 7, 2, 3); ctx.fillRect(ex + 3 + p.facing, -h + 7, 2, 3);
  ctx.restore();
  // hilo de chicle al techo
  if (p.ceiling) {
    ctx.strokeStyle = COL.gumDark; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - p.vx * 0.04, p.y); ctx.lineTo(cx - p.vx * 0.08, p.y - 1); ctx.stroke();
  }
  if (p.bubble > 0) {
    const r = 17 + Math.sin(game.t * 10) * 1.5;
    ctx.strokeStyle = 'rgba(191,233,255,0.9)'; ctx.fillStyle = 'rgba(191,233,255,0.18)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, p.y + p.h / 2, r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(cx - 9, p.y - 3, 4, 4);
    // barra de burbuja
    ctx.fillStyle = 'rgba(191,233,255,0.9)';
    ctx.fillRect(cx - 12, p.y - 16, 24 * (p.bubble / P.bubbleTime), 3);
  }
  if (p.ceiling) {
    ctx.fillStyle = COL.gum;
    ctx.fillRect(cx - 12, p.y + p.h + 6, 24 * Math.max(0, p.gum / P.ceilTime), 3);
  }
}

function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

const fmt = t => { const m = Math.floor(t / 60), s = t % 60; return (m ? m + ':' + String(s.toFixed(2)).padStart(5, '0') : s.toFixed(2)); };

function drawHud(L) {
  ctx.font = 'bold 14px ui-monospace, Menlo, Consolas, monospace';
  ctx.textBaseline = 'top';
  const text = `${game.levelIndex + 1}-${L.name}   ⏱ ${fmt(game.levelTime)}   ✖ ${game.levelDeaths}   chicle pegado: ${L.remnants.length}/${P.maxRemnants}`;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(6, 4, ctx.measureText(text).width + 16, 22);
  ctx.fillStyle = '#fff'; ctx.fillText(text, 14, 8);
  if (L.grid.some(r => r.includes('A'))) {
    ctx.fillStyle = L.phase === 0 ? COL.A : COL.B;
    ctx.fillRect(W - 30, 8, 16, 16);
  }
  if (game.levelTime < 6 && game.mode === 'play') {
    ctx.globalAlpha = Math.min(1, (6 - game.levelTime));
    ctx.font = '15px system-ui, sans-serif';
    const tw = ctx.measureText(L.hint).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(W / 2 - tw / 2 - 12, 34, tw + 24, 28);
    ctx.fillStyle = '#ffe9f4'; ctx.textAlign = 'center'; ctx.fillText(L.hint, W / 2, 40);
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }
}

function panel(lines, sub) {
  ctx.fillStyle = 'rgba(20,8,34,0.78)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let y = H / 2 - (lines.length * 36) / 2 - 20;
  lines.forEach(([txt, size, color], i) => {
    ctx.font = `bold ${size}px system-ui, sans-serif`; ctx.fillStyle = color || '#fff';
    ctx.fillText(txt, W / 2, y); y += size + 18;
  });
  if (sub && Math.floor(game.t * 2) % 2 === 0) {
    ctx.font = '16px system-ui, sans-serif'; ctx.fillStyle = '#ffb3d6'; ctx.fillText(sub, W / 2, y + 20);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
}

function drawOverlay() {
  if (game.mode === 'title') {
    panel([
      ['CHICLE', 72, COL.gum],
      ['Plataformas de precisión con un chicle muy pegajoso', 18, '#ffe9f4'],
      ['← → mover · Z/Espacio saltar · X burbuja · R reiniciar', 15, '#cdb8e8'],
      ['Mantén SALTO contra un techo para pegarte · N saltar nivel', 15, '#cdb8e8'],
    ], 'Pulsa SALTO para empezar');
  } else if (game.mode === 'clear') {
    const r = game.results[game.levelIndex];
    panel([
      ['¡Mordido!', 44, '#ffe36e'],
      [`${game.level.name}`, 20, '#fff'],
      [`Tiempo ${fmt(r.time)}   ·   Muertes ${r.deaths}   ·   Rango ${rank(r)}`, 18, '#ffe9f4'],
    ], 'SALTO: siguiente nivel · R: repetir');
  } else if (game.mode === 'end') {
    const tot = game.results.reduce((a, r) => a + (r ? r.time : 0), 0);
    panel([
      ['¡Te comiste todos los caramelos!', 36, '#ffe36e'],
      [`Tiempo total ${fmt(tot)}   ·   Muertes totales ${game.deaths}`, 20, '#fff'],
      [game.results.map((r, i) => `${i + 1}:${r ? rank(r) : '-'}`).join('  '), 18, '#ffb3d6'],
    ], 'SALTO para volver a empezar');
  } else if (game.mode === 'pause') {
    panel([['Pausa', 44, '#fff']], 'Esc/P para seguir');
  }
}

function rank(r) {
  if (r.deaths === 0 && r.time < 12) return 'S';
  if (r.deaths === 0) return 'A';
  if (r.deaths <= 3) return 'B';
  if (r.deaths <= 10) return 'C';
  return 'D';
}

// ---------------------------------------------------------------- bucle
let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  pollGamepad();
  let stepped = false;
  game.t += dt;
  game.shake = Math.max(0, game.shake - dt);
  game.flash = Math.max(0, game.flash - dt);

  if (game.mode === 'title') {
    if (pressed.has('jump')) { game.deaths = 0; game.time = 0; game.results = []; loadLevel(0); game.mode = 'play'; pressed.clear(); }
  } else if (game.mode === 'play' && game.manual) {
    stepped = true;
  } else if (game.mode === 'play') {
    stepped = true;
    if (pressed.has('pause')) game.mode = 'pause';
    else if (pressed.has('restart')) { loadLevel(game.levelIndex); }
    else if (pressed.has('skip')) nextLevel();
    else {
      acc += dt;
      if (acc < STEP) stepped = false; // conservar pulsaciones hasta el próximo paso
      while (acc >= STEP && game.mode === 'play') {
        update(STEP);
        pressed.clear(); // los "pulsados" se consumen en el primer subpaso
        acc -= STEP;
      }
    }
  } else if (game.mode === 'pause') {
    if (pressed.has('pause') || pressed.has('jump')) { game.mode = 'play'; }
  } else if (game.mode === 'clear') {
    if (pressed.has('jump')) nextLevel();
    else if (pressed.has('restart')) { loadLevel(game.levelIndex); game.mode = 'play'; }
  } else if (game.mode === 'end') {
    if (pressed.has('jump')) game.mode = 'title';
  }
  if (game.level) updateParticles(dt);
  if (stepped || game.mode !== 'play') pressed.clear();
  draw();
  requestAnimationFrame(frame);
}

function nextLevel() {
  acc = 0;
  pressed.clear();
  if (game.levelIndex + 1 >= LEVELS.length) { game.mode = 'end'; return; }
  loadLevel(game.levelIndex + 1);
  game.mode = 'play';
}

// Ganchos para pruebas automáticas (tests/run.mjs): permite simular sin el bucle en tiempo real.
window.CHICLE = {
  game, P, LEVELS, keys, pressed, loadLevel,
  get player() { return player; },
  step(n = 1) { for (let i = 0; i < n && game.mode === 'play'; i++) { update(STEP); pressed.clear(); } },
};

requestAnimationFrame(frame);
