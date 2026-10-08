import type { EnemyDef } from '../../../../src/types/enemies'

const CHESHIRE = {
  kind: 'cheshire',
  emoji: '1f63c',
  name: '柴郡猫',
  element: 'dark',
  desc: '离人三格远远蹲着的柴郡猫，停下不动 1 秒就只剩一张笑脸地隐去；隔 3 秒闪到人身后挠一爪，再闪回原处',
  size: 1.25,
  radius: 0.46,
  hp: 100,
  speed: 1.8,
  damage: 10,
  xp: 6,
  coins: 4,
  drive: { kind: 'standoff', standoffDist: 3 },
  reactions: [{ on: 'idle', ms: 1000, still: true, to: 'self', effects: [{ kind: 'stealth' }] }],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3000,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 5,
      damage: 16,
      fireSfx: 'whoosh',
      shape: { kind: 'blink', behindDist: 0.5, strikeMs: 250 },
    },
  ],
} satisfies EnemyDef

export default CHESHIRE
