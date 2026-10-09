import type { EnemyDef } from '../../../../src/types/enemies'

const USHER = {
  kind: 'usher',
  emoji: '1f92b',
  name: '领位员',
  element: 'dark',
  desc: '从布景后面走出来的领位员：憋足一口气“嘘——”，身边 3 格的人 2.5 秒放不了技能；碰到谁就没收他的主动技能：那人的技能冷却重新走，领位员 12 秒内每 4 秒拿来放一次；打死它，那人的技能立刻转好',
  size: 1.3,
  radius: 0.48,
  hp: 90,
  speed: 1.9,
  damage: 9,
  xp: 6,
  coins: 4,
  drive: { kind: 'chase' },
  reactions: [{ on: 'touch', to: 'other', effects: [{ kind: 'steal', ms: 12_000, cooldownMs: 4000, skill: true }] }],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 6000,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 3,
      fireSfx: 'gust',
      color: 0x7e57c2,
      windup: { ms: 500, lockAt: 'start', telegraph: 'blink' },
      shape: { kind: 'disc', radius: 3, at: 'self' },
      onHit: [{ kind: 'silence', durationMs: 2500 }],
    },
  ],
} satisfies EnemyDef

export default USHER
