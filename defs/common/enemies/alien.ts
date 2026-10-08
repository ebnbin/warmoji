import type { EnemyDef } from '../../../src/types/enemies'

const ALIEN = {
  kind: 'alien',
  emoji: '1f47d',
  name: '小灰人',
  desc: '成群逼近的灰皮异星客，脆但快，贴身骚扰',
  size: 1.1,
  radius: 0.42,
  hp: 20,
  stats: { dodge: 0.25, maxStamina: 50, staminaRegen: 80, exertion: 1.2 },
  speed: 3.4,
  damage: 7,
  xp: 4,
  coins: 2,
  drive: { kind: 'chase' },
} satisfies EnemyDef

export default ALIEN
