import type { EnemyDef } from '../../../../src/types/enemies'

const USHER = {
  kind: 'usher',
  emoji: '1f92b',
  name: '领位员',
  element: 'dark',
  desc: '从布景后面走出来的领位员：憋足一口气“嘘——”，身边 3 格的人 2.5 秒放不了技能；手电往前一照，照到的人 0.8 秒出不了手',
  size: 1.3,
  radius: 0.48,
  hp: 110,
  speed: 1.4,
  damage: 9,
  xp: 6,
  coins: 4,
  drive: { kind: 'chase' },
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
    {
      trigger: 'auto',
      cooldownMs: 2800,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 5,
      damage: 11,
      fireSfx: 'zap',
      color: 0xfff9c4,
      shape: { kind: 'segment', reach: 5, radius: 0.45, ms: 200, beam: true },
      onHit: [{ kind: 'disarm', durationMs: 800 }],
    },
  ],
} satisfies EnemyDef

export default USHER
