import type { EnemyDef } from '../../../../legacy/types/enemies'

const CONCH = {
  kind: 'conch',
  emoji: '1f41a',
  name: '法螺',
  desc: '背着厚壳贴着谷底慢慢爬，个子矮、护甲厚，最好冻住了一下敲碎；每 4 秒吹一声号，3 格内的人挨 10 点、被远远震开，冻住的人挨这一下就碎冰',
  size: 1.05,
  radius: 0.4,
  span: [0, 0],
  hp: 50,
  stats: { armor: 8 },
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
      damage: 10,
      knockback: 3,
      fireSfx: 'rumble',
      color: 0xffcc80,
      windup: { ms: 500, lockAt: 'start', telegraph: 'blink' },
      shape: { kind: 'disc', radius: 3, at: 'self' },
    },
  ],
} satisfies EnemyDef

export default CONCH
