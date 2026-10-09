import type { EnemyDef } from '../../../../legacy/types/enemies'
import { zoneLook } from '../../../kit.ts'

const DUST_DEVIL = {
  kind: 'dustDevil',
  emoji: '1f32a',
  name: '尘卷风',
  element: 'thunder',
  desc: '在回绕的沙海里乱窜：身边 2 格卷着一团沙尘，把人往里吸，每半秒刮一下；贴到跟前的隔 2 秒就被抛上半空，碰到它还会被电得一麻',
  size: 1.7,
  radius: 0.55,
  span: [0, 3],
  hp: 75,
  speed: 2.4,
  damage: 6,
  xp: 6,
  coins: 4,
  drive: { kind: 'wander' },
  reactions: [{ on: 'touch', to: 'other', effects: [{ kind: 'stun', durationMs: 400 }] }],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 0,
      firstDelayMs: 0,
      aim: 'self',
      damage: 3,
      shape: { kind: 'zone', radius: 2, durationMs: 0, tickMs: 500, follow: true, pull: 1.8, visual: zoneLook(0xd7ccc8) },
    },
    {
      trigger: 'auto',
      cooldownMs: 2000,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 1.6,
      damage: 8,
      fireSfx: 'whoosh',
      color: 0xd7ccc8,
      shape: { kind: 'disc', radius: 1.2, at: 'self' },
      onHit: [{ kind: 'knockup', durationMs: 600, height: 1.2 }],
    },
  ],
} satisfies EnemyDef

export default DUST_DEVIL
