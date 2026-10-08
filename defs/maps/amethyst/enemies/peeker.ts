import type { EnemyDef } from '../../../../src/types/enemies'
import { shot } from '../../../kit.ts'

const PEEKER = {
  kind: 'peeker',
  emoji: '1fae3',
  name: '偷看鬼',
  element: 'dark',
  desc: '躲在暗处偷看的小鬼，总和人隔着四五格；被人逼近到 3 格就扭头跑开；远远瞪人一眼，被瞪中的 3 秒内受到的伤害 ×1.2',
  size: 1.2,
  radius: 0.45,
  hp: 80,
  speed: 1.5,
  damage: 8,
  xp: 5,
  coins: 4,
  drive: { kind: 'standoff', detectRange: 14, standoffDist: 4.5 },
  drives: [{ if: { kind: 'within', who: 'target', radius: 3 }, drive: { kind: 'flee', range: 5 } }],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2400,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 7,
      damage: 12,
      fireSfx: 'shoot',
      shape: { kind: 'bolt', projectile: shot('1f49c', 7, 0.5), lifeMs: 1300 },
      onHit: [{ kind: 'status', status: 'exposed', ms: 3000, value: 1.2 }],
    },
  ],
} satisfies EnemyDef

export default PEEKER
