import { MEMBER } from './registry'

/** 角色生效生命上限 = 基础 + 道具加成（下限保护）；角色没有等级，血量全由道具塑造 */
export function memberMaxHp(itemHpAdd: number): number {
  return Math.max(10, MEMBER.maxHp + itemHpAdd)
}
