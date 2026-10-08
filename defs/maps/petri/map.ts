import { hslToInt } from '../../../src/util/palette.ts'
import type { MapDef } from '../../../src/types/maps'

export default {
  emoji: '1f9eb',
  name: '培养皿',
  desc: '实验室灯箱上的一只营养琼脂培养皿：队伍和敌人缩得比菌落还小，在米白透明的琼脂上作战，圆形的玻璃皿壁谁也翻不出去。皿底用记号笔分了四区，按四区划线接种过，贴着皿壁的一圈也长满了菌：菌落一刻不停地往外长，我方角色踩进去就被粘住、几乎走不动，敌人却照常在上面走。子弹和攻击都伤不了菌落，只有怪物死在哪里，那里的菌落才被溶掉一圈、露出干净的琼脂，过一阵菌落又从边上长回来；皿壁边那一圈怎么也溶不干净。菌落长过的金币被盖住，捡不到，把那块清干净才露出来',
  kind: 'petri',
  stamina: { exertion: 0.45, regen: 1 },
  palette: {
    bgFrom: 'hsl(204 16% 80%)',
    bgTo: 'hsl(212 14% 38%)',
    map: hslToInt(43, 0.55, 0.87),
  },
  // 光从头顶的灯照下来，脚下的灯箱又从下面透上来，背光面不暗、影子淡
  light: { sun: 0xfffaf4, shade: 0xc9c4b8, shadow: { color: 0x2e2412, alpha: 0.3, length: 0.6 } },
  decor: {
    emojis: ['1f9eb'],
    sizeU: [0.3, 0.5],
    alpha: [0, 0],
    density: [0, 0],
  },
  foes: ['zombie', 'blob', 'slime', 'rat', 'mushroom', 'crab', 'ghost'],
  gates: {
    snapU: 3,
    fallback: 'drop',
    look: 'splash',
    boss: 'wall',
    kinds: {
      wall: { name: '皿壁', at: { kind: 'rim', segU: 3 }, enter: 'climb', weight: 3, perSec: 1.5 },
      drip: { name: '滴落', at: { kind: 'ground' }, enter: 'drop', look: 'splash', weight: 1 },
    },
  },
  petri: {
    mmPerU: 2.7,
    dish: { radiusU: 16, wallU: 0.45 },
    plazaU: 5,
    streak: { quadrants: [3, 4], strokes: [4, 6], band: [0.5, 0.92], spacingU: [0.3, 0.8, 1.8, 3.6], colonyU: [0.3, 0.55], strays: [1, 3] },
    colony: { cellU: 0.15, stepMs: 100, growth: 0.14, frontU: 0.05, waveU: 4, patchy: 0.3, preS: 12, mature: 0.6, matureS: 30, rimU: 0.5 },
    edge: 0.43,
    stick: { viscosity: 10, exertion: 0.6 },
    lysis: { radiusU: 2, holdS: 12, halfLifeS: 4, lysePerS: 4 },
  },
  bosses: ['treant'],
} as const satisfies MapDef
