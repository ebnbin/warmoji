import { CHARACTERS } from '../data/characters'
import { TAGS } from '../data/tags'
import type { EndRule, FightDef, RunDef, StepDef, TeamDef } from '../types/runs'

const sec = (ms: number): string => `${Math.round(ms / 1000)} 秒`

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
  if (f.noRevive) rules.push('倒下的队员不会自己起来')
  if (f.chaseLeader) rules.push('敌人都盯着队长')
  return [wins.length === 0 ? '不会结束' : wins.join('，或'), ...rules].join(' · ')
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
