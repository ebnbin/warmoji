import type { EnemyDef } from '../../../../src/types/enemies'

const PUMPKINLING = {
  kind: 'pumpkinling',
  emoji: '1f383',
  name: '南瓜仔',
  element: 'fire',
  desc: '南瓜王召出的小南瓜，蹦跳着扑过来，贴到 1.2 格内就一闪一闪地憋足了气，半秒后炸开 1.4 格，炸完就没了',
  size: 0.9,
  radius: 0.34,
  span: [0, 1],
  hp: 20,
  speed: 2.2,
  damage: 4,
  xp: 0,
  coins: 0,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 0,
      firstDelayMs: 0,
      aim: 'nearest',
      range: 1.2,
      damage: 18,
      color: 0xff7043,
      fireSfx: 'boom',
      windup: { ms: 500, lockAt: 'start', telegraph: 'blink' },
      shape: { kind: 'disc', radius: 1.4, at: 'self' },
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'vanish' }] }],
    },
  ],
} satisfies EnemyDef

export default PUMPKINLING
