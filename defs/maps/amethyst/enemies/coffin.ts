import type { EnemyDef } from '../../../../legacy/types/enemies'
import { zoneLook } from '../../../kit.ts'
import CAVE_BAT from './caveBat.ts'

const COFFIN = {
  kind: 'coffin',
  emoji: '26b0',
  name: '棺材',
  element: 'poison',
  desc: '立在暗处的一口棺材，一动不动也推不走，棺板厚（护甲 8），本身是毒：每 7 秒棺盖一开飞出 2 只洞蝠，最多同时 4 只，不拆掉就一直飞；棺材缝里每 7 秒冒出一团 2.5 格的尸毒，罩 5 秒，云里的人每秒挨 4 点、多中一层毒，中着毒什么回复都不管用；火打进尸毒里会爆燃，连棺材带云里的蝙蝠一起炸',
  size: 1.5,
  radius: 0.55,
  hp: 150,
  stats: { armor: 8 },
  speed: 0,
  damage: 0,
  xp: 7,
  coins: 5,
  traits: ['anchored'],
  drive: { kind: 'stay' },
  spawner: { into: CAVE_BAT, intervalMs: 7000, count: 2, maxAlive: 4, firstDelayMs: 2500 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 7000,
      firstDelayMs: 2000,
      aim: 'self',
      damage: 4,
      fireSfx: 'bubble',
      shape: { kind: 'zone', radius: 2.5, durationMs: 5000, tickMs: 1000, visual: zoneLook(0x9ccc65) },
    },
  ],
} satisfies EnemyDef

export default COFFIN
