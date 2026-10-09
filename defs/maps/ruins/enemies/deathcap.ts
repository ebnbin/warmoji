import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const SPORES = [{ kind: 'poison', damage: 2, tickMs: 600, durationMs: 2400 }] as const

const DEATHCAP = {
  kind: 'deathcap',
  emoji: '1f344_200d_1f7eb',
  name: '枯木菇',
  desc: '慢吞吞挪过来的毒菇，每隔几秒在身边喷出一圈孢子，站在孢子里的人一下下掉血并中毒；倒下时喷出一大团',
  size: 1.15,
  radius: 0.44,
  span: [0, 1],
  hp: 70,
  speed: 0.8,
  damage: 7,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3500,
      firstDelayMs: 1500,
      aim: 'self',
      fireSfx: 'gurgle',
      shape: { kind: 'world' },
      onHit: [{ kind: 'ground', def: patch(1.8, 3000, 0xa5a35a, SPORES, 3) }],
    },
  ],
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'ground', def: patch(2.5, 4500, 0xa5a35a, SPORES, 3) }] }],
} satisfies EnemyDef

export default DEATHCAP
