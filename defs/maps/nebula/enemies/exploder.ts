import type { EnemyDef } from '../../../../legacy/types/enemies'
import { ring } from '../../../kit.ts'

const EXPLODER = {
  kind: 'exploder',
  emoji: '1f92f',
  name: '爆炸头',
  element: 'fire',
  desc: '脑袋随时会炸的家伙，本身是火，点不着：一路冲到人跟前，碰到谁谁就烧起来；贴到 1.4 格内就闪着光憋 0.6 秒，随后炸开 1.8 格，把人炸飞、点着，挤在一起的会互相燎着，自己也炸没了；半路被打死也照样炸，最好远远打死',
  size: 1.25,
  radius: 0.46,
  hp: 72,
  speed: 2.2,
  damage: 10,
  xp: 3,
  coins: 2,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 0,
      firstDelayMs: 0,
      aim: 'nearest',
      range: 1.4,
      damage: 20,
      knockback: 4,
      color: 0xff7043,
      fireSfx: 'boom',
      windup: { ms: 600, lockAt: 'start', telegraph: 'blink' },
      shape: { kind: 'disc', radius: 1.8, at: 'self' },
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'vanish' }] }],
    },
  ],
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'blast', radius: 1.8, amount: 20, knockback: 4, ring: ring(0xff7043) }] }],
} satisfies EnemyDef

export default EXPLODER
