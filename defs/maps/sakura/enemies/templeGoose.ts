import type { EnemyDef } from '../../../../src/types/enemies'

const TEMPLE_GOOSE = {
  kind: 'templeGoose',
  emoji: '1fabf',
  name: '护院大鹅',
  element: 'earth',
  desc: '看门的大鹅：伸长脖子冲过来啄人；隔一阵扯着嗓子大叫一声，身边 2 格内的人吓得掉头就跑',
  size: 1.3,
  radius: 0.48,
  hp: 56,
  speed: 1.8,
  damage: 6,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2400,
      firstDelayMs: 700,
      aim: 'nearest',
      range: 2.6,
      damage: 9,
      fireSfx: 'whoosh',
      windup: { ms: 350, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 2.2, ms: 260, radius: 0.85 },
    },
    {
      trigger: 'auto',
      cooldownMs: 6000,
      firstDelayMs: 2500,
      aim: 'nearest',
      range: 2,
      fireSfx: 'bleat',
      color: 0xa1887f,
      windup: { ms: 400, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'disc', radius: 2, at: 'self' },
      onHit: [{ kind: 'fear', durationMs: 800 }],
    },
  ],
} satisfies EnemyDef

export default TEMPLE_GOOSE
