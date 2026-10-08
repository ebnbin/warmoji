import type { EnemyDef } from '../../../src/types/enemies'

const PYLON = {
  kind: 'pylon',
  drive: { kind: 'stay' },
  emoji: '1f50b',
  name: '护盾塔',
  desc: '核能机甲立起的供能塔：只要还有一座立着，机甲就刀枪不入',
  size: 1.3,
  radius: 0.5,
  span: [0, 3],
  hp: 150,
  speed: 0,
  damage: 0,
  xp: 2,
  coins: 1,
  traits: ['anchored'],
} satisfies EnemyDef

export default PYLON
