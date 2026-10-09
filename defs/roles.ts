import type { RoleDef } from '../legacy/types/roles'

/** 远程一类的本能：和敌人保持三格，被贴近就后撤 */
const KEEP_AWAY = [{ do: { kind: 'kite', distance: 3 } }] as const

export const ROLES = {
  tank: {
    name: '坦克',
    stats: { add: { armor: 6, maxHp: 40 }, mul: { damage: 0.9 } },
    instincts: [{ if: { kind: 'within', who: 'target', radius: 5 }, do: { kind: 'guard', reach: 3 } }],
  },
  bruiser: { name: '斗士', stats: { add: { armor: 3, lifesteal: 0.05 } }, instincts: [{ if: { kind: 'within', who: 'target', radius: 4 }, do: { kind: 'engage' } }] },
  assassin: {
    name: '刺客',
    stats: { add: { dodge: 0.15, maxHp: -20 }, mul: { critDamage: 1.25, bossDamage: 1.15 } },
    instincts: [{ do: { kind: 'dive', radius: 6, ratio: 0.4 } }],
  },
  ranged: { name: '远程', stats: {}, instincts: KEEP_AWAY },
  area: { name: '范围', stats: { add: { maxHp: -15 }, mul: { areaDamage: 1.15 } }, instincts: KEEP_AWAY },
  summoner: { name: '召唤', stats: { add: { maxHp: -10 }, mul: { summonDamage: 1.15 } }, instincts: KEEP_AWAY },
  support: { name: '辅助', stats: { mul: { healing: 1.15, skillCooldown: 0.91, damage: 0.9 } }, instincts: [{ do: { kind: 'tend', ratio: 0.8 } }, ...KEEP_AWAY] },
  controller: { name: '控制', stats: { mul: { skillCooldown: 0.87, damage: 0.9 } }, instincts: KEEP_AWAY },
} as const satisfies Record<string, RoleDef>
