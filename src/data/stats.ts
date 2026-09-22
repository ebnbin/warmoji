import { MEMBER } from './characters'

export function memberMaxHp(itemHpAdd: number, hpMul = 1): number {
  return Math.max(10, Math.round((MEMBER.maxHp + itemHpAdd) * hpMul))
}
