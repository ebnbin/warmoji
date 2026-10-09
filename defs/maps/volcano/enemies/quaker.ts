import type { EnemyDef } from '../../../../legacy/types/enemies'

const QUAKER = {
  kind: 'quaker',
  emoji: '1fae8',
  name: '地动怪',
  desc: '浑身打哆嗦的地动怪，抖得太厉害，单打它一个的出手三成会落空，范围与持续伤害躲不开：凑近了就抖得更凶，抖上 0.8 秒一跺脚，震出三格的地震，震中的人被震开、晕上一会儿，冻住的一震就碎；跺脚前挨一下雷就白抖了',
  size: 1.35,
  radius: 0.5,
  hp: 140,
  stats: { dodge: 0.3 },
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
      damage: 14,
      knockback: 2,
      color: 0xa1887f,
      fireSfx: 'rumble',
      windup: { ms: 800, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'disc', radius: 3, at: 'self' },
      onHit: [{ kind: 'stun', durationMs: 800 }],
    },
  ],
} satisfies EnemyDef

export default QUAKER
