import type { EnemyDef } from '../../../../legacy/types/enemies'

const REACTOR_PYLON = {
  kind: 'reactorPylon',
  emoji: '1f50b',
  name: '屏蔽柱',
  element: 'thunder',
  desc: '失控核心在身边立起的屏蔽柱，一动不动也推不动：只要还有一根立着，核心就打不动',
  size: 1.3,
  radius: 0.5,
  span: [0, 3],
  hp: 260,
  stats: { armor: 3 },
  speed: 0,
  damage: 0,
  xp: 2,
  coins: 1,
  traits: ['anchored'],
  drive: { kind: 'stay' },
} satisfies EnemyDef

export default REACTOR_PYLON
