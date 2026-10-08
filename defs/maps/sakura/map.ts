import { hslToInt } from '../../../src/util/palette.ts'
import type { MapDef } from '../../../src/types/maps'

export default {
  emoji: '1f338',
  name: '樱花',
  desc: '寺院外溪边的一片樱林空地，花开得正好，地上铺满了落花。一面是寺院的瓦顶土墙，另外三面是樱树林，林缘的樱树一棵挨一棵，走不进去。一条溪斜斜地穿过空地：上游从林子里一排大石头的缝里涌进来，下游漫过一道低石槛、穿过竹栅流进林子。溪水深：站不住的地方就顺水漂，只能划水往两边挣，逆流基本划不动；漂到下游就被水压在竹栅前，贴着竹栅挪到岸边才上得来——敌我都一样，落进水里的金币也堆在栅前。溪上有一座木桥，走桥上不沾水，桥下照样漂。巨鳄个子大，蹚得过去',
  kind: 'sakura',
  stamina: { exertion: 0.5, regen: 1 },
  palette: {
    bgFrom: 'hsl(350 38% 42%)',
    bgTo: 'hsl(22 34% 15%)',
    map: hslToInt(88, 0.32, 0.42),
  },
  light: { sun: 0xfffaf6, shade: 0xd1c2c4, shadow: { color: 0x2a1216, alpha: 0.38, length: 0.55 } },
  decor: {
    emojis: ['1f338'],
    sizeU: [0.26, 0.38],
    alpha: [0.85, 0.95],
    density: [0.004, 0.008],
  },
  foes: ['zombie', 'ghost', 'blob', 'slime', 'snake', 'puffer', 'turtle', 'siren', 'crab'],
  gates: {
    snapU: 3,
    fallback: 'rise',
    look: 'petals',
    boss: 'rocks',
    kinds: {
      grove: { name: '樱林', at: { kind: 'nooks', spacingU: 7, away: { mark: 'ports', minU: 2.5 } }, enter: 'walk', look: 'petals', weight: 3, perSec: 1.5, only: ['zombie', 'ghost', 'blob', 'slime', 'snake'] },
      thicket: { name: '林缘', at: { kind: 'rim', segU: 3, away: { mark: 'ports', minU: 2.5 } }, enter: 'climb', look: 'petals', weight: 1.5, perSec: 1, only: ['zombie', 'blob', 'slime', 'snake'] },
      wall: { name: '寺墙', at: { kind: 'mark' }, enter: 'climb', weight: 2, perSec: 1, only: ['ghost', 'zombie'] },
      bank: { name: '溪岸', at: { kind: 'mark' }, enter: 'climb', look: 'splash', weight: 3, perSec: 1.5, only: ['snake', 'puffer', 'turtle', 'siren', 'crab'] },
      rocks: { name: '石组', at: { kind: 'mark' }, enter: 'climb', look: 'splash', weight: 1, only: ['croc'] },
      lawn: { name: '落花', at: { kind: 'ground' }, enter: 'rise', look: 'petals', weight: 1 },
    },
  },
  sakura: {
    meterPerU: 0.5,
    cellU: 0.25,
    sizeU: 36,
    areaU2: [700, 1000],
    neckU: 0.35,
    wall: { insetU: [2.2, 3.2], skewDeg: 5, kinkDeg: 5, thickU: 0.6, heightM: 1.6, eaveU: 0.55, gateU: 2.4 },
    forest: { insetU: [2, 4.5], bendU: 2.2, waveU: 9, scallopU: 0.45, lobes: [0, 2], lobeU: [1.5, 3], lobeWidthU: [1.6, 3] },
    stream: { slantDeg: 25, turnDeg: 15, meanderU: 3, minBend: 1.6, wallGapU: 3 },
    flow: { discharge: 4, widthCoef: 1.55, depthCoef: 0.69, manning: 0.035, bedShape: 8, pool: 1.35, riffle: 0.8, thalwegShift: 0.35, bankM: 0.45, bankU: 1, floodSlope: 0.015, reliefM: 0.1 },
    rocks: { radiusU: [0.36, 0.82], gapU: [0.04, 0.2], heightM: 0.6 },
    sill: { rampU: 1.5, dropM: 0.8, postU: 0.42, heightM: 1.1 },
    bridge: { widthU: 2.6, rampU: 1.4, riseM: 0.6, at: [0.3, 0.7] },
    trees: { inside: [3, 6], crownU: [1.3, 2.2], heightM: [4, 6], overhangU: 0.5, templeGapU: 4.5 },
    body: { kg: 60, radiusU: 0.45, density: 985, drag: 1.1, legs: 0.55, hip: 0.5, lever: 0.15, mu: 0.5, swim: 0.4, wetM: 0.02 },
  },
  bosses: ['croc'],
} as const satisfies MapDef
