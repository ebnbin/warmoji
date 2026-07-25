import { MEMBER } from './characters'

/** 角色生效生命上限 =（基础 + 道具加成）× 队长血量乘数（下限保护）。
 * 血量基数由队员层定（MEMBER.maxHp + 道具），队长只提供一个乘数（hpMul，缺省 1） */
export function memberMaxHp(itemHpAdd: number, hpMul = 1): number {
  return Math.max(10, Math.round((MEMBER.maxHp + itemHpAdd) * hpMul))
}
