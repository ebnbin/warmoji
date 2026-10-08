import type { EnemyDef } from '../../../../src/types/enemies'

const WEIGHTLESS = {
  kind: 'weightless',
  emoji: '1f635_200d_1f4ab',
  name: '失重者',
  element: 'light',
  desc: '晕头转向飘在半空的人：贴近了晃 0.5 秒，让身边 2.2 格的人一起失重飘起 1 秒，飘着的时候照样被引力拖着走',
  size: 1.25,
  radius: 0.46,
  span: [1, 2],
  hp: 120,
  speed: 1.3,
  damage: 10,
  xp: 6,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3500,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 2.2,
      damage: 12,
      color: 0xfff59d,
      fireSfx: 'warp',
      windup: { ms: 500, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'disc', radius: 2.2, at: 'self' },
      onHit: [{ kind: 'knockup', durationMs: 1000, height: 1.2 }],
    },
  ],
} satisfies EnemyDef

export default WEIGHTLESS
