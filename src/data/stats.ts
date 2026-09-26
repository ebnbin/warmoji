import { MEMBER } from './characters'

export function memberMaxHp(itemHpAdd: number): number {
  return Math.max(10, Math.round(MEMBER.maxHp + itemHpAdd))
}
