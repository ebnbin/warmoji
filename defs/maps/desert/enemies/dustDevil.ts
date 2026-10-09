import type { EnemyDef } from '../../../../legacy/types/enemies'
import { zoneLook } from '../../../kit.ts'

const DUST_DEVIL = {
  kind: 'dustDevil',
  emoji: '1f32a',
  name: '尘卷风',
  element: 'thunder',
  desc: '在回绕的沙海里乱窜、卷着一身静电，本身不受传导：身边 2 格卷着一团沙尘，把人往里吸，每半秒刮一下；隔 2 秒放一道静电，把贴到跟前的人抛上半空、打断手上的出手，电流再跳给 2.5 格内另一个人；碰到它也会被电一下；扎堆站着最吃亏',
  size: 1.7,
  radius: 0.55,
  span: [0, 3],
  hp: 75,
  speed: 2.4,
  damage: 5,
  xp: 6,
  coins: 4,
  drive: { kind: 'wander' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 0,
      firstDelayMs: 0,
      aim: 'self',
      element: 'physical',
      damage: 3,
      shape: { kind: 'zone', radius: 2, durationMs: 0, tickMs: 500, follow: true, pull: 1.8, visual: zoneLook(0xd7ccc8) },
    },
    {
      trigger: 'auto',
      cooldownMs: 2000,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 1.6,
      damage: 7,
      fireSfx: 'zap',
      color: 0xfff176,
      shape: { kind: 'disc', radius: 1.2, at: 'self' },
      onHit: [{ kind: 'knockup', durationMs: 600, height: 1.2 }],
    },
  ],
} satisfies EnemyDef

export default DUST_DEVIL
