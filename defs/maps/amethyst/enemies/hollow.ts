import type { EnemyDef } from '../../../../legacy/types/enemies'

const HOLLOW = {
  kind: 'hollow',
  emoji: '1fae5',
  name: '虚影',
  element: 'water',
  desc: '一团水雾凝成的人形，时隐时现，本身是水，一直湿着：每 4 秒就有 1.5 秒淡得只剩个轮廓，谁也打不到它；被它扑到的人浇得一身湿、眼前一片模糊，0.6 秒出不了手；水做的身子一冰就冻、一电一片，火却点不着',
  size: 1.2,
  radius: 0.45,
  hp: 56,
  speed: 1.6,
  damage: 7,
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
