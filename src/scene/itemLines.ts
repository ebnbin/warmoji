import { modLines, modTexts } from '../data/stats'
import type { ModLine } from '../data/stats'
import { condLine, grid, pct, SHAPE_LABEL, sec } from './statLines'
import type { Cond } from '../types/abilityDefs'
import type { GearCount, GearWhen, ItemDef, Trait } from '../types/items'

export const TRAIT_LABEL: Record<Trait, string> = {
  ...SHAPE_LABEL,
  melee: '近战',
  ranged: '远程',
  area: '范围',
  dot: '持续伤害',
  summon: '召唤',
  heal: '治疗',
}

/** 条件：常见的几种按道具的口吻说，其余照能力的说法 */
function condText(c: Cond): string {
  if (c.kind === 'afterSkill' && c.who === 'leader') return `队长放主动技能后 ${sec(c.ms)} 内`
  if (c.kind === 'all' || c.kind === 'any' || c.kind === 'not' || c.who !== 'self') return `${condLine(c)}时`
  switch (c.kind) {
    case 'still':
      return '站着不动时'
    case 'leader':
      return '当队长时'
    case 'follower':
      return '不当队长时'
    case 'hpBelow':
      return `生命低于 ${pct(c.ratio)} 时`
    case 'noFoesNear':
      return `身边 ${grid(c.radius)} 内没有敌人时`
    case 'afterSkill':
      return `放主动技能后 ${sec(c.ms)} 内`
    case 'nearLeader':
      return `离队长 ${grid(c.radius)} 以内时`
    case 'newLeader':
      return `刚当上队长的 ${sec(c.ms)} 内`
    case 'alone':
      return '场上只剩自己站着时'
    default:
      return `${condLine(c)}时`
  }
}

function countText(c: GearCount): string {
  switch (c.kind) {
    case 'foesNear':
      return `身边 ${grid(c.radius)} 内每有一个敌人`
    case 'waveTime':
      return `本波每过 ${sec(c.everyMs)}`
    case 'unhurt':
      return `每 ${sec(c.everyMs)} 没受伤`
    case 'alliesDown':
      return '场上每有一名队员倒下'
    case 'alliesUp':
      return '场上每多一名站着的队友'
  }
}

function whenLine(w: GearWhen): string {
  if ('count' in w) return `${countText(w.count)}：${modTexts(w.stats).join('，')}，最多 ${w.max} 层${w.count.kind === 'unhurt' ? '，受伤清零' : ''}`
  return `${condText(w.if)}：${modTexts(w.stats).join('，')}`
}

/** 道具效果逐条：直接的属性涨跌带好坏，条件属性只是说明 */
export function itemEffects(def: ItemDef): ModLine[] {
  const note = (text: string): ModLine => ({ text, good: null })
  return [
    ...(def.stats ? modLines(def.stats) : []),
    ...(def.when ?? []).map((w) => note(whenLine(w))),
  ]
}

/** 道具效果逐条的文字 */
export function itemLines(def: ItemDef): string[] {
  return itemEffects(def).map((l) => l.text)
}
