import { timeLimitMs } from '../../data/runs'
import type { FightDef, StreamRule } from '../../types/runs'
import type { StatMods } from '../../types/stats'
import { FACTION } from '../components'
import { sandboxTeamMods } from '../sandbox/knobs'
import type { Sim } from '../sim'

/** 开打后第一次刷怪之前的空档 */
const FIRST_SPAWN_MS = 300
/** 头目倒下后等它倒完再收尾 */
const SETTLE_MS = 700

/** 一条连续刷怪与它的冷却 */
export interface StreamState {
  readonly rule: StreamRule
  cooldownMs: number
}

/** 一场战斗进行中的状态 */
export interface FightState {
  readonly def: FightDef
  readonly streams: StreamState[]
  /** 试炼场按旋钮刷怪的冷却；没有这条规则是 null */
  readonly knobs: { cooldownMs: number } | null
  /** 头目倒下的时刻，-1 是还没 */
  bossDownAt: number
}

export function newFight(def: FightDef): FightState {
  return {
    def,
    streams: def.spawns.flatMap((rule) => (rule.kind === 'stream' ? [{ rule, cooldownMs: FIRST_SPAWN_MS }] : [])),
    knobs: def.spawns.some((rule) => rule.kind === 'knobs') ? { cooldownMs: FIRST_SPAWN_MS } : null,
    bossDownAt: -1,
  }
}

/** 这一场给一方身体的常驻修正：试炼场的攻速旋钮给队伍 */
export function fightMods(f: FightState, faction: number): StatMods[] {
  return faction === FACTION.team && f.knobs ? sandboxTeamMods() : []
}

/** 离时限还有多久；没有时限是 Infinity */
export function timeLeftMs(sim: Sim): number {
  const limit = timeLimitMs(sim.fight.def)
  return limit === undefined ? Infinity : limit - sim.elapsedMs
}

/** 这一场赢了没有：撑到时限立刻算赢，头目倒下后等它倒完 */
export function fightWon(sim: Sim, timeUp: boolean): boolean {
  if (timeUp) return true
  const f = sim.fight
  if (!f.def.ends.some((e) => e.kind === 'boss')) return false
  if (sim.bossDown) {
    sim.bossDown = false
    f.bossDownAt = sim.fxMs
  }
  return f.bossDownAt >= 0 && sim.fxMs - f.bossDownAt >= SETTLE_MS
}
