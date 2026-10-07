import { CHARACTERS } from '../data/characters'
import { ENEMIES } from '../data/enemies'
import { HAZARD_KILLS, HAZARD_NAMES } from '../data/maps'
import { isLose } from '../data/ends'
import { signalName } from '../data/signals'
import { modTexts } from '../data/stats'
import { TAGS } from '../data/tags'
import { WAVE } from '../data/waves'
import type { EndRule, FightDef, FightReward, FightRules, MutatorDef, PhaseDef, RunDef, StarRule, StepDef, TeamDef } from '../types/runs'

const sec = (ms: number): string => `${+(ms / 1000).toFixed(1)} 秒`

/** 一条结束规则的说法：达成条件说怎么算赢，失败条件说怎么算输 */
export function endText(e: EndRule): string {
  switch (e.kind) {
    case 'time':
      return e.lose ? `限时 ${sec(e.ms)}` : `撑过 ${sec(e.ms)}`
    case 'boss':
      return '打倒头目'
    case 'bossHp':
      return `把头目打到 ${Math.round(e.below * 100)}% 血`
    case 'cleared':
      return '清空所有敌人'
    case 'kills':
      return e.by ? `让 ${e.count} 只敌人被${HAZARD_KILLS[e.by]}` : `击杀 ${e.count} 只${e.enemy ? ENEMIES[e.enemy].name : ''}`
    case 'bounty':
      return '击倒全部悬赏目标'
    case 'hold': {
      const marks = new Set(e.points.map((p) => ('mark' in p ? p.mark : null)))
      const [only] = marks
      const where = marks.size === 1 && typeof only === 'string' ? signalName('marks', only) : '据点'
      return e.points.length > 1 ? `队长在 ${e.points.length} 处${where}里依次各站满 ${sec(e.ms / e.points.length)}` : `队长在${where}累计站满 ${sec(e.ms)}`
    }
    case 'coins':
      return `捡到 ${e.count} 金币`
    case 'downs':
      return e.count === 1 ? '有人倒下就输' : `累计倒下 ${e.count} 次就输`
    case 'event': {
      const name = signalName('events', e.event)
      if (e.lose) return e.count === 1 ? `${name}就输` : `${name} ×${e.count} 就输`
      return e.count === 1 ? `等到${name}` : `${name} ×${e.count}`
    }
    case 'gauge': {
      const name = signalName('gauges', e.gauge)
      const pct = (v: number): string => `${Math.round(v * 100)}%`
      if (e.above !== undefined) return e.lose ? `${name}到 ${pct(e.above)} 就输` : `${name}升到 ${pct(e.above)}`
      return e.lose ? `${name}低于 ${pct(e.below ?? 0)} 就输` : `${name}降到 ${pct(e.below ?? 0)}`
    }
    case 'visit':
      return `到访${e.count === undefined ? '每一处' : ` ${e.count} 处`}${signalName('marks', e.mark)}，每处站 ${sec(e.ms)}`
    case 'leak':
      return `朝${signalName('marks', e.mark)}行进的敌人放过去 ${e.count} 只就输`
  }
}

/** 过关奖励的说法；没有奖励是 null */
export function rewardText(r: FightReward | undefined): string | null {
  const parts = [r?.coins ? `金币 +${r.coins}` : '', r?.heal ? '全队回满血' : ''].filter(Boolean)
  return parts.length > 0 ? `过关奖励 ${parts.join('、')}` : null
}

/** 一个阶段怎么达成、怎么输 */
function phaseGoalText(p: PhaseDef): string {
  const wins = p.ends.flatMap((e) => (isLose(e) ? [] : [endText(e)]))
  const lose = p.ends.flatMap((e) => (isLose(e) ? [endText(e)] : []))
  return [wins.length === 0 ? '不会结束' : wins.join(p.need === 'all' ? '，并且' : '，或'), ...lose].join(' · ')
}

