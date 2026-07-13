export type UpgradeId = 'damage' | 'attackSpeed' | 'moveSpeed' | 'heal'

export interface PlayerStats {
  /** 全队伤害乘数 */
  damageMul: number
  /** 全队武器冷却乘数（越小攻速越快） */
  cooldownMul: number
  moveSpeed: number
  maxHp: number
}

export const UPGRADE_LABELS: Record<UpgradeId, { emoji: string; text: string }> = {
  damage: { emoji: '⚔️', text: '伤害提升' },
  attackSpeed: { emoji: '⚡', text: '攻速提升' },
  moveSpeed: { emoji: '👟', text: '移速提升' },
  heal: { emoji: '❤️', text: '生命回复' },
}

const CYCLE: readonly UpgradeId[] = ['damage', 'attackSpeed', 'moveSpeed', 'heal']

export function pickUpgrade(level: number): UpgradeId {
  return CYCLE[(((level - 2) % CYCLE.length) + CYCLE.length) % CYCLE.length]!
}

export function applyUpgrade(stats: PlayerStats, id: UpgradeId): PlayerStats {
  switch (id) {
    case 'damage':
      return { ...stats, damageMul: stats.damageMul + 0.15 }
    case 'attackSpeed':
      return { ...stats, cooldownMul: Math.max(0.4, stats.cooldownMul * 0.85) }
    case 'moveSpeed':
      return { ...stats, moveSpeed: Math.round(stats.moveSpeed * 1.08) }
    case 'heal':
      return { ...stats, maxHp: stats.maxHp + 15 }
  }
}
