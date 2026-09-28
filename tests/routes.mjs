// Rutas de referencia por nivel (una por nivel, en orden). Sirven como prueba
// de que cada nivel es completable con las constantes de movilidad actuales.
// Paso: [segundos | condición, 'teclas separadas por espacio'].

// Trepar una sola pared rebotando y volviendo (side: 'left' | 'right' = lado de la pared).
const climb = (side, untilY) => {
  const steps = [];
  for (let i = 0; i < 16; i++) steps.push([`wall!==0 || y<${untilY}`, side], [0.017, side], [`y<${untilY}`, side + ' jump', 0.22]);
  return steps;
};
// Salto corto controlado hacia la derecha (para plataformas pequeñas).
const hop = (x) => [[`x>${x}`, 'right'], [0.08, ''], [0.1, 'jump'], [0.18, 'jump right'], [0.15, 'jump'], ['g', '']];

export const ROUTES = [
  // 1 Primer bocado
  [
    ['x>6.3', 'right'], [0.3, 'right jump'], ['g', 'right'],
    ['x>12.6', 'right'], [0.35, 'right jump'], ['g', 'right'],
    ['x>16.8', 'right'], [0.35, 'right jump'], ['g', 'right'],
    ['x>30.5', 'right'],
    ['wall', 'right jump'],
    [0.2, 'left jump'], [0.2, 'right'], [0.2, 'right jump'], [0.2, 'left'], [0.2, 'left jump'], [0.2, 'right'],
    [0.2, 'right jump'], [0.2, 'left'], [0.2, 'left jump'], [0.2, 'right'], [0.2, 'right jump'],
    ['g', 'right'], ['x<36.2', 'left'], [1, ''],
  ],
  // 2 Pared resbalosa
  [
    ['x>9.3', 'right'], [0.05, 'left'], [0.25, 'left jump'],
    ...climb('left', 7),
    ['wall!==0', 'left'], [0.4, 'right jump'], ['x>13.5', 'right'], ['g', ''],
    ['x>18.9', 'right'], ['x>24.3', 'right jump'], ['g', 'left jump'],
    ['x>25.8', 'right'], [0.3, 'right jump'], ['wall', 'right'],
    ...climb('right', 3.2),
    ['x>35', 'right'], ['x>36.5', ''], [1, ''],
  ],
  // 3 Burbuja
  [
    ['x>6.5', 'right'], [0.25, 'right jump'], ['vy>0', 'right'], [1.0, 'right bubble'], ['g', 'right'],
    ['x>30.3', 'right'], [0.1, ''], [0.3, 'jump'], ['vy>=0', 'jump'], [0.05, 'bubble'], [0.4, 'right bubble jump'],
    ['g', 'right'], [1, 'right'],
  ],
  // 4 Techo de chicle
  [
    ['x>3.5', 'right'], ['ceil', 'right jump'], ['x>26', 'right jump'], ['g', 'right'], [2, 'right'],
  ],
  // 5 Ritmo
  [
    ...hop(4.4), ...hop(7.2), ...hop(12.2), ...hop(17.2), ...hop(22.2), ...hop(27.2),
    ['x>32.2', 'right'], [0.4, 'right jump'], ['g', 'right'], ['x<37.2', 'left'], [1, ''],
  ],

  // 6 Sierras
  [
    ['x>7.2', 'right'], [0.12, 'right jump'], ['g', 'right'],
    ['x>13.3', 'right'], [0.12, 'right jump'], [0.12, 'right'], ['g', ''], [0.2, ''],
    ['s[2].cx/24 > 26.8', ''], ['s[2].cx/24 - x < 3.2', 'right'], [0.3, 'right jump'], ['g', ''],
    [0.3, ''],
    ['((T%3.2)/3.2)>0.5 && ((T%3.2)/3.2)<0.54', ''], [0.45, 'jump right'], ['g', ''],
    ['x<33.3', 'left'], [0.1, ''], ['((T%3.2)/3.2)>0.96', ''], [0.4, 'jump left'], ['g', ''], ['x<27.4', 'left'], [0.1, ''],
    ['((T%3.2)/3.2)>0.86 && ((T%3.2)/3.2)<0.9', ''], [0.1, 'jump right'], [0.3, 'jump right'], ['g', 'right'], ['x>35.5', 'right'], [1, ''],
  ],
  // 7 Restos
  [
    ['x>3.6', 'right'], [0.3, 'right jump'], ['vy>0', 'right'], ['x>17.4', 'right bubble'], ['g', ''],
    ['x<18.3', 'left'], [0.1, ''], ['((T%2.6)/2.6)>0.72 && ((T%2.6)/2.6)<0.76', ''],
    [0.3, 'right jump'], ['vy>0', 'right'], ['x>34.5', 'right bubble'], ['g', 'right'], ['x>36.4', 'right'], [1, ''],
  ],
  // 8 Gran final
  [
    ['x>5.3', 'right'], [0.3, 'right jump'],
    ...climb('right', 4.6),
    ['x>7.4', 'right'], ['g', ''], ['x<8.2', 'left'], [0.2, ''],
    ['P===0', 'jump', 0.5], ['g', ''], [0.1, ''],
    [0.35, 'jump right'], ['g', ''], ['x<12.5', 'left'], [0.1, ''],
    ['x>13.8', 'right'], [0.12, 'right jump'], ['g', ''],
    ['x>20.4', 'right'], ['ceil', 'right jump'], ['x>29.8', 'right jump'], ['g', ''],
    ['x>32.6', 'right'], [0.1, ''], ['s[1].cx/24 > 35.8', ''], [0.35, 'right'], ['g', ''], ['x<37.3', 'left'], [1, ''],
  ],
];
