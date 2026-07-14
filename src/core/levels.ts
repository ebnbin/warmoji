import { LEVELS, MEMBER } from './config'

// 角色等级（1..LEVELS.max）：v1 为通用数值脊柱（伤害/生命随级增长），
// 里程碑特色能力（如 3/6 级解锁）留待后续按角色设计。

export function levelDamageMul(level: number): number {
  return 1 + LEVELS.damagePerLevel * (level - 1)
}

export function levelHpMul(level: number): number {
  return 1 + LEVELS.hpPerLevel * (level - 1)
}

/** 角色生效生命上限 = 基础 × 等级倍率 + 道具加成（下限保护） */
export function memberMaxHp(level: number, itemHpAdd: number): number {
  return Math.max(10, Math.round(MEMBER.maxHp * levelHpMul(level)) + itemHpAdd)
}
