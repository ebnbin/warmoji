import type { MutatorDef } from '../legacy/types/runs'

/** 冒险与实验开局前可以自选叠加的词缀，按热度从低到高 */
export const MUTATORS = {
  sudden: { emoji: '1f977', name: '突袭', heat: 1, rules: { surprise: true } },
  swift: { emoji: '1f4a8', name: '迅捷', heat: 1, enemyMods: { mul: { moveSpeed: 1.25 } } },
  pinned: { emoji: '1f4cc', name: '钉死', heat: 1, rules: { leader: { lock: true } } },
  fierce: { emoji: '1f4a2', name: '凶狠', heat: 2, enemyMods: { mul: { damage: 1.4 } } },
  sturdy: { emoji: '1f9f1', name: '坚韧', heat: 2, enemyMods: { mul: { maxHp: 1.5 } } },
  fragile: { emoji: '1f494', name: '脆弱', heat: 2, rules: { mods: { mul: { maxHp: 0.6 } } } },
  silence: { emoji: '1f507', name: '封印', heat: 2, rules: { skills: false } },
  night: { emoji: '1f311', name: '永夜', heat: 2, rules: { vision: 4 } },
  king: { emoji: '1f451', name: '孤王', heat: 2, rules: { leader: { critical: true } } },
} as const satisfies Record<string, MutatorDef>
