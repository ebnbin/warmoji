import type { EnemyDef } from '../../../../src/types/enemies'

const DARK_MATTER = {
  kind: 'darkMatter',
  emoji: '26ab',
  name: '暗物质',
  element: 'dark',
  desc: '看不见的一团暗物质：一出现就潜行，身周 3 格的引力场一直把人往它身上拖；贴到 1.6 格内顿一下，震伤身周 1.4 格，出手的那一下现形，停下一秒不动又隐没',
  size: 1.2,
  radius: 0.45,
  hp: 140,
  speed: 1.2,
  damage: 11,
  xp: 7,
  coins: 5,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 1000,
      firstDelayMs: 0,
      aim: 'self',
      // 跟着身体走的场一条能力只放得出一次，所以写成常驻
      shape: { kind: 'zone', radius: 3, durationMs: 0, follow: true, pull: 1.5, visual: { color: 0x4527a0, fillAlpha: 0.1, lineAlpha: 0.35, lineWidth: 2, enterMs: 400 } },
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'stealth' }] }],
    },
    {
      trigger: 'auto',
      cooldownMs: 1800,
      firstDelayMs: 600,
      aim: 'nearest',
      range: 1.6,
      damage: 16,
      color: 0x7e57c2,
      fireSfx: 'thud',
      windup: { ms: 400, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'disc', radius: 1.4, at: 'self' },
    },
  ],
  reactions: [{ on: 'idle', ms: 1000, still: true, to: 'self', effects: [{ kind: 'stealth' }] }],
} satisfies EnemyDef

export default DARK_MATTER
