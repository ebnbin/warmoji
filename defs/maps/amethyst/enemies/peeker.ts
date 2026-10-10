import type { EnemyDef } from '../../../../legacy/types/enemies'
import { shot } from '../../../kit.ts'

const PEEKER = {
  kind: 'peeker',
  emoji: '1fae3',
  name: '偷看鬼',
  element: 'thunder',
  desc: '躲在暗处偷看的小鬼，总和人隔着四五格，本身是雷；被人逼近到 3 格就扭头跑开；远远放电瞪人一眼：被瞪中的人正在蓄的力被打断，电流再跳给身边 2.5 格内的另一个人，身上湿的连成一片一起挨',
  size: 1.2,
  radius: 0.45,
  hp: 80,
  speed: 1.5,
  damage: 8,
  xp: 5,
  coins: 4,
  drive: { kind: 'standoff', standoffDist: 4.5 },
  drives: [{ if: { kind: 'within', who: 'target', radius: 3 }, drive: { kind: 'flee', range: 5 } }],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2400,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 7,
      damage: 9,
      fireSfx: 'zap',
      shape: { kind: 'bolt', projectile: shot('1f49c', 7, 0.5), lifeMs: 1300 },
    },
  ],
} satisfies EnemyDef

export default PEEKER
