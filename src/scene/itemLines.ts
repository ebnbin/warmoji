import { modLines, modTexts } from '../data/stats'
import type { ModLine } from '../data/stats'
import { abilityStatLines, condLine, effectLine, grid, pct, SHAPE_LABEL, sec } from './statLines'
import type { Cond, Effect } from '../types/abilityDefs'
import type { GearCount, GearGrow, GearWhen, ItemDef, ItemReaction, Trait } from '../types/items'

export const TRAIT_LABEL: Record<Trait, string> = {
  ...SHAPE_LABEL,
  melee: '近战',
  ranged: '远程',
  area: '范围',
  dot: '持续伤害',
  summon: '召唤',
  heal: '治疗',
}

/** 持有者的条件：常见的几种按道具的口吻说，其余照能力的说法 */
function condText(c: Cond): string {
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
  }
}

function whenLine(w: GearWhen): string {
  if ('count' in w) return `${countText(w.count)}：${modTexts(w.stats).join('，')}，最多 ${w.max} 层${w.count.kind === 'unhurt' ? '，受伤清零' : ''}`
  return `${condText(w.if)}：${modTexts(w.stats).join('，')}`
}

function onText(t: ItemReaction): string {
  switch (t.on) {
    case 'hit':
      return '命中时'
    case 'crit':
      return '暴击时'
    case 'kill':
      return '击杀时'
    case 'hurt':
      return '受伤时'
    case 'dodge':
      return '闪避时'
    case 'skill':
      return '放主动技能时'
    case 'wave':
      return '每波开始时'
    case 'lowHp':
      return `每条命第一次生命低于 ${pct(t.ratio)} 时`
    case 'lethal':
      return '每条命第一次受到致命伤害时不倒下，留 1 生命'
  }
}

/** 爆开写明在哪、打多少；落在尸体处的写明从哪来，改受伤倍率的写明改谁；其余效果照常 */
function triggerEffect(t: ItemReaction, e: Effect): string {
  if (e.kind === 'blast') {
    const where = t.to === 'self' ? '在身边' : t.to === 'spot' ? '在尸体处' : '在目标处'
    const hurt = t.damage === undefined ? `波及这一下 ${pct(e.ratio)} 的伤害` : `造成 ${Math.round(t.damage * e.ratio)} 伤害`
    return `${where}爆开 ${grid(e.radius)}，${hurt}`
  }
  const line = effectLine(e, t.to === 'self')
  if (t.to === 'spot') return `从尸体处${line}`
  return e.kind === 'guard' ? `让${t.to === 'self' ? '自己' : '目标'}${line}` : line
}

function triggerLine(t: ItemReaction): string {
  const chance = 'chance' in t && t.chance !== undefined ? ` ${pct(t.chance)} 几率` : ''
  const cond = t.if ? `、${condText(t.if)}` : ''
  const who = t.to === 'other' && (t.on === 'dodge' || t.on === 'hurt') ? '对出手者' : ''
  return `${onText(t)}${cond}${chance}${t.on === 'lethal' ? '，' : '：'}${who}${t.effects.map((e) => triggerEffect(t, e)).join('，')}`
}

function growLine(g: GearGrow): string {
  return `${g.each === 'wave' ? '每波结束' : `这名角色每击杀 ${g.count} 个敌人`}：${modTexts(g.stats).join('，')}，本局永久`
}

/** 道具效果逐条：直接的属性涨跌带好坏，条件、触发、装置与成长只是说明 */
export function itemEffects(def: ItemDef): ModLine[] {
  const note = (text: string): ModLine => ({ text, good: null })
  return [
    ...(def.stats ? modLines(def.stats) : []),
    ...(def.when ?? []).map((w) => note(whenLine(w))),
    ...(def.reactions ?? []).map((t) => note(triggerLine(t))),
    ...(def.ability ? [note(`自动出手：${abilityStatLines(def.ability).join('，').replaceAll(' · ', '，')}`)] : []),
    ...(def.grow ? [note(growLine(def.grow))] : []),
  ]
}

/** 道具效果逐条的文字 */
export function itemLines(def: ItemDef): string[] {
  return itemEffects(def).map((l) => l.text)
}
