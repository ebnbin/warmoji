import type { EnemyDef } from '../../../src/types/enemies'

const RACCOON = {
  kind: 'raccoon',
  drive: { kind: 'chase' },
  emoji: '1f9b9',
  name: '怪盗',
  desc: '一碰到队员就偷走那名队员的主动技能自己用，被偷的技能冷却重新走；打死它，技能立刻还回来',
  size: 1.2,
  radius: 0.45,
  hp: 40,
  stats: { dodge: 0.25, maxStamina: 60, staminaRegen: 70, exertion: 1.2 },
  speed: 2.4,
  damage: 4,
  xp: 6,
  coins: 5,
  reactions: [{ on: 'touch', to: 'other', effects: [{ kind: 'steal', ms: 12000, cooldownMs: 4000, skill: true }] }],
} satisfies EnemyDef

export default RACCOON
