import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const SEEP_BUBBLE = {
  kind: 'seepBubble',
  emoji: '1fae7',
  name: '冷泉泡',
  element: 'ice',
  desc: '从冷泉里冒出来的冰冷气泡，本身是冰：飘着贴过来，到了身边就鼓胀，0.4 秒后炸开，1.3 格内的人挨 10 点、冷一层，湿的当场冻住，炸完自己就没了；被打破的地方留下一滩冷水 3 秒，站在里面每秒冷一层；趁它还远就打破',
  size: 1.1,
  radius: 0.42,
  span: [1, 2],
  hp: 30,
  speed: 1.4,
  damage: 0,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 1000,
      firstDelayMs: 0,
      aim: 'nearest',
      range: 1.2,
      damage: 10,
      fireSfx: 'bubble',
      color: 0xb3e5fc,
      windup: { ms: 400, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'disc', radius: 1.3, at: 'self' },
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'vanish' }] }],
    },
  ],
  // 冷水每秒才冷一层：跳得再快，踩进去的人一眨眼就冻住
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'ground', def: patch(1.5, 3000, 0x81d4fa, undefined, 0, 1000) }] }],
} satisfies EnemyDef

export default SEEP_BUBBLE
