import { query } from 'bitecs'
import { ENEMIES } from '../../data/enemies'
import { timeLimitMs } from '../../data/runs'
import { UNIT } from '../../util/units'
import type { Point } from '../../util/vec'
import type { EnemyDef, EnemyMixEntry } from '../../types/enemies'
import type { EndRule, FightDef, HoldPoint, SpawnAt, StreamRule, WavesRule } from '../../types/runs'
import type { StatMods } from '../../types/stats'
import { activeRules, enemyModsOf, mutatorRules } from '../../run/rules'
import type { ActiveRules } from '../../run/rules'
import { runDef } from '../../run/state'
import type { RunState } from '../../run/state'
import { Bounty, Call, Due, ENEMY_SET, FACTION, Faction, Order, Telegraph, Transform } from '../components'
import { callRule, foeSpec } from '../store'
import { sandboxTeamMods } from '../sandbox/knobs'
import { leaderX, leaderY } from '../utils/team'
import type { Sim } from '../sim'

/** 开打后第一次刷怪之前的空档 */
const FIRST_SPAWN_MS = 300
/** 获胜条件满足后等倒下的敌人倒完再收尾 */
const SETTLE_MS = 700

/** 一只敌人的要求：hpMul 乘在种类的血量上；elite 为真必是精英，否则有 chance 的几率；enemy 指定种类（已换好走法），不写按配比抽；at 是站位，index、count 与 phase 是它在一队里的次序与这一队围圈的起始角；bounty 为真是悬赏目标 */
export interface FoeSpec {
  readonly hpMul: number
  readonly elite?: boolean
  readonly chance?: number
  readonly enemy?: EnemyDef
  readonly at?: SpawnAt
  readonly index?: number
  readonly count?: number
  readonly phase?: number
  readonly bounty?: boolean
}

/** 一条连续刷怪与它的冷却 */
export interface StreamState {
  readonly rule: StreamRule
  cooldownMs: number
}

/** 一组一组来的进度：下一组的序号，场上清空的时刻（-1 是还没清空） */
export interface WavesState {
  readonly rule: WavesRule
  next: number
  calmAt: number
}

/** 据点的进度：第几处、这一处站了多久、队长在不在圈里 */
export interface HoldState {
  readonly rule: Extract<EndRule, { kind: 'hold' }>
  point: number
  heldMs: number
  inside: boolean
}

/** 一场战斗进行中的状态 */
export interface FightState {
  readonly def: FightDef
  /** 我方在这一场的规则，词缀已经算进去 */
  readonly rules: ActiveRules
  /** 这一场给敌人的常驻修正，词缀已经算进去 */
  readonly enemyMods: readonly StatMods[]
  readonly streams: StreamState[]
  readonly waves: WavesState[]
  /** 试炼场按旋钮刷怪的冷却；没有这条规则是 null */
  readonly knobs: { cooldownMs: number } | null
  /** 这一场的配比；不写就按地图 */
  readonly mix: EnemyMixEntry[] | null
  readonly hold: HoldState | null
  /** 开打时的击杀、金币与倒下次数，本场的进度从这里算 */
  base: { kills: number; coins: number; downs: number }
  /** 放出过几个悬赏目标 */
  bounties: number
  /** 头目倒下的时刻，-1 是还没 */
  bossDownAt: number
  /** 别的获胜条件满足的时刻，-1 是还没 */
  wonAt: number
  /** 当过队长的有人倒下了 */
  leaderFell: boolean
  /** 上一次手动换队长的真实时刻 */
  switchedAt: number
  /** 每名队员被扶了多久，按名单位置 */
  readonly rescueMs: number[]
}

function downsOf(run: RunState): number {
  return run.stats.deaths.reduce((s, n) => s + n, 0)
}

export function newFight(def: FightDef, run: RunState): FightState {
  const hold = def.ends.find((e) => e.kind === 'hold')
  return {
    def,
    rules: activeRules(runDef(run).rules, def.rules, mutatorRules(run)),
    enemyMods: enemyModsOf(run, def),
    streams: def.spawns.flatMap((rule) => (rule.kind === 'stream' ? [{ rule, cooldownMs: FIRST_SPAWN_MS }] : [])),
    waves: def.spawns.flatMap((rule) => (rule.kind === 'waves' ? [{ rule, next: 0, calmAt: -1 }] : [])),
    knobs: def.spawns.some((rule) => rule.kind === 'knobs') ? { cooldownMs: FIRST_SPAWN_MS } : null,
    mix: def.mix ? def.mix.map((m) => ({ def: ENEMIES[m.kind], weight: m.weight })) : null,
    hold: hold?.kind === 'hold' ? { rule: hold, point: 0, heldMs: 0, inside: false } : null,
    base: { kills: run.kills, coins: run.coins, downs: downsOf(run) },
    bounties: 0,
    bossDownAt: -1,
    wonAt: -1,
    leaderFell: false,
    switchedAt: -Infinity,
    rescueMs: run.roster.map(() => 0),
  }
}