/** 一场自己的规则：我方规则、敌人都盯着队长、过关奖励 */
export function fightRuleLines(f: FightDef): string[] {
  const out = ruleLines(f.rules)
  if (f.enemyMods) out.push(`敌人${modTexts(f.enemyMods).join('、')}`)
  if (f.chaseLeader) out.push('敌人都盯着队长')
  const reward = rewardText(f.reward)
  if (reward) out.push(reward)
  return out
}

/** 一场怎么赢、怎么输：分阶段的按先后连起来，外加这一场的特别规则与过关奖励 */
export function fightGoalText(f: FightDef): string {
  return [f.phases.map(phaseGoalText).join(' → '), ...fightRuleLines(f)].join(' · ')
}

/** 一场的各个阶段一行一个：开场横幅的标题，怎么达成、怎么输 */
export function phaseLines(f: FightDef): string[] {
  return f.phases.map((p) => `${p.intro ? `${p.intro.title}：` : ''}${phaseGoalText(p)}`)
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
  if (r.skills === false) out.push('不能放主动技能')
  if (r.vision !== undefined) out.push(`只看得见队长身边 ${r.vision} 格`)
  if (r.harmless) out.push('我方伤不了敌人，击退与控制照常，敌人只能死于地图上的危害')
  if (r.relay !== undefined) out.push(`每 ${sec(r.relay)}自动换下一名队员当队长`)
  if (r.mods) out.push(`全队${modTexts(r.mods).join('、')}`)
  return out
}

/** 一局的我方规则：每一场都照这些，外加命数、场间恢复、等级上限与全队升级 */
export function runRuleLines(def: RunDef): string[] {
  const r = def.rules ?? {}
  const out = ruleLines(r)
  if (r.lives !== undefined) out.push(`全队一共只能起来 ${r.lives} 次，自己起来、被扶起来、被技能救起来都算`)
  if (r.between === 'rest') out.push(`场与场之间，每人回复 ${Math.round(WAVE.restRatio * 100)}% 损失的生命，倒下的也起来`)
  if (r.between === 'full') out.push('每一场满血开局')
  if (r.between === 'permadeath') out.push('一场打完时还倒着的队员，这一局都回不来')
  if (r.maxLevel !== undefined) out.push(r.maxLevel === 1 ? '队员不能升级' : `队员最高只能升到 ${r.maxLevel} 级`)
  const t = def.teamLevel
  if (t) out.push(`击杀攒全队经验，最高 ${t.maxLevel} 级；每升一级掉一个升级道具，队长走过去捡起来，招一名新队员或给一名队员升一级；进商店前没捡的替你捡起；买道具不再涨角色经验`)
  return out
}

/** 一条星级条件的说法 */
export function starText(s: StarRule): string {
  switch (s.kind) {
    case 'downs':
      return s.count === 0 ? '没有队员倒下' : `队员倒下不超过 ${s.count} 次`
    case 'time':
      return `${sec(s.ms)}内打完`
    case 'switches':
      return s.count === 0 ? '不换队长' : `换队长不超过 ${s.count} 次`
    case 'skills':
      return s.count === 0 ? '不放主动技能' : `主动技能最多放 ${s.count} 次`
    case 'kills':
      return `击杀至少 ${s.count} 只`
    case 'hazard':
      return s.damage === 0 ? `没被${HAZARD_NAMES[s.by]}伤到` : `受到的${HAZARD_NAMES[s.by]}伤害不超过 ${s.damage}`
  }
}

/** 一个词缀改了什么 */
export function mutatorText(m: MutatorDef): string {
  return [...ruleLines(m.rules), ...(m.enemyMods ? [`敌人${modTexts(m.enemyMods).join('、')}`] : [])].join('，')
}

/** 一步的说法 */
export function stepText(s: StepDef): string {
  switch (s.kind) {
    case 'recruit':
      return s.upTo === 1 ? '招募首发' : `招募到 ${s.upTo} 人`
    case 'shop':
      return '商店'
    case 'fight':
      return `${s.fight.name}：${fightGoalText(s.fight)}`
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
