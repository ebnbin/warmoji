import { query, removeEntity } from 'bitecs'
import { ENEMIES } from '../../data/enemies'
import { HAZARD_KILLS } from '../../data/maps'
import { timeLimitMs } from '../../data/runs'
import { UNIT } from '../../util/units'
import type { Point } from '../../util/vec'
import type { Polarity } from '../../types/battlefield'
import type { EnemyDef, EnemyKind, EnemyMixEntry } from '../../types/enemies'
import type { Hazard } from '../../types/maps'
import type { BatchRule, CueRule, EndRule, FightDef, GroupTraits, HoldPoint, Loot, MixEntry, PhaseDef, SpawnAt, Squad, StreamRule, WavesRule } from '../../types/runs'
import { signalName } from '../../data/signals'
import type { MapEvent } from '../../data/signals'
import { isLose } from '../../data/ends'
import type { StatMods } from '../../types/stats'
import { activeRules, enemyModsOf, mutatorRules } from '../../run/rules'
import type { ActiveRules } from '../../run/rules'
import { runDef } from '../../run/state'
import type { RunState } from '../../run/state'
import { Boss, Bounty, Call, Due, Enemy, ENEMY_SET, FACTION, Faction, Hp, Order, Telegraph, Transform } from '../components'
import { scheduleCall } from '../entities/schedule'
import { callSpec, foeSpec } from '../store'
import { sandboxTeamMods } from '../sandbox/knobs'
import { leaderX, leaderY } from '../utils/team'
import type { Sim } from '../sim'

/** 开打后第一次刷怪之前的空档 */
const FIRST_SPAWN_MS = 300
/** 获胜条件满足后等倒下的敌人倒完再收尾 */
const SETTLE_MS = 700

/** 一只敌人的要求：hpMul 乘在种类的血量上；elite 为真必是精英，否则有 chance 的几率；enemy 指定种类（已换好走法），不写就按 mix 抽，再不写按这一阶段的配比；at 是站位，index、count 与 phase 是它在一队里的次序与这一队围圈的起始角；bounty 为真是悬赏目标；stats、huntLeader、loot 与 carry 是这一批敌人的特征 */
export interface FoeSpec {
  readonly hpMul: number
  readonly elite?: boolean
  readonly chance?: number
  readonly enemy?: EnemyDef
  readonly mix?: readonly EnemyMixEntry[]
  readonly at?: SpawnAt
  readonly index?: number
  readonly count?: number
  readonly phase?: number
  readonly bounty?: boolean
  readonly stats?: StatMods
  readonly huntLeader?: boolean
  readonly loot?: Loot
  readonly carry?: Polarity
}

/** 到时登场的一队敌人；round 是一再放出的一队这是第几次，从 0 算 */
export interface CallSpec {
  readonly rule: BatchRule
  readonly round: number
}

/** 配比换成敌人的定义 */
function mixOf(rows: readonly MixEntry[]): EnemyMixEntry[] {
  return rows.map((m) => ({ def: ENEMIES[m.kind], weight: m.weight }))
}

/** 一批敌人的特征折成每只的要求：指定的种类换好走法，配比换成定义 */
export function foeOf(t: GroupTraits): Omit<FoeSpec, 'hpMul'> {
  const raw = t.enemy ? ENEMIES[t.enemy] : undefined
  return {
    enemy: raw && t.drive ? { ...raw, drive: t.drive } : raw,
    mix: t.mix ? mixOf(t.mix) : undefined,
    chance: t.eliteChance,
    stats: t.stats,
    huntLeader: t.huntLeader,
    loot: t.loot,
    carry: t.carry,
  }
}