/** 本场的收获从此刻起算：开波的道具规则可能已经进账 */
export function markFightBase(sim: Sim): void {
  sim.fight.base = { kills: sim.run.kills, coins: sim.run.coins, downs: downsOf(sim.run) }
}

/** 这一场给一方身体的常驻修正：我方规则写的，加上试炼场的攻速旋钮给队伍；敌人的写在这一场上，都算上词缀 */
export function fightMods(f: FightState, faction: number): StatMods[] {
  if (faction === FACTION.team) return [...f.rules.mods, ...(f.knobs ? sandboxTeamMods() : [])]
  if (faction === FACTION.enemy) return [...f.enemyMods]
  return []
}

/** 现在为什么不能手动换队长；能换是 null */
export function switchBlock(sim: Sim): string | null {
  const f = sim.fight
  if (f.rules.lock) return '这一场不能换队长'
  const left = f.rules.switchCdMs - (sim.fxMs - f.switchedAt)
  return left > 0 ? `还要 ${Math.ceil(left / 1000)} 秒才能换队长` : null
}

/** 离时限还有多久；没有时限是 Infinity */
export function timeLeftMs(sim: Sim): number {
  const limit = timeLimitMs(sim.fight.def)
  return limit === undefined ? Infinity : limit - sim.elapsedMs
}

/** 据点这一处在地图上的位置 */
export function holdSpot(sim: Sim, p: HoldPoint): Point {
  const c = sim.hooks.center(sim)
  return sim.hooks.settle(sim, { x: c.x + p.dx * UNIT, y: c.y + p.dy * UNIT })
}

/** 场上的敌方身体与预兆 */
function onField(sim: Sim): number {
  let n = 0
  for (const eid of query(sim.world, ENEMY_SET)) if (Faction.v[eid] === FACTION.enemy) n++
  return n + query(sim.world, [Telegraph]).length
}

/** 还没放出的敌人：排着的单只、没登场的一队、没来的组 */
function pendingCount(sim: Sim, bountyOnly: boolean): number {
  let n = 0
  for (const e of query(sim.world, [Due, Order])) if (!bountyOnly || foeSpec[e]?.bounty) n++
  for (const e of query(sim.world, [Due, Call])) {
    const r = callRule[e]
    if (r?.kind === 'batch' && (!bountyOnly || r.squad.bounty)) n += r.squad.count
    if (r?.kind === 'boss' && !bountyOnly) n++
  }
  for (const w of sim.fight.waves) for (const sq of w.rule.squads.slice(w.next)) if (!bountyOnly || sq.bounty) n += sq.count
  return n
}

/** 场上和还没放出的敌人都算上，这一场还剩几只 */
export function foesLeft(sim: Sim): number {
  return onField(sim) + pendingCount(sim, false)
}

/** 场上清空了：没有敌方身体、预兆和排着的单只 */
export function calm(sim: Sim): boolean {
  return onField(sim) === 0 && query(sim.world, [Due, Order]).length === 0
}

/** 连续刷怪还在刷 */
function streaming(sim: Sim): boolean {
  const f = sim.fight
  return f.knobs !== null || f.streams.some((st) => st.rule.untilMs === undefined || sim.elapsedMs < st.rule.untilMs)
}

/** 还活着或还没放出的悬赏目标 */
function bountiesLeft(sim: Sim): number {
  return query(sim.world, [Bounty]).length + pendingCount(sim, true)
}

function won(sim: Sim, e: EndRule): boolean {
  const f = sim.fight
  switch (e.kind) {
    case 'cleared':
      return !streaming(sim) && foesLeft(sim) === 0
    case 'kills':
      return sim.run.kills - f.base.kills >= e.count
    case 'bounty':
      return f.bounties > 0 && bountiesLeft(sim) === 0
    case 'hold':
      return f.hold !== null && f.hold.point >= e.points.length
    case 'coins':
      return sim.run.coins - f.base.coins >= e.count
    case 'time':
    case 'boss':
    case 'downs':
      return false
  }
}

