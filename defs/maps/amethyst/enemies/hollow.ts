import type { EnemyDef } from '../../../../src/types/enemies'

const HOLLOW = {
  kind: 'hollow',
  emoji: '1fae5',
  name: '虚影',
  element: 'dark',
  desc: '人形的一团虚影，时隐时现：每 4 秒就有 1.5 秒淡得只剩个轮廓，谁也打不到它；被它碰到的人眼前一黑，0.6 秒出不了手',
  size: 1.2,
  radius: 0.45,
  hp: 56,
  speed: 1.6,
  damage: 9,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4000,
      firstDelayMs: 1500,
      aim: 'self',
      fireSfx: 'warp',
      shape: { kind: 'world' },
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'untargetable', durationMs: 1500 }] }],
    },
  ],
  reactions: [{ on: 'touch', to: 'other', effects: [{ kind: 'disarm', durationMs: 600 }] }],
} satisfies EnemyDef

export default HOLLOW
