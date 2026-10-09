import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const SAND_SCORPION = {
  kind: 'sandScorpion',
  emoji: '1f982',
  name: '沙蝎',
  element: 'poison',
  desc: '从沙下钻出来；7 格内没人时伏着不动，停满 1.5 秒就钻回沙里潜行，出手才现形；甲壳硬，本身不会中毒；钳子一夹让人迈不开腿，尾刺够得远，扎一下叠一层毒，连着扎中同一个人 3 下（每下隔不到 5 秒），那人的体力一下子见底；死后毒囊破开，留下一团 1.5 格的毒云 3 秒，火打在云里的敌人身上会把它炸开',
  size: 1.3,
  radius: 0.48,
  span: [0, 1],
  hp: 72,
  stats: { armor: 4 },
  speed: 1.5,
  damage: 6,
  xp: 6,
  coins: 4,
  drive: { kind: 'chase' },
  drives: [{ if: { kind: 'noFoesNear', who: 'self', radius: 7 }, drive: { kind: 'stay' } }],
  reactions: [
    { on: 'idle', ms: 1500, still: true, to: 'self', effects: [{ kind: 'stealth' }] },
    { on: 'death', to: 'spot', effects: [{ kind: 'ground', def: patch(1.5, 3000, 0x9ccc65, undefined, 3, 500) }] },
  ],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 1800,
      firstDelayMs: 500,
      aim: 'nearest',
      range: 1.6,
      element: 'physical',
      damage: 10,
      fireSfx: 'chip',
      shape: { kind: 'segment', reach: 1.2, radius: 0.45, ms: 140 },
      onHit: [{ kind: 'root', durationMs: 600 }],
    },
    {
      trigger: 'auto',
      cooldownMs: 3200,
      firstDelayMs: 1200,
      aim: 'nearest',
      range: 2.4,
      damage: 11,
      fireSfx: 'whoosh',
      windup: { ms: 350, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'segment', reach: 2.2, radius: 0.35, ms: 160 },
      onHit: [{ kind: 'stack', max: 3, durationMs: 5000, then: [{ kind: 'exhaust' }] }],
    },
  ],
} satisfies EnemyDef

export default SAND_SCORPION
