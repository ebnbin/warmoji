import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const SEEP_BUBBLE = {
  kind: 'seepBubble',
  emoji: '1fae7',
  name: '冷泉泡',
  element: 'ice',
  desc: '从冷泉里冒出来的冰冷气泡，飘着贴过来；到了身边就鼓胀，0.4 秒后炸开，1.3 格内的人减速一半 2 秒，炸完自己就没了；被打破的地方留下一滩冷水，踩进去走不快',
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
      damage: 12,
      fireSfx: 'bubble',
      color: 0xb3e5fc,
      windup: { ms: 400, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'disc', radius: 1.3, at: 'self' },
      onHit: [{ kind: 'slow', factor: 0.5, durationMs: 2000 }],
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'vanish' }] }],
    },
  ],
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'ground', def: patch(1.5, 3000, 0x81d4fa, [{ kind: 'slow', factor: 0.6, durationMs: 600 }]) }] }],
} satisfies EnemyDef

export default SEEP_BUBBLE
