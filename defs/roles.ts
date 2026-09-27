import type { RoleDef } from '../src/types/roles'

export const ROLES = {
  tank: { name: '坦克', stats: { add: { armor: 6, maxHp: 40 }, mul: { damage: 0.9 } } },
  bruiser: { name: '斗士', stats: { add: { armor: 3, lifesteal: 0.05 } } },
  assassin: { name: '刺客', stats: { add: { dodge: 0.15, maxHp: -20 }, mul: { critDamage: 1.25, bossDamage: 1.15 } } },
  ranged: { name: '远程', stats: {} },
  area: { name: '范围', stats: { add: { maxHp: -15 }, mul: { areaDamage: 1.15 } } },
  summoner: { name: '召唤', stats: { add: { maxHp: -10 }, mul: { summonDamage: 1.15 } } },
  support: { name: '辅助', stats: { mul: { healing: 1.15, skillCooldown: 0.91, damage: 0.9 } } },
  controller: { name: '控制', stats: { mul: { skillCooldown: 0.87, damage: 0.9 } } },
} as const satisfies Record<string, RoleDef>
