import { modTexts } from '../data/stats'
import { SHAPE_LABEL } from './statLines'
import type { ItemDef, Trait } from '../types/items'

export const TRAIT_LABEL: Record<Trait, string> = {
  ...SHAPE_LABEL,
  melee: '近战',
  ranged: '远程',
  area: '范围',
  dot: '持续伤害',
  summon: '召唤',
  heal: '治疗',
}

/** 道具效果逐条的文字 */
export function itemLines(def: ItemDef): string[] {
  return def.stats ? modTexts(def.stats) : []
}
