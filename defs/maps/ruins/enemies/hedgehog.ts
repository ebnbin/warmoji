import type { EnemyDef } from '../../../../legacy/types/enemies'

const HEDGEHOG = {
  kind: 'hedgehog',
  emoji: '1f994',
  name: '刺猬',
  desc: '缩成刺球朝人滚过来，撞上就把人顶出 2 格，顶到墙上的晕 0.8 秒；浑身是刺，近身打它的每下被反扎 8 点；护甲厚，燃烧和中毒却不吃护甲；挨打时常缩成一团，1.5 秒内受到的伤害减半',
  size: 1.1,
  radius: 0.42,
  span: [0, 1],
  hp: 80,
  stats: { armor: 4, thorns: 8 },
  speed: 1.3,
  damage: 8,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3000,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 5,
      damage: 12,
      fireSfx: 'whoosh',
      windup: { ms: 450, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 5, ms: 550, radius: 0.8 },
      onHit: [{ kind: 'shove', distance: 2, ms: 240, onWall: [{ kind: 'stun', durationMs: 800 }] }],
    },
  ],
  reactions: [{ on: 'hurt', to: 'self', chance: 0.4, effects: [{ kind: 'guard', mul: 0.5, durationMs: 1500 }] }],
} satisfies EnemyDef

export default HEDGEHOG