/** 一条连续刷怪：冷却、已经放出几只，与折好的每只的要求 */
export interface StreamState {
  readonly rule: StreamRule
  readonly foe: Omit<FoeSpec, 'hpMul'>
  cooldownMs: number
  spawned: number
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

/** 一条结束规则自己的进度，按这一阶段结束规则的次序：到访的已经到过哪几处、正站在哪一处（-1 是不在圈里）、站了多久；漏怪的漏过几只 */
export interface GoalState {
  readonly done: Set<number>
  at: number
  ms: number
  leaked: number
}

/** 按地图事件放出的一队：等的是哪件事、这件事已经数到第几次、放过几队 */
export interface TriggerState {
  readonly rule: BatchRule
  readonly on: MapEvent
  seen: number
  fired: number
}

/** 对地图的一条指令：下一次在这一阶段的第几毫秒、做过几次 */
export interface CueState {
  readonly rule: CueRule
  next: number
  done: number
}

/** 一场战斗进行中的状态：刷怪、目标与进度都是当前阶段的 */
export interface FightState {
  readonly def: FightDef
  /** 我方在这一场的规则，词缀已经算进去 */
  readonly rules: ActiveRules
  /** 这一场给敌人的常驻修正，词缀已经算进去 */
  readonly enemyMods: readonly StatMods[]
  /** 第几个阶段 */
  phase: number
  /** 这一阶段开始的时刻，阶段里的时刻都从这里算 */
  phaseAt: number
  streams: StreamState[]
  waves: WavesState[]
  /** 沙盒按旋钮刷怪的冷却；不是沙盒是 null */
  knobs: { cooldownMs: number } | null
  /** 这一阶段的配比；不写就按地图 */
  mix: EnemyMixEntry[] | null
  hold: HoldState | null
  /** 这一阶段每条结束规则自己的进度 */
  goals: GoalState[]
  triggers: TriggerState[]
  cues: CueState[]
  /** 这一阶段开始时的击杀、各种敌人的击杀、金币、倒下次数与地图事件，进度从这里算 */
  base: PhaseBase
  /** 放出过几个悬赏目标 */
  bounties: number
  /** 别的获胜条件满足的时刻，-1 是还没 */
  wonAt: number
  /** 当过队长的有人倒下了 */
  leaderFell: boolean
  /** 上一次手动换队长的真实时刻 */
  switchedAt: number
  /** 每名队员被扶了多久，按名单位置 */
  readonly rescueMs: number[]
  /** 这一场地图上各种事件发生过几次 */
  readonly events: Partial<Record<MapEvent, number>>
  /** 上一次轮换队长的时刻 */
  relayAt: number
}

/** 阶段开始时的计数 */
interface PhaseBase {
  readonly kills: number
  readonly enemyKills: Partial<Record<EnemyKind, number>>
  readonly hazardKills: Partial<Record<Hazard, number>>
  readonly coins: number
  readonly downs: number
  readonly events: Partial<Record<MapEvent, number>>
}

function downsOf(run: RunState): number {
  return run.stats.deaths.reduce((s, n) => s + n, 0)
}

function baseOf(run: RunState, events: Partial<Record<MapEvent, number>>): PhaseBase {
  return { kills: run.kills, enemyKills: { ...run.stats.enemyKills }, hazardKills: { ...run.stats.hazardKills }, coins: run.coins, downs: downsOf(run), events: { ...events } }
}

/** 阶段自己的状态：刷怪、配比、据点、各条结束规则的进度与对地图的指令换成这一阶段的，进度从 at 这一刻、run 此刻的计数与这一场此刻的地图事件算起 */
function phaseState(
  def: FightDef,
  phase: number,
  run: RunState,
  at: number,
  events: Partial<Record<MapEvent, number>>,
): Pick<FightState, 'phase' | 'phaseAt' | 'streams' | 'waves' | 'knobs' | 'mix' | 'hold' | 'goals' | 'triggers' | 'cues' | 'base' | 'bounties' | 'wonAt'> {
  const p = def.phases[phase]!
  const hold = p.ends.find((e) => e.kind === 'hold')
  return {
    phase,
    phaseAt: at,
    streams: p.spawns.flatMap((rule) => (rule.kind === 'stream' ? [{ rule, foe: foeOf(rule), cooldownMs: FIRST_SPAWN_MS, spawned: 0 }] : [])),
    waves: p.spawns.flatMap((rule) => (rule.kind === 'waves' ? [{ rule, next: 0, calmAt: -1 }] : [])),
    knobs: runDef(run).team === 'knobs' ? { cooldownMs: FIRST_SPAWN_MS } : null,
    mix: p.mix ? mixOf(p.mix) : null,
    hold: hold?.kind === 'hold' ? { rule: hold, point: 0, heldMs: 0, inside: false } : null,
    goals: p.ends.map(() => ({ done: new Set<number>(), at: -1, ms: 0, leaked: 0 })),
    triggers: p.spawns.flatMap((rule) => (rule.kind === 'batch' && rule.on !== undefined ? [{ rule, on: rule.on, seen: events[rule.on] ?? 0, fired: 0 }] : [])),
    cues: (p.cues ?? []).map((rule) => ({ rule, next: rule.atMs, done: 0 })),
    base: baseOf(run, events),
    bounties: 0,
    wonAt: -1,
  }
}

export function newFight(def: FightDef, run: RunState): FightState {
  return {
    def,
    rules: activeRules(runDef(run).rules, def.rules, mutatorRules(run)),
    enemyMods: enemyModsOf(run, def),
    ...phaseState(def, 0, run, 0, {}),
    leaderFell: false,
    switchedAt: -Infinity,
    rescueMs: run.roster.map(() => 0),
    events: {},
    relayAt: 0,
  }
}

/** 当前阶段 */
export function phaseOf(f: FightState): PhaseDef {
  return f.def.phases[f.phase]!
}

/** 当前阶段开始了多久 */
export function phaseMs(sim: Sim): number {
  return sim.elapsedMs - sim.fight.phaseAt
}

/** 这一阶段开始：定时登场的排好（按地图事件放出的等事件来），打出这一阶段的横幅 */
export function startPhase(sim: Sim): void {
  const at = sim.fight.phaseAt
  const p = phaseOf(sim.fight)
  for (const rule of p.spawns) if (rule.kind === 'batch' && rule.on === undefined) scheduleCall(sim, at + rule.atMs, rule)
  if (p.intro) sim.out.banners.push(p.intro)
}

/** 已经是这一场的最后一个阶段 */
export function lastPhase(f: FightState): boolean {
  return f.phase === f.def.phases.length - 1
}

/** 这一阶段达成，不停顿地接上下一阶段：还没登场的一队不再来，场上的留着 */
export function nextPhase(sim: Sim): void {
  for (const e of [...query(sim.world, [Due, Call])]) {
    callSpec[e] = undefined
    removeEntity(sim.world, e)
  }
  Object.assign(sim.fight, phaseState(sim.fight.def, sim.fight.phase + 1, sim.run, sim.elapsedMs, sim.fight.events))
  startPhase(sim)
}

/** 这一阶段的收获从此刻起算：开波的道具规则可能已经进账 */
export function markFightBase(sim: Sim): void {
  sim.fight.base = baseOf(sim.run, sim.fight.events)
}

/** 这一场给一方身体的常驻修正：我方规则写的，加上沙盒的攻速旋钮给队伍；敌人的写在这一场上，都算上词缀 */
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

/** 离这一阶段的时限还有多久；没有时限是 Infinity */
export function timeLeftMs(sim: Sim): number {
  const limit = timeLimitMs(phaseOf(sim.fight))
  return limit === undefined ? Infinity : limit - phaseMs(sim)
}

/** 据点这一处在地图上的位置：中心偏移的收进敌人能站、能走到队伍的地方，地标的就在地标上；那一组地标此刻没有这一处是 null */
export function holdSpot(sim: Sim, p: HoldPoint): Point | null {
  if ('mark' in p) return markSpot(sim, p.mark, p.nth ?? 0)
  const c = sim.hooks.center(sim)
  return sim.hooks.settle(sim, { x: c.x + p.dx * UNIT, y: c.y + p.dy * UNIT })
}

/** 这张图那一组地标里的第 nth 处此刻在哪；没有就是 null */
export function markSpot(sim: Sim, mark: string, nth: number): Point | null {
  const m = sim.hooks.landmarks(sim)[mark]?.[nth]
  return m ? { x: m.x, y: m.y } : null
}

/** 这一阶段里地图上这件事发生了几次 */
export function eventsSince(sim: Sim, e: MapEvent): number {
  const f = sim.fight
  return (f.events[e] ?? 0) - (f.base.events[e] ?? 0)
}

/** 地图的这个读数升过或降过了线 */
function gaugeMet(sim: Sim, e: Extract<EndRule, { kind: 'gauge' }>): boolean {
  const v = sim.hooks.gauge?.(sim, e.gauge) ?? 0
  return e.above !== undefined ? v >= e.above : e.below !== undefined && v <= e.below
}

/** 到访要到几处：写了就是那么多，不写是那一组地标此刻的全部 */
export function visitNeed(sim: Sim, e: Extract<EndRule, { kind: 'visit' }>): number {
  return e.count ?? sim.hooks.landmarks(sim)[e.mark]?.length ?? 0
}

/** 一处要到访的地标此刻的样子：在哪、圈多大、到过没有、队长是不是正站在里面 */
export interface VisitRing extends Point {
  readonly r: number
  readonly done: boolean
  readonly here: boolean
}

/** 这一阶段要到访的地标，每处一个圈；没有到访的目标就是空的 */
export function visitRings(sim: Sim): VisitRing[] {
  const f = sim.fight
  const out: VisitRing[] = []
  phaseOf(f).ends.forEach((e, i) => {
    if (e.kind !== 'visit') return
    const g = f.goals[i]!
    if (g.done.size >= visitNeed(sim, e)) return
    ;(sim.hooks.landmarks(sim)[e.mark] ?? []).forEach((m, k) => out.push({ x: m.x, y: m.y, r: e.radius * UNIT, done: g.done.has(k), here: g.at === k }))
  })
  return out
}

/** 这一阶段不许敌人走到的地标，每处一个圈 */
export function leakRings(sim: Sim): (Point & { readonly r: number })[] {
  return phaseOf(sim.fight).ends.flatMap((e) => (e.kind === 'leak' ? (sim.hooks.landmarks(sim)[e.mark] ?? []).map((m) => ({ x: m.x, y: m.y, r: e.radius * UNIT })) : []))
}

/** 场上的敌方身体与预兆 */
function onField(sim: Sim): number {
  let n = 0
  for (const eid of query(sim.world, ENEMY_SET)) if (Faction.v[eid] === FACTION.enemy) n++
  return n + query(sim.world, [Telegraph]).length
}

/** 一队连同护卫一共几只 */
export function squadSize(squad: Squad): number {
  return squad.count + (squad.escort?.count ?? 0)
}

/** 还没放出的敌人：排着的单只、没登场的一队连同它还要再放的几次、没来的组、按地图事件还要放的几队；只数悬赏目标时护卫不算，一直放下去的一队只算下一次，没写次数的按事件放出的一队放不完 */
function pendingCount(sim: Sim, bountyOnly: boolean): number {
  let n = 0
  const size = (sq: Squad): number => (bountyOnly ? (sq.bounty ? sq.count : 0) : squadSize(sq))
  for (const e of query(sim.world, [Due, Order])) if (!bountyOnly || foeSpec[e]?.bounty) n++
  for (const e of query(sim.world, [Due, Call])) {
    const c = callSpec[e]!
    n += size(c.rule.squad) * (c.rule.every === undefined || c.rule.times === undefined ? 1 : c.rule.times - c.round)
  }
  for (const w of sim.fight.waves) for (const sq of w.rule.squads.slice(w.next)) n += size(sq)
  for (const t of sim.fight.triggers) {
    const k = size(t.rule.squad)
    if (k > 0) n += k * ((t.rule.times ?? Infinity) - t.fired)
  }
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

/** 连续刷怪还在刷：没过它的时段、也没放满 */
function streaming(sim: Sim): boolean {
  const f = sim.fight
  return f.knobs !== null || f.streams.some((st) => phaseMs(sim) < (st.rule.untilMs ?? Infinity) && st.spawned < (st.rule.total ?? Infinity))
}

/** 场上活着的头目 */
function livingBosses(sim: Sim): number[] {
  return [...query(sim.world, [Enemy, Boss])].filter((eid) => Boss.v[eid] === 1 && Faction.v[eid] === FACTION.enemy)
}

/** 场上活着的与还没放出的头目 */
function bossesLeft(sim: Sim): number {
  let n = livingBosses(sim).length
  for (const t of query(sim.world, [Telegraph])) if (Telegraph.boss[t]) n++
  for (const e of query(sim.world, [Due, Order])) if (foeSpec[e]?.enemy?.role === 'boss') n++
  for (const e of query(sim.world, [Due, Call])) {
    const enemy = callSpec[e]!.rule.squad.enemy
    if (enemy !== undefined && ENEMIES[enemy].role === 'boss') n++
  }
  return n
}

/** 头目都打倒了：这一场倒下过头目，眼下也没有活着或还没放出的 */
function bossesBeaten(sim: Sim): boolean {
  return sim.bossDown && bossesLeft(sim) === 0
}

/** 场上有头目的血量降到上限的 below 以下 */
function bossBelow(sim: Sim, below: number): boolean {
  return livingBosses(sim).some((eid) => Hp.v[eid]! < Hp.max[eid]! * below)
}

/** 这一阶段里击杀了几只：写了种类就只数这一种，写了危害就只数死于它的 */
function killsOf(sim: Sim, e: Extract<EndRule, { kind: 'kills' }>): number {
  const f = sim.fight
  if (e.by !== undefined) return (sim.run.stats.hazardKills[e.by] ?? 0) - (f.base.hazardKills[e.by] ?? 0)
  if (e.enemy !== undefined) return (sim.run.stats.enemyKills[e.enemy] ?? 0) - (f.base.enemyKills[e.enemy] ?? 0)
  return sim.run.kills - f.base.kills
}

/** 还活着或还没放出的悬赏目标 */
function bountiesLeft(sim: Sim): number {
  return query(sim.world, [Bounty]).length + pendingCount(sim, true)
}

/** 第 i 条达成条件眼下满足了：头目在更早的阶段就已打倒也算 */
function won(sim: Sim, e: EndRule, i: number): boolean {
  const f = sim.fight
  switch (e.kind) {
    case 'boss':
      return bossesBeaten(sim)
    case 'bossHp':
      return bossBelow(sim, e.below) || bossesBeaten(sim)
    case 'cleared':
      return !streaming(sim) && foesLeft(sim) === 0
    case 'kills':
      return killsOf(sim, e) >= e.count
    case 'bounty':
      return f.bounties > 0 && bountiesLeft(sim) === 0
    case 'hold':
      return f.hold !== null && f.hold.point >= e.points.length
    case 'coins':
      return sim.run.coins - f.base.coins >= e.count
    case 'event':
      return eventsSince(sim, e.event) >= e.count
    case 'gauge':
      return gaugeMet(sim, e)
    case 'visit':
      return f.goals[i]!.done.size >= visitNeed(sim, e)
    case 'time':
    case 'downs':
    case 'leak':
      return false
  }
}

/** 这一阶段的目标达成了：时限与失败条件之外的达成条件，要全部达成的全都满足，否则满足一条就算 */
function goalsMet(sim: Sim, p: PhaseDef): boolean {
  const wins = p.ends.flatMap((e, i) => (e.kind === 'time' || isLose(e) ? [] : [{ e, i }]))
  return p.need === 'all' ? wins.length > 0 && wins.every((w) => won(sim, w.e, w.i)) : wins.some((w) => won(sim, w.e, w.i))
}

/** 这一阶段的一条失败条件眼下满足了就是输的缘由，否则是 null；时限另算 */
function lostBy(sim: Sim, e: EndRule, i: number): string | null {
  const f = sim.fight
  switch (e.kind) {
    case 'downs':
      return downsOf(sim.run) - f.base.downs >= e.count ? `队员倒下了 ${e.count} 次` : null
    case 'event':
      return e.lose && eventsSince(sim, e.event) >= e.count ? `${signalName('events', e.event)}了${e.count > 1 ? ` ${e.count} 次` : ''}` : null
    case 'gauge':
      return e.lose && gaugeMet(sim, e) ? `${signalName('gauges', e.gauge)}到了 ${Math.round(100 * (e.above ?? e.below ?? 0))}%` : null
    case 'leak':
      return f.goals[i]!.leaked >= e.count ? `放过去了 ${e.count} 只敌人` : null
    default:
      return null
  }
}

export type Verdict = { readonly win: true } | { readonly win: false; readonly reason: string }

const WIN: Verdict = { win: true }

/** 这一场的结果，还没分出来是 null：队长倒下就输的队长倒了、倒下到数，立刻输；撑到时限时已经达成目标或时限不算输就算达成；不是最后一个阶段的达成了就立刻接上下一阶段，最后一个阶段达成就赢，等倒下的敌人倒完 */
export function fightVerdict(sim: Sim, timeUp: boolean): Verdict | null {
  const f = sim.fight
  if (f.rules.critical && f.leaderFell) return { win: false, reason: '队长倒下了' }
  const p = phaseOf(f)
  for (const [i, e] of p.ends.entries()) {
    const reason = lostBy(sim, e, i)
    if (reason !== null) return { win: false, reason }
  }
  const met = goalsMet(sim, p)
  if (met) {
    if (f.wonAt < 0) f.wonAt = sim.fxMs
  } else {
    f.wonAt = -1
  }
  if (timeUp && p.ends.some((e) => e.kind === 'time' && e.lose) && !met) return { win: false, reason: '时间到了' }
  if (!lastPhase(f)) {
    if (timeUp || met) nextPhase(sim)
    return null
  }
  if (timeUp) return WIN
  return met && sim.fxMs - f.wonAt >= SETTLE_MS ? WIN : null
}

/** 顶部显示的这一阶段目标：warn 为真的是提醒会输的 */
export function fightGoals(sim: Sim): { readonly text: string; readonly warn: boolean }[] {
  const f = sim.fight
  const out: { text: string; warn: boolean }[] = []
  for (const [i, e] of phaseOf(f).ends.entries()) {
    switch (e.kind) {
      case 'cleared': {
        const left = foesLeft(sim)
        out.push({ text: streaming(sim) ? `清场 · 还在来` : `清场 · 还剩 ${left}`, warn: false })
        break
      }
      case 'kills':
        out.push({ text: `${e.by ? HAZARD_KILLS[e.by] : `击杀${e.enemy ? ENEMIES[e.enemy].name : ''}`} ${Math.min(e.count, killsOf(sim, e))}/${e.count}`, warn: false })
        break
      case 'bossHp':
        out.push({ text: `把头目打到 ${Math.round(e.below * 100)}% 血`, warn: false })
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
      case 'event': {
        const name = signalName('events', e.event)
        const n = Math.min(e.count, eventsSince(sim, e.event))
        if (e.lose) out.push({ text: e.count === 1 ? `${name}就输` : `${name} ${n}/${e.count} 次就输`, warn: true })
        else out.push({ text: e.count === 1 ? `等到${name}` : `${name} ${n}/${e.count}`, warn: false })
        break
      }
      case 'gauge': {
        const pct = (v: number): string => `${Math.round(v * 100)}%`
        const now = `${signalName('gauges', e.gauge)} ${pct(sim.hooks.gauge?.(sim, e.gauge) ?? 0)}`
        const line = e.above !== undefined ? (e.lose ? `到 ${pct(e.above)} 就输` : `要到 ${pct(e.above)}`) : e.lose ? `低于 ${pct(e.below ?? 0)} 就输` : `要降到 ${pct(e.below ?? 0)}`
        out.push({ text: `${now} · ${line}`, warn: e.lose === true })
        break
      }
      case 'visit': {
        const g = f.goals[i]!
        const need = visitNeed(sim, e)
        if (g.done.size >= need) break
        const stay = g.at >= 0 ? ` · ${(g.ms / 1000).toFixed(1)}/${(e.ms / 1000).toFixed(1)} 秒` : ''
        out.push({ text: `${signalName('marks', e.mark)} ${g.done.size}/${need}${stay}`, warn: false })
        break
      }
      case 'leak':
        out.push({ text: `放过去 ${f.goals[i]!.leaked}/${e.count} 只就输`, warn: true })
        break
      case 'boss':
        break
    }
  }
  if (f.rules.relay > 0) out.push({ text: `${Math.max(1, Math.ceil((f.rules.relay - (sim.elapsedMs - f.relayAt)) / 1000))} 秒后换下一名队长`, warn: false })
  if (f.rules.critical) out.push({ text: '队长倒下就输', warn: true })
  const lives = sim.run.lives
  if (Number.isFinite(lives)) out.push({ text: lives > 0 ? `还能起来 ${lives} 次` : '倒下就再也起不来', warn: lives === 0 })
  return out
}

/** 目标不在视野里时指过去的点：据点这一处，或离队长最近的悬赏目标、最近一处还没到访的地标；要清场又没有这些时是最近的敌人 */
export function goalSpot(sim: Sim): Point | null {
  const h = sim.fight.hold
  if (h && h.point < h.rule.points.length) return holdSpot(sim, h.rule.points[h.point]!)
  const bounty = nearestTo(sim, query(sim.world, [Bounty, Transform]))
  if (bounty) return bounty
  const visit = nearestPoint(sim, visitRings(sim).filter((r) => !r.done))
  if (visit || !phaseOf(sim.fight).ends.some((e) => e.kind === 'cleared')) return visit
  return nearestTo(sim, query(sim.world, ENEMY_SET).filter((eid) => Faction.v[eid] === FACTION.enemy))
}

/** 这些点里离队长最近的一点，环面上取离队长最近的那一份 */
function nearestPoint(sim: Sim, points: readonly Point[]): Point | null {
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  let best: Point | null = null
  let bestD = Infinity
  for (const p of points) {
    const d = sim.hooks.worldDelta(sim, lx, ly, p.x, p.y)
    const d2 = d.x * d.x + d.y * d.y
    if (d2 < bestD) {
      bestD = d2
      best = { x: lx + d.x, y: ly + d.y }
    }
  }
  return best
}

/** 离队长最近的一个 */
export function nearestTo(sim: Sim, eids: ArrayLike<number>): Point | null {
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  let best: Point | null = null
  let bestD = Infinity
  for (let i = 0; i < eids.length; i++) {
    const eid = eids[i]!
    const d = sim.hooks.worldDelta(sim, lx, ly, Transform.x[eid]!, Transform.y[eid]!)
    const d2 = d.x * d.x + d.y * d.y
    if (d2 < bestD) {
      bestD = d2
      best = { x: lx + d.x, y: ly + d.y }
    }
  }
  return best
}
