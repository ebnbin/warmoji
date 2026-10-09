import type { EnemyDef } from '../../../../legacy/types/enemies'

const CHESHIRE = {
  kind: 'cheshire',
  emoji: '1f63c',
  name: '柴郡猫',
  element: 'dark',
  desc: '咧着嘴的柴郡猫不追人，专叼地上的金币，打死它才把叼走的吐出来，还多吐 1 枚；有人走进 5 格就闪到人身后挠一爪再闪回去，停下不动 1 秒就只剩一张笑脸地隐去',
  size: 1.25,
  radius: 0.46,
  hp: 70,
  stats: { dodge: 0.2 },
  speed: 2.6,
  damage: 10,
  xp: 6,
  coins: 4,
  drive: { kind: 'coinThief' },
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
