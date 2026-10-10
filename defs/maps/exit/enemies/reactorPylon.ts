import type { EnemyDef } from '../../../../legacy/types/enemies'

const REACTOR_PYLON = {
  kind: 'reactorPylon',
  emoji: '1f50b',
  name: '屏蔽柱',
  element: 'thunder',
  desc: '失控核心在身边立起的屏蔽柱，一动不动也推不动：只要还有一根立着，核心就打不动；有人贴到 2 格内，它闪 0.4 秒就放一圈电，打断出手，电流再跳给旁边一个；护甲厚，燃烧、中毒照掉，站远了拆它不挨电',
  size: 1.3,
  radius: 0.5,
  span: [0, 3],
  hp: 220,
  stats: { armor: 6 },
  speed: 0,
  damage: 0,
  xp: 2,
  coins: 1,
  traits: ['anchored'],
  drive: { kind: 'stay' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2500,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 2,
      damage: 8,
      fireSfx: 'zap',
      color: 0xffd54f,
      windup: { ms: 400, lockAt: 'start', telegraph: 'blink' },
      shape: { kind: 'disc', radius: 2, at: 'self' },
    },
  ],
} satisfies EnemyDef

export default REACTOR_PYLON
