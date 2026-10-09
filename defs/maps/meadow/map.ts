import { hslToInt } from '../../../src/util/palette.ts'
import type { MapDef } from '../../../src/types/maps'

export default {
  emoji: '1f33c',
  name: '草甸',
  desc: '一片开满野花的草甸。一边是黑压压的针叶林，林间小路被倒下的大树堵住了；一边是牧场的木栅栏，门闩着，羊在外头吃草；一边是一道陡坡，坡上是更高的一层草甸，上不去。这里没有别的规矩，放开手脚打就是',
  kind: 'meadow',
  stamina: { exertion: 0.4, regen: 1.2 },
  palette: {
    bgFrom: 'hsl(112 23% 42%)',
    bgTo: 'hsl(158 28% 17%)',
    map: hslToInt(107, 0.33, 0.56),
  },
  light: { sun: 0xfffaf0, shade: 0xc5cdbb, shadow: { color: 0x0f1a08, alpha: 0.4, length: 0.85 } },
  decor: {
    emojis: ['1f33c', '1fabb', '1f340'],
    sizeU: [0.3, 0.45],
    alpha: [0.8, 0.92],
    density: [0.012, 0.018],
  },
  foes: ['wolf', 'tusker', 'grassSnake', 'snail', 'bull', 'goat', 'skunk', 'stormCloud'],
  gates: {
    snapU: 4,
    fallback: 'rise',
    look: 'leaves',
    boss: 'brush',
    kinds: {
      woods: { name: '林间', at: { kind: 'nooks', spacingU: 6, away: { mark: 'bare', minU: 2 } }, enter: 'walk', look: 'leaves', weight: 3, perSec: 1.5, only: ['wolf', 'tusker', 'skunk'] },
      brush: { name: '林缘', at: { kind: 'rim', segU: 3, away: { mark: 'bare', minU: 2.5 } }, enter: 'climb', look: 'leaves', weight: 1.5, perSec: 1, only: ['grassSnake', 'wolf', 'bear', 'spiderQueen', 'cheshire'] },
      log: { name: '倒木', at: { kind: 'mark' }, enter: 'climb', look: 'leaves', snapU: 5, weight: 3, perSec: 1, only: ['tusker', 'snail', 'skunk', 'wolf'] },
      fence: { name: '栅栏', at: { kind: 'mark' }, enter: 'climb', weight: 2, perSec: 1, only: ['bull', 'wolf', 'goat', 'cheshire', 'grassSnake'] },
      bank: { name: '坡顶', at: { kind: 'mark' }, enter: 'lob', look: 'leaves', reachU: 9, weight: 2, perSec: 1, only: ['goat', 'tusker', 'wolf'] },
      swarm: { name: '蝗群', at: { kind: 'ground' }, enter: 'drop', look: 'leaves', weight: 2, only: ['stormCloud', 'sandLocust'] },
      grass: { name: '草丛', at: { kind: 'ground' }, enter: 'rise', look: 'leaves', weight: 1 },
    },
  },
  meadow: {
    meterPerU: 0.5,
    sizeU: 36,
    areaU2: [760, 1040],
    neckU: 0.35,
    turf: { reliefM: 0.16, waveU: 7, riseM: 0.035 },
    bank: { insetU: [3.5, 6.5], bendU: 2.6, waveU: 12, spurs: [0, 2], spurU: [1.2, 3], spurWidthU: [2.5, 5], heightM: [3, 4], riseM: [0.8, 0.95] },
    forest: { insetU: [1.5, 5.5], bendU: 2.4, waveU: 9, scallopU: 0.45, lobes: [0, 2], lobeU: [1.5, 3.5], lobeWidthU: [1.6, 3], crownU: [1.3, 2.3], heightM: [4.5, 6.5], edgeU: [0.5, 1], birch: 0.25, overhangU: 0.4 },
    trail: { notchU: 1.6, widthU: 1.3, logU: [5, 6.5] },
    fence: { insetU: [1.5, 3], skewDeg: 6, kinkDeg: 6, postU: 2.6, heightM: 1.1, gateU: 2.2, farChance: 0.35 },
    flowers: { cover: 0.24, patchU: 4 },
    sheep: [3, 6],
  },
  bosses: ['bear', 'spiderQueen'],
} as const satisfies MapDef
