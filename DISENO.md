# CHICLE — documento de diseño

Juego de plataformas de precisión. La **movilidad** está inspirada en *Super Meat Boy*:
carrera rápida con mucha inercia, control total en el aire, rebote entre paredes,
muerte instantánea y reaparición en menos de medio segundo. Las **mecánicas** son
propias y giran alrededor del protagonista: un chicle.

## 1. Núcleo de movilidad (lo heredado de Meat Boy)

| Elemento | Valor | Por qué |
|---|---|---|
| Velocidad máxima | 330 px/s (~14 tiles/s) | Niveles cortos que se cruzan en segundos |
| Aceleración suelo / aire | 3200 / 2400 px/s² | Arranque casi instantáneo; el aire es casi tan controlable como el suelo |
| Giro | ×1.6 de aceleración al invertir | Cambios de dirección secos |
| Salto | 730 px/s (≈4.8 tiles), corte ×0.45 al soltar | Salto de altura variable |
| Coyote / buffer | 90 ms / 120 ms | Perdona los frames justos sin que se note |
| Deslizamiento en pared | 170 px/s | Da tiempo para leer y rebotar |
| Salto de pared | 390 px/s lateral, 690 vertical | Con el control aéreo se puede trepar **una sola pared** rebotando y volviendo |
| Reaparición | 0.35 s | Morir no castiga, enseña |

Todas las constantes viven en el objeto `P` al inicio de `src/game.js`.

## 2. Mecánicas originales

### 2.1 Pegote de techo
Si chocas con un techo **manteniendo SALTO**, te pegas y puedes gatear por él
(240 px/s). Tienes 2.5 s de chicle; se recarga al tocar el suelo. Sueltas SALTO o
pulsas ABAJO para despegarte. Convierte los techos —normalmente un obstáculo en el
género— en caminos.

### 2.2 Burbuja
Una vez por salto, en el aire, pulsa **X**: inflas una burbuja que frena la caída y
te deja flotar hasta 1 s mientras la mantengas. Dentro de ella puedes:
- **Soltar X** → revienta sin impulso (para caer donde quieras).
- **Pulsar SALTO** → la revientas con un impulso hacia arriba (≈2.8 tiles).

Se recarga al tocar suelo, pared o techo. Es a la vez planeo horizontal y doble
salto, pero no ambas cosas en el mismo aire: hay que elegir.

### 2.3 Restos pegajosos
Cada muerte deja un **bloque de chicle sólido** donde caíste (máx. 3 por nivel; el
más antiguo desaparece). Si mueres sobre pinchos, el bloque queda justo encima y los
tapa. Tus fracasos se convierten en plataformas: el jugador experto termina con 0
restos (mejor rango), el que sufre recibe ayuda orgánica sin menús de dificultad.

### 2.4 Bloques de ritmo
Bloques rosas (A) y azules (B): sólo uno de los dos colores es sólido a la vez y
**cada salto** (normal, de pared o reventando burbuja) los alterna. El indicador de
la esquina superior derecha muestra el color activo. Obliga a contar saltos y a
usar saltos "de ajuste" para cambiar la paridad. Si un bloque aparece encima del
jugador, queda en modo fantasma hasta que salga (nunca aplasta).

### 2.5 Superficies de grasa
Bloques amarillos que no se pueden agarrar: ni deslizar, ni saltar de pared, ni
pegarse al techo. Sirven para cortar rutas y forzar el uso de las otras mecánicas.

## 3. Niveles

| # | Nombre | Enseña |
|---|---|---|
| 1 | Primer bocado | Correr, saltar, chimenea de salto de pared |
| 2 | Pared resbalosa | Grasa y trepar una sola pared |
| 3 | Burbuja | Planeo largo y reventón para ganar altura |
| 4 | Techo de chicle | Gatear por el techo sobre un foso de pinchos |
| 5 | Ritmo | Escalera de bloques A/B alternados por salto |
| 6 | Sierras | Sierras fijas, lineales y circulares; leer el ritmo |
| 7 | Restos | Foso enorme donde morir ayuda |
| 8 | Gran final | Todo junto: chimenea, paridad de ritmo, techo y sierras |

Los niveles son rejillas ASCII de 40×22 en `src/levels.js`:
`#` sólido · `~` grasa · `^` pinchos · `A`/`B` ritmo · `S` inicio · `G` meta.
Las sierras se definen aparte con posición, radio y trayectoria (`line`/`circle`).

## 4. Puntuación
Por nivel se muestra tiempo, muertes y rango: **S** (0 muertes y < 12 s), **A** (0
muertes), **B** (≤ 3), **C** (≤ 10), **D**.

## 5. Ideas para ampliar
- Repetición simultánea de todos los intentos al terminar un nivel.
- Chicle que se estira: lanzarse como tirachinas desde una pared.
- Burbujas de ambiente que empujan (viento) y enemigos que se quedan pegados.
- Editor de niveles en el navegador.
