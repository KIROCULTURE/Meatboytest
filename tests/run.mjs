// Prueba automática: carga el juego en Chromium sin ventana y ejecuta una ruta
// de entradas por nivel para comprobar que cada nivel se puede completar.
// Uso: node tests/run.mjs   (requiere playwright)
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import { ROUTES } from './routes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForFunction(() => window.CHICLE);

let ok = true;
const only = process.argv[2] ? Number(process.argv[2]) - 1 : null;
for (let i = 0; i < ROUTES.length; i++) {
  if (only !== null && i !== only) continue;
  const res = await page.evaluate(([i, route]) => {
    const C = window.CHICLE;
    C.game.manual = true;
    C.loadLevel(i);
    C.game.mode = 'play';
    const trace = [];
    let t = 0;
    // Cada paso: [duración en s | condición en texto, teclas]. Las condiciones ven
    // x,y (tiles, esquina sup. izq.), vx, vy, g (en suelo), wall, ceil, T (tiempo del
    // nivel), s (sierras, con cx/cy en px) y P (fase de los bloques de ritmo).
    // Un tercer elemento opcional fija la duración máxima; si la condición ya se
    // cumple al empezar, el paso se omite sin tocar las teclas.
    for (const [until, input, maxSecs] of route) {
      const cond = typeof until === 'string'
        ? new Function('x', 'y', 'vx', 'vy', 'g', 'wall', 'ceil', 'T', 's', 'P', 'return ' + until)
        : null;
      const p0 = C.player;
      if (cond && cond(p0.x / 24, p0.y / 24, p0.vx, p0.vy, p0.onGround, p0.wall, p0.ceiling, C.game.levelTime, C.game.level.saws, C.game.level.phase)) continue;
      const want = new Set(input.split(' ').filter(Boolean));
      for (const k of want) if (!C.keys.has(k)) C.pressed.add(k);
      C.keys.clear(); want.forEach(k => C.keys.add(k));
      const n = Math.round((maxSecs ?? (cond ? 6 : until)) * 120);
      for (let s = 0; s < n; s++) {
        const p = C.player;
        if (cond && cond(p.x / 24, p.y / 24, p.vx, p.vy, p.onGround, p.wall, p.ceiling, C.game.levelTime, C.game.level.saws, C.game.level.phase)) break;
        C.step(1); t++;
        if (C.player.dead) return { done: false, died: true, t: t / 120, x: C.player.x / 24, y: C.player.y / 24, trace };
        if (C.game.mode === 'clear') return { done: true, t: t / 120, trace };
        if (t % 12 === 0) trace.push([+(C.player.x / 24).toFixed(1), +(C.player.y / 24).toFixed(1)]);
      }
    }
    return { done: false, t: t / 120, x: C.player.x / 24, y: C.player.y / 24, trace };
  }, [i, ROUTES[i]]);
  const name = (await page.evaluate(i => window.CHICLE.LEVELS[i].name, i));
  console.log(`${res.done ? 'OK  ' : 'FAIL'} ${i + 1} ${name} t=${res.t.toFixed(2)}${res.done ? '' : ` pos=(${res.x.toFixed(1)},${res.y.toFixed(1)})${res.died ? ' MURIÓ' : ''}`}`);
  if (!res.done) { ok = false; if (process.env.TRACE) console.log(JSON.stringify(res.trace)); }
}
// Mecánica de restos: morir sobre pinchos deja un bloque de chicle justo encima.
if (only === null) {
  const rem = await page.evaluate(() => {
    const C = window.CHICLE;
    C.loadLevel(6); C.game.mode = 'play'; C.keys.clear();
    for (let k = 0; k < 4; k++) {
      C.player.x = [6, 10, 14, 24][k] * 24 + 3; C.player.y = 17 * 24; C.player.vx = 0; C.player.vy = 0;
      for (let i = 0; i < 240 && !C.player.dead; i++) C.step(1);
      for (let i = 0; i < 120 && C.player.dead; i++) C.step(1);
    }
    return C.game.level.remnants.map(r => [r.x, r.y]);
  });
  const good = JSON.stringify(rem) === JSON.stringify([[10, 19], [14, 19], [24, 19]]);
  console.log(`${good ? 'OK  ' : 'FAIL'} restos (máx. 3, encima de los pinchos): ${JSON.stringify(rem)}`);
  if (!good) ok = false;
}
if (errors.length) { ok = false; console.log('Errores de página:', errors); }
await browser.close();
process.exit(ok ? 0 : 1);
