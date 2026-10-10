import type { EnemyDef } from '../../../../legacy/types/enemies'
import { shot } from '../../../kit.ts'

const PEARL_CLAM = {
  kind: 'pearlClam',
  emoji: '1f9aa',
  name: '珍珠贝',
  element: 'water',
  desc: '趴在谷底一动不动，每隔两秒多朝人喷一股水，喷中的浇湿；壳厚，挨打时有四成几率合上壳，两秒内受到的伤害只剩三成；本身一直是湿的，一冰就冻住，冻住时合不上壳，正好一下敲碎',
  size: 1.2,
  radius: 0.46,
  span: [0, 1],
  hp: 90,
  stats: { armor: 6 },
  speed: 0,
  damage: 0,
  xp: 4,
  coins: 4,
  traits: ['anchored'],
  drive: { kind: 'stay' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2200,
      firstDelayMs: 800,
      aim: 'nearest',
      range: 7,
      damage: 8,
      fireSfx: 'splash',
      shape: { kind: 'bolt', projectile: shot('1f4a6', 7, 0.45), lifeMs: 1100 },
    },
  ],
  reactions: [{ on: 'hurt', to: 'self', chance: 0.4, if: { kind: 'not', cond: { kind: 'marked', who: 'self', mark: 'frozen' } }, effects: [{ kind: 'guard', mul: 0.3, durationMs: 2000 }] }],
} satisfies EnemyDef

export default PEARL_CLAM