export type Verdict = { readonly win: true } | { readonly win: false; readonly reason: string }

const WIN: Verdict = { win: true }

/** 这一场的结果，还没分出来是 null：队长倒下就输的队长倒了、倒下到数，立刻输；撑到时限时已经达成目标或时限不算输就赢；头目倒下与别的获胜条件等敌人倒完 */
export function fightVerdict(sim: Sim, timeUp: boolean): Verdict | null {
  const f = sim.fight
  if (f.rules.critical && f.leaderFell) return { win: false, reason: '队长倒下了' }
  for (const e of f.def.ends) {
    if (e.kind === 'downs' && downsOf(sim.run) - f.base.downs >= e.count) return { win: false, reason: `队员倒下了 ${e.count} 次` }
  }
  const ends = f.def.ends
  if (ends.some((e) => e.kind === 'boss') && sim.bossDown) {
    sim.bossDown = false
    f.bossDownAt = sim.fxMs
  }
  if (ends.some((e) => won(sim, e))) {
    if (f.wonAt < 0) f.wonAt = sim.fxMs
  } else {
    f.wonAt = -1
  }
  if (timeUp) {
    const lose = ends.some((e) => e.kind === 'time' && e.lose)
    return !lose || f.wonAt >= 0 || f.bossDownAt >= 0 ? WIN : { win: false, reason: '时间到了' }
  }
  if (f.bossDownAt >= 0 && sim.fxMs - f.bossDownAt >= SETTLE_MS) return WIN
  return f.wonAt >= 0 && sim.fxMs - f.wonAt >= SETTLE_MS ? WIN : null
}

/** 顶部显示的这一场目标：warn 为真的是提醒会输的 */
export function fightGoals(sim: Sim): { readonly text: string; readonly warn: boolean }[] {
  const f = sim.fight
  const out: { text: string; warn: boolean }[] = []
  for (const e of f.def.ends) {
    switch (e.kind) {
      case 'cleared': {
        const left = foesLeft(sim)
        out.push({ text: streaming(sim) ? `清场 · 还在来` : `清场 · 还剩 ${left}`, warn: false })
        break
      }
      case 'kills':
        out.push({ text: `击杀 ${Math.min(e.count, sim.run.kills - f.base.kills)}/${e.count}`, warn: false })
        break
      case 'bounty': {
        const left = bountiesLeft(sim)
        const total = f.bounties + pendingCount(sim, true)
        out.push({ text: `悬赏 ${total - left}/${total}`, warn: false })
        break
      }
      case 'hold': {
        const h = f.hold
        if (!h || h.point >= e.points.length) break
        const per = e.ms / e.points.length
        const where = e.points.length > 1 ? `第 ${h.point + 1}/${e.points.length} 处 · ` : ''
        out.push({ text: `据点 ${where}${(h.heldMs / 1000).toFixed(1)}/${(per / 1000).toFixed(1)} 秒${h.inside ? '' : ' · 回到圈里'}`, warn: !h.inside })
        break
      }
      case 'coins':
        out.push({ text: `金币 ${Math.min(e.count, Math.max(0, sim.run.coins - f.base.coins))}/${e.count}`, warn: false })
        break
      case 'downs':
        out.push({ text: e.count === 1 ? '有人倒下就输' : `倒下 ${downsOf(sim.run) - f.base.downs}/${e.count} 次就输`, warn: true })
        break
      case 'time':
        if (e.lose) out.push({ text: '时间到就输', warn: true })
        break
      case 'boss':
        break
    }
  }
  if (f.rules.critical) out.push({ text: '队长倒下就输', warn: true })
  const lives = sim.run.lives
  if (Number.isFinite(lives)) out.push({ text: lives > 0 ? `还能起来 ${lives} 次` : '倒下就再也起不来', warn: lives === 0 })
  return out
}

/** 目标不在视野里时指过去的点：据点这一处，或离队长最近的悬赏目标 */
export function goalSpot(sim: Sim): Point | null {
  const h = sim.fight.hold
  if (h && h.point < h.rule.points.length) return holdSpot(sim, h.rule.points[h.point]!)
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  let best: Point | null = null
  let bestD = Infinity
  for (const eid of query(sim.world, [Bounty, Transform])) {
    const d = sim.hooks.worldDelta(sim, lx, ly, Transform.x[eid]!, Transform.y[eid]!)
    const d2 = d.x * d.x + d.y * d.y
    if (d2 < bestD) {
      bestD = d2
      best = { x: lx + d.x, y: ly + d.y }
    }
  }
  return best
}
