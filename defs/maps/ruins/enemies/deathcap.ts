import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const SPORE_COLOR = 0xa5a35a

const DEATHCAP = {
  kind: 'deathcap',
  emoji: '1f344_200d_1f7eb',
  name: '枯木菇',
  element: 'poison',
  desc: '慢吞吞挪过来的毒菇，本身是毒、毒不倒它：每隔几秒在身边喷出一圈孢子毒云，站在云里的人每半秒掉血、叠一层毒，中了毒什么回复都不管用；倒下时喷出一大团；火打进毒云就连云炸开，云里的怪连它自己各挨那一下的一倍半',
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
      onHit: [{ kind: 'ground', def: patch(1.8, 3000, SPORE_COLOR, undefined, 3, 500) }],
    },
  ],
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'ground', def: patch(2.5, 4500, SPORE_COLOR, undefined, 3, 500) }] }],
} satisfies EnemyDef

export default DEATHCAP
