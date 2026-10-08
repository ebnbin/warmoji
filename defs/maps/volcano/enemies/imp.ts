import type { EnemyDef } from '../../../../src/types/enemies'
import { shot } from '../../../kit.ts'

const IMP = {
  kind: 'imp',
  emoji: '1f608',
  name: '熔岩小鬼',
  element: 'fire',
  desc: '从崖脚的洞里蹿出来的小鬼，不怕岩浆：跑得飞快，看见人就凑到三格半开外，隔一阵扔一团火球，砸中的人还要烧上两秒',
  size: 1.1,
  radius: 0.42,
  span: [0, 1],
  hp: 52,
  speed: 2.2,
  damage: 8,
  xp: 3,
  coins: 2,
  traits: ['fireproof'],
  drive: { kind: 'standoff', detectRange: 14, standoffDist: 3.5 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2200,
      firstDelayMs: 900,
      aim: 'nearest',
      range: 5.5,
      damage: 10,
      fireSfx: 'ignite',
      shape: { kind: 'bolt', projectile: shot('1f525', 6.5, 0.5), lifeMs: 1200 },
      onHit: [{ kind: 'poison', damage: 2, tickMs: 500, durationMs: 2000 }],
    },
  ],
} satisfies EnemyDef

export default IMP
