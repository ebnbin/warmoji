import type { EnemyDef } from '../../../../legacy/types/enemies'

const QUAKER = {
  kind: 'quaker',
  emoji: '1fae8',
  name: '地动怪',
  desc: '浑身打哆嗦的地动怪，皮也厚：凑近了就抖得更凶，抖上一阵一跺脚，震出三格的地震，震中的人晕上一会儿',
  size: 1.35,
  radius: 0.5,
  hp: 150,
  stats: { armor: 4 },
  speed: 1.1,
  damage: 9,
  xp: 6,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4000,
      firstDelayMs: 2000,
      aim: 'nearest',
      range: 3,
      damage: 12,
      color: 0xa1887f,
      fireSfx: 'rumble',
      windup: { ms: 800, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'disc', radius: 3, at: 'self' },
      onHit: [{ kind: 'stun', durationMs: 800 }],
    },
  ],
} satisfies EnemyDef

export default QUAKER
