import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const FIRE_METEOR = {
  kind: 'fireMeteor',
  emoji: '2604',
  name: '火流星',
  desc: '喷发时从火山口抛出来的一块火山弹，烧得通红，点不着、不怕岩浆，石头身子硬，冻住了一敲就碎：一落地就闪一下崩开一圈，把人震开，之后满地乱窜，身后拖着一路火，踩上去的着火；每隔三秒又闪一下再崩',
  size: 1.2,
  radius: 0.45,
  span: [0, 1],
  hp: 60,
  stats: { armor: 4 },
  speed: 1.6,
  damage: 10,
  xp: 5,
  coins: 3,
  traits: ['fireproof'],
  drive: { kind: 'wander' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3000,
      firstDelayMs: 100,
      aim: 'self',
      damage: 20,
      knockback: 2.5,
      color: 0xff7043,
      fireSfx: 'boom',
      windup: { ms: 300, lockAt: 'start', telegraph: 'blink' },
      shape: { kind: 'disc', radius: 1.8, at: 'self' },
    },
    {
      trigger: 'auto',
      cooldownMs: 1000,
      firstDelayMs: 300,
      aim: 'self',
      element: 'fire',
      shape: { kind: 'world' },
      onHit: [{ kind: 'ground', def: patch(0.9, 2000, 0xff8a65, undefined, 4, 500) }],
    },
  ],
} satisfies EnemyDef

export default FIRE_METEOR
