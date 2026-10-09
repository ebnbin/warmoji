import { MUTATORS } from '../data/mutators'
import { fightsOf } from '../data/runs'
import type { FightDef, FightRules, MutatorDef, MutatorRules, RunDef, RunRules } from '../types/runs'
import type { StatMods } from '../types/stats'
import { runDef } from './state'
import type { RunState } from './state'

/** 一场生效的我方规则：一场写的盖过一局写的，词缀再往难里改，修正层层叠加；vision 为 Infinity 是看得见全场，relay 为 0 是不轮换 */
export interface ActiveRules {
  readonly rescue: FightRules['rescue']
  readonly lock: boolean
  readonly critical: boolean
  readonly switchCdMs: number
  readonly surprise: boolean
  readonly skills: boolean
  readonly vision: number
  readonly harmless: boolean
  readonly relay: number
  readonly mods: readonly StatMods[]
}

const present = <T>(xs: readonly (T | undefined)[]): T[] => xs.flatMap((x) => (x === undefined ? [] : [x]))

/** 词缀盖上去：它写的开关只会更难，视野取更小的，修正叠加 */
function harden(a: ActiveRules, m: MutatorRules): ActiveRules {
  return {
    ...a,
    lock: m.leader?.lock ?? a.lock,
    critical: m.leader?.critical ?? a.critical,
    surprise: m.surprise ?? a.surprise,
    skills: m.skills ?? a.skills,
    vision: Math.min(a.vision, m.vision ?? Infinity),
    mods: m.mods ? [...a.mods, m.mods] : a.mods,
  }
}

export function activeRules(run: RunRules | undefined, fight: FightRules | undefined, mutators: readonly MutatorRules[] = []): ActiveRules {
  const base: ActiveRules = {
    rescue: fight?.rescue ?? run?.rescue,
    lock: fight?.leader?.lock ?? run?.leader?.lock ?? false,
    critical: fight?.leader?.critical ?? run?.leader?.critical ?? false,
    switchCdMs: fight?.leader?.switchCdMs ?? run?.leader?.switchCdMs ?? 0,
    surprise: fight?.surprise ?? run?.surprise ?? false,
    skills: fight?.skills ?? run?.skills ?? true,
    vision: fight?.vision ?? run?.vision ?? Infinity,
    harmless: fight?.harmless ?? run?.harmless ?? false,
    relay: fight?.relay ?? run?.relay ?? 0,
    mods: present([run?.mods, fight?.mods]),
  }
  return mutators.reduce(harden, base)
}

/** 词缀对这一关有用：给两边的修正总有用，改规则的要至少有一场因此变了 */
export function mutatorFits(def: RunDef, m: MutatorDef): boolean {
  if (m.enemyMods || m.rules?.mods) return true
  const rules = m.rules
  if (!rules) return false
  return fightsOf(def).some((f) => {
    const before = activeRules(def.rules, f.rules)
    const after = harden(before, rules)
    return (['lock', 'critical', 'surprise', 'skills', 'vision'] as const).some((k) => after[k] !== before[k])
  })
}

/** 这一局选了的词缀改的我方规则 */
export function mutatorRules(run: RunState): MutatorRules[] {
  return present(run.mutators.map((id) => MUTATORS[id].rules))
}

/** 这一场给敌人的常驻修正：这一场写的加上词缀的 */
export function enemyModsOf(run: RunState, fight: FightDef): StatMods[] {
  return present([fight.enemyMods, ...run.mutators.map((id) => MUTATORS[id].enemyMods)])
}

/** 一局给队伍的常驻修正：一局的规则与词缀写的，商店与暂停页也算 */
export function runTeamMods(run: RunState): StatMods[] {
  return present([runDef(run).rules?.mods, ...run.mutators.map((id) => MUTATORS[id].rules?.mods)])
}
