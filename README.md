# CHICLE

Plataformas de precisión en HTML5 inspirado en la movilidad de *Super Meat Boy*,
con mecánicas propias: **pegarse al techo**, **burbuja** (planeo o doble salto),
**restos** (cada muerte deja una plataforma de chicle) y **bloques de ritmo** que
cambian con cada salto.

Diseño completo: [DISENO.md](DISENO.md).

## Jugar

Abre `index.html` en el navegador (no necesita servidor ni dependencias).

| Acción | Teclado | Mando |
|---|---|---|
| Moverse | ← → / A D | Stick / cruceta |
| Saltar (mantener = más alto, pegarse al techo) | Z / Espacio / ↑ / W | A |
| Burbuja | X / Shift | X / B / gatillos |
| Soltarse del techo | ↓ / S | Abajo |
| Reiniciar nivel | R | Select |
| Pausa | Esc / P | Start |
| Saltar nivel | N | — |

En móvil aparecen controles táctiles: cruceta deslizable a la izquierda, salto y burbuja a la derecha (multitoque), y pausa, reiniciar y saltar nivel. Mejor en horizontal.

## Pruebas

`npm test` abre el juego en Chromium sin ventana (Playwright) y ejecuta una ruta de
entradas por nivel (`tests/routes.mjs`) para comprobar que los 8 niveles se pueden
completar con las constantes de movilidad actuales, además de una prueba de la
mecánica de restos. Si cambias la física o un nivel, vuelve a ejecutarlo.
