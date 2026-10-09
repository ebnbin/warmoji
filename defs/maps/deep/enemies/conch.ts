import type { EnemyDef } from '../../../../legacy/types/enemies'

const CONCH = {
  kind: 'conch',
  emoji: '1f41a',
  name: '冰螺',
  element: 'ice',
  desc: '贴着谷底慢慢爬，个子矮；每 4 秒吹一声号，3 格内的人被打断，腿脚发沉 1.5 秒',
  size: 1.05,
  radius: 0.4,
  span: [0, 0],
  hp: 60,
  stats: { armor: 4 },
  speed: 0.8,
  damage: 7,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4000,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 3,
      damage: 9,
      fireSfx: 'gust',
      color: 0x80deea,
      windup: { ms: 500, lockAt: 'start', telegraph: 'blink' },
      shape: { kind: 'disc', radius: 3, at: 'self' },
      onHit: [{ kind: 'interrupt' }, { kind: 'slow', factor: 0.6, durationMs: 1500 }],
    },
  ],
} satisfies EnemyDef

export default CONCH
