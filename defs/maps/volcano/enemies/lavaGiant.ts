import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch, shot } from '../../../kit.ts'

const LAVA_GIANT = {
  kind: 'lavaGiant',
  emoji: '1f30b',
  name: '熔岩巨人',
  element: 'fire',
  desc: '浑身淌着熔岩的巨人，不怕岩浆、推不动：一步步碾过来，走过的地方留下一路熔岩；人在 3 格开外就朝人抛出一扇 3 块熔岩弹，高高越过挡路的矮墙，凑近了就抡拳砸地，把身周一圈人震开',
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
      cooldownMs: 3500,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 8,
      damage: 8,
      fireSfx: 'shoot',
      when: { kind: 'not', cond: { kind: 'within', who: 'target', radius: 3 } },
      shape: { kind: 'bolt', projectile: { ...shot('1faa8', 3, 0.4), flight: { kind: 'arc', peakM: 2.2 } }, lifeMs: 3000 },
      repeat: { count: 3, spreadDeg: 36 },
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
