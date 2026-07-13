import { KNIFE } from './config'

export type UpgradeId = 'knife' | 'attackSpeed' | 'moveSpeed' | 'heal'

export interface PlayerStats {
  knives: number
  attackCooldownMs: number
  moveSpeed: number
  maxHp: number
}

export const UPGRADE_LABELS: Record<UpgradeId, string> = {
  knife: '🔪 +1 飞刀',
  attackSpeed: '⚡ 攻速提升',
  moveSpeed: '👟 移速提升',
  heal: '❤️ 生命回复',
}

const CYCLE: readonly UpgradeId[] = ['knife', 'attackSpeed', 'moveSpeed', 'heal']

export function pickUpgrade(level: number, stats: PlayerStats): UpgradeId {
  const id = CYCLE[(((level - 2) % CYCLE.length) + CYCLE.length) % CYCLE.length]!
  if (id === 'knife' && stats.knives >= KNIFE.maxCount) return 'attackSpeed'
  return id
}

export function applyUpgrade(stats: PlayerStats, id: UpgradeId): PlayerStats {
  switch (id) {
    case 'knife':
      return { ...stats, knives: Math.min(KNIFE.maxCount, stats.knives + 1) }
    case 'attackSpeed':
      return { ...stats, attackCooldownMs: Math.max(300, Math.round(stats.attackCooldownMs * 0.85)) }
    case 'moveSpeed':
      return { ...stats, moveSpeed: Math.round(stats.moveSpeed * 1.08) }
    case 'heal':
      return { ...stats, maxHp: stats.maxHp + 15 }
  }
}
