import type { EnemyDef } from '../../../../legacy/types/enemies'
import { shot } from '../../../kit.ts'

const IMP = {
  kind: 'imp',
  emoji: '1f608',
  name: '雷小鬼',
  element: 'thunder',
  desc: '火山灰里的电火花攒成的小鬼，不受传导，身子单薄、也怕岩浆：跑得飞快，看见人就凑到三格半开外，隔一阵扔一团闪电，砸中的人手上正蓄的力被打断，电流还跳到身边最近的另一名队员身上，湿的连成一片一起挨',
  size: 1.1,
  radius: 0.42,
  span: [0, 1],
  hp: 52,
  speed: 2.2,
  damage: 7,
  xp: 3,
  coins: 2,
  drive: { kind: 'standoff', standoffDist: 3.5 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2600,
      firstDelayMs: 900,
      aim: 'nearest',
      range: 5.5,
      damage: 8,
      fireSfx: 'zap',
      shape: { kind: 'bolt', projectile: shot('26a1', 7, 0.5), lifeMs: 1100 },
    },
  ],
} satisfies EnemyDef

export default IMP
