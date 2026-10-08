import type { EnemyDef } from '../../../../src/types/enemies'
import { patch } from '../../../kit.ts'

const LAVA_GIANT = {
  kind: 'lavaGiant',
  emoji: '1f30b',
  name: '熔岩巨人',
  element: 'fire',
  desc: '浑身淌着熔岩的巨人，不怕岩浆、推不动：一步步碾过来，走过的地方留下一路熔岩；凑近了就抡拳砸地，把身周一圈人震开',
  size: 1.9,
  radius: 0.7,
  span: [0, 3],
  hp: 230,
  stats: { armor: 8 },
  speed: 0.8,
  damage: 13,
  xp: 9,
  coins: 6,
  traits: ['fireproof', 'anchored'],
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4000,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 2.4,
      damage: 22,
      knockback: 3,
      color: 0xff7043,
      fireSfx: 'thud',
      windup: { ms: 700, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'disc', radius: 2.2, at: 'self' },
    },
    {
      trigger: 'auto',
      cooldownMs: 900,
      firstDelayMs: 0,
      aim: 'self',
      shape: { kind: 'world' },
      onHit: [{ kind: 'ground', def: patch(1.2, 4000, 0xff5722, undefined, 5, 400) }],
    },
  ],
} satisfies EnemyDef

export default LAVA_GIANT
