import type { EnemyDef } from '../../../../legacy/types/enemies'

const CHESHIRE = {
  kind: 'cheshire',
  emoji: '1f63c',
  name: '柴郡猫',
  desc: '咧着嘴的柴郡猫不追人，专叼地上的金币，打死它才把叼走的吐出来，还多吐 1 枚；有人走进 5 格就闪到人身后挠一爪再闪回去，冻住的一爪就碎；身法灵，单打的有 35% 落空，范围与持续伤害躲不开；停下不动 1 秒就只剩一张笑脸地隐去',
  size: 1.25,
  radius: 0.46,
  hp: 60,
  stats: { dodge: 0.35 },
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
