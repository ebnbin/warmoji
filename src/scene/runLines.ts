import { CHARACTERS } from '../data/characters'
import { modTexts } from '../data/stats'
import { TAGS } from '../data/tags'
import type { EndRule, FightDef, FightRules, RunDef, StepDef, TeamDef } from '../types/runs'

const sec = (ms: number): string => `${+(ms / 1000).toFixed(1)} 秒`

/** 记最高分的一局按波数排名，一场就叫一波，别的叫场 */
export function fightUnit(def: RunDef): string {
  return def.record ? '波' : '场'
}

/** 怎么算赢；只管输的规则是 null */
function winText(e: EndRule): string | null {
  switch (e.kind) {
    case 'time':
      return e.lose ? null : `撑过 ${sec(e.ms)}`
    case 'boss':
      return '打倒头目'
    case 'cleared':
      return '清空所有敌人'
    case 'kills':
      return `击杀 ${e.count} 只`
    case 'bounty':
      return '击倒全部悬赏目标'
    case 'hold':
      return e.points.length > 1 ? `队长在 ${e.points.length} 处据点里依次各站满 ${sec(e.ms / e.points.length)}` : `队长在据点里累计站满 ${sec(e.ms)}`
    case 'coins':
      return `本场捡到 ${e.count} 金币`
    case 'downs':
      return null
  }
}

/** 一场怎么赢、怎么输，外加这一场的特别规则 */
export function fightGoalText(f: FightDef): string {
  const wins = f.ends.flatMap((e) => winText(e) ?? [])
  const rules: string[] = []
  for (const e of f.ends) {
    if (e.kind === 'time' && e.lose) rules.push(`限时 ${sec(e.ms)}`)
    if (e.kind === 'downs') rules.push(e.count === 1 ? '有人倒下就输' : `累计倒下 ${e.count} 次就输`)
  }
  rules.push(...ruleLines(f.rules))
  if (f.chaseLeader) rules.push('敌人都盯着队长')
  return [wins.length === 0 ? '不会结束' : wins.join('，或'), ...rules].join(' · ')
}

/** 我方规则的说法 */
function ruleLines(r: FightRules | undefined): string[] {
  if (!r) return []
  const out: string[] = []
  if (r.revive === false) out.push('倒下的队员不会自己起来')
  if (r.rescue) out.push(`队长在倒下的队员身边 ${r.rescue.radius} 格内站满 ${sec(r.rescue.ms)}能把他扶起来`)
  if (r.leader?.lock) out.push('不能换队长')
  if (r.leader?.critical) out.push('队长倒下就输')
  if (r.leader?.switchCdMs) out.push(`换队长要冷却 ${sec(r.leader.switchCdMs)}`)
  if (r.surprise) out.push('敌人现身没有预兆')
  if (r.mods) out.push(`全队${modTexts(r.mods).join('、')}`)
  return out
}

/** 一局的我方规则：每一场都照这些，外加命数、场间恢复与招募限定 */
export function runRuleLines(def: RunDef): string[] {
  const r = def.rules
  if (!r) return []
  const out = ruleLines(r)
  if (r.lives !== undefined) out.push(`全队一共只能起来 ${r.lives} 次，自己起来、被扶起来、被技能救起来都算`)
  if (r.between === 'full') out.push('每一场满血开局')
  if (r.between === 'permadeath') out.push('一场打完时还倒着的队员，这一局都回不来')
  if (r.recruit) out.push(`只能招募${r.recruit.tags.map((t) => TAGS[t].name).join('、')}角色`)
  return out
}

function stepText(s: StepDef): string {
  switch (s.kind) {
    case 'recruit':
      return `招募到 ${s.upTo} 人`
    case 'shop':
      return '商店'
    case 'fight':
      return `${s.fight.name ?? '战斗'}：${fightGoalText(s.fight)}`
  }
}

/** 一局按顺序的每一步 */
export function runStepLines(def: RunDef): string[] {
  return def.steps.map((s, i) => `${i + 1}. ${stepText(s)}`)
}

/** 预设队伍：指定的写名字，随机的写要带的标签 */
export function teamText(t: TeamDef): string {
  const slots = t.slots.map((s) => (typeof s === 'string' ? CHARACTERS[s].name : `随机一名${s.tags.map((tag) => TAGS[tag].name).join('、')}`))
  return `${slots.join(' · ')}${(t.level ?? 1) > 1 ? ` · 等级至少 ${t.level}` : ''}`
}
