import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const CURSED_DOLL = {
  kind: 'cursedDoll',
  emoji: '1f38e',
  name: '诅咒人偶',
  element: 'poison',
  desc: '从寺墙后面挪出来的诅咒人偶，走得很慢，浑身是毒：隔一阵对 6 格内最近的人下咒，中咒的叠一层毒、4 秒内挨打更疼，中了毒的什么回复都不管用；它每挨一下，2.5 格内离它最近的人也跟着中一层毒，近身打它最吃亏；被打碎时散出一团 2.5 格的毒云，留 4 秒，云里的人每秒挨 2 点、中一层毒，火打进去就把毒云炸开；本身是毒，不会中毒',
  size: 1.2,
  radius: 0.44,
  hp: 62,
  speed: 0.8,
  damage: 6,
  xp: 5,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4500,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 6,
      damage: 6,
      fireSfx: 'creak',
      color: 0x7cb342,
      windup: { ms: 600, lockAt: 'end', telegraph: 'blink' },
      shape: { kind: 'disc', radius: 0.8, at: 'target' },
      onHit: [{ kind: 'status', status: 'exposed', ms: 4000, value: 1.25 }],
    },
  ],
  reactions: [
    { on: 'hurt', to: 'self', effects: [{ kind: 'to', who: { side: 'foes', radius: 2.5, sort: 'nearest', count: 1 }, then: [{ kind: 'damage', amount: 4 }] }] },
    { on: 'death', to: 'spot', effects: [{ kind: 'ground', def: patch(2.5, 4000, 0x9ccc65, undefined, 2, 1000) }] },
  ],
} satisfies EnemyDef

export default CURSED_DOLL
