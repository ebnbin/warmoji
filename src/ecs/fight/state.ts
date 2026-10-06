import { query, removeEntity } from 'bitecs'
import { ENEMIES } from '../../data/enemies'
import { HAZARD_KILLS } from '../../data/maps'
import { phasesOf, timeLimitMs } from '../../data/runs'
import { UNIT } from '../../util/units'
import type { Point } from '../../util/vec'
import type { Polarity } from '../../types/battlefield'
import type { EnemyDef, EnemyKind, EnemyMixEntry } from '../../types/enemies'
import type { Hazard } from '../../types/maps'
import type { BossRule, CarrierRule, EndRule, FightDef, GroupTraits, HoldPoint, LegacyBatchRule, LegacyPhaseDef, LegacySquad, LegacyWavesRule, Loot, MixEntry, SpawnAt, StreamRule } from '../../types/runs'
import type { StatMods } from '../../types/stats'
import { activeRules, enemyModsOf, mutatorRules } from '../../run/rules'
import type { ActiveRules } from '../../run/rules'
import { runDef } from '../../run/state'
import type { RunState } from '../../run/state'
import { Boss, Bounty, Call, Carrier, Due, Enemy, ENEMY_SET, FACTION, Faction, Hp, Order, Telegraph, Transform } from '../components'
import { scheduleCall, scheduleCarrier } from '../entities/schedule'
import { callSpec, carrierPickup, foeSpec } from '../store'
import { sandboxTeamMods } from '../sandbox/knobs'
import { rollCarriers } from '../utils/battleFx'
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

/** 到时登场的一队敌人或头目；round 是一再放出的一队这是第几次，从 0 算 */
export interface CallSpec {
  readonly rule: LegacyBatchRule | BossRule
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
  readonly rule: LegacyWavesRule
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
  /** 试炼场按旋钮刷怪的冷却；没有这条规则是 null */
  knobs: { cooldownMs: number } | null
  /** 这一阶段的配比；不写就按地图 */
  mix: EnemyMixEntry[] | null
  hold: HoldState | null
  /** 这一阶段开始时的击杀、各种敌人的击杀、金币与倒下次数，进度从这里算 */
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
}

/** 阶段开始时的计数 */
interface PhaseBase {
  readonly kills: number
  readonly enemyKills: Partial<Record<EnemyKind, number>>
  readonly hazardKills: Partial<Record<Hazard, number>>
  readonly coins: number
  readonly downs: number
}

function downsOf(run: RunState): number {
  return run.stats.deaths.reduce((s, n) => s + n, 0)
}

function baseOf(run: RunState): PhaseBase {
  return { kills: run.kills, enemyKills: { ...run.stats.enemyKills }, hazardKills: { ...run.stats.hazardKills }, coins: run.coins, downs: downsOf(run) }
}

/** 阶段自己的状态：刷怪、配比与据点换成这一阶段的，进度从 at 这一刻、run 此刻的计数算起 */
function phaseState(def: FightDef, phase: number, run: RunState, at: number): Pick<FightState, 'phase' | 'phaseAt' | 'streams' | 'waves' | 'knobs' | 'mix' | 'hold' | 'base' | 'bounties' | 'wonAt'> {
  const p = phasesOf(def)[phase]!
  const hold = p.ends.find((e) => e.kind === 'hold')
  return {
    phase,
    phaseAt: at,
    streams: p.spawns.flatMap((rule) => (rule.kind === 'stream' ? [{ rule, foe: foeOf(rule), cooldownMs: FIRST_SPAWN_MS, spawned: 0 }] : [])),
    waves: p.spawns.flatMap((rule) => (rule.kind === 'waves' ? [{ rule, next: 0, calmAt: -1 }] : [])),
    knobs: p.spawns.some((rule) => rule.kind === 'knobs') ? { cooldownMs: FIRST_SPAWN_MS } : null,
    mix: p.mix ? mixOf(p.mix) : null,
    hold: hold?.kind === 'hold' ? { rule: hold, point: 0, heldMs: 0, inside: false } : null,
    base: baseOf(run),
    bounties: 0,
    wonAt: -1,
  }
}

export function newFight(def: FightDef, run: RunState): FightState {
  return {
    def,
    rules: activeRules(runDef(run).rules, def.rules, mutatorRules(run)),
    enemyMods: enemyModsOf(run, def),
    ...phaseState(def, 0, run, 0),
    leaderFell: false,
    switchedAt: -Infinity,
    rescueMs: run.roster.map(() => 0),
  }
}

/** 当前阶段 */
export function phaseOf(f: FightState): LegacyPhaseDef {
  return phasesOf(f.def)[f.phase]!
}

/** 当前阶段开始了多久 */
export function phaseMs(sim: Sim): number {
  return sim.elapsedMs - sim.fight.phaseAt
}

/** 这一阶段开始：定时登场的排好，带光圈的敌人抽好效果排好，打出这一阶段的横幅 */
export function startPhase(sim: Sim): void {
  const at = sim.fight.phaseAt
  const p = phaseOf(sim.fight)
  for (const rule of p.spawns) {
    if (rule.kind === 'batch' || rule.kind === 'boss') scheduleCall(sim, at + rule.atMs, rule)
    else if (rule.kind === 'carriers') scheduleCarriers(sim, at, rule)
  }
  if (p.intro) sim.out.banners.push(p.intro)
}

function scheduleCarriers(sim: Sim, at: number, rule: CarrierRule): void {
  const carriers = rollCarriers(sim.mapId, rule.buff, rule.debuff, () => sim.rng.next())
  carriers.forEach((pickup, i) => {
    scheduleCarrier(sim, at + rule.atMs + (rule.spanMs * i) / carriers.length, pickup)
  })
}

/** 已经是这一场的最后一个阶段 */
export function lastPhase(f: FightState): boolean {
  return f.phase === phasesOf(f.def).length - 1
}

/** 这一阶段达成，不停顿地接上下一阶段：还没登场的一队、头目与带光圈的敌人不再来，场上的留着 */
export function nextPhase(sim: Sim): void {
  for (const e of [...query(sim.world, [Due, Call])]) {
    callSpec[e] = undefined
    removeEntity(sim.world, e)
  }
  for (const e of [...query(sim.world, [Due, Carrier])]) {
    carrierPickup[e] = undefined
    removeEntity(sim.world, e)
  }
  Object.assign(sim.fight, phaseState(sim.fight.def, sim.fight.phase + 1, sim.run, sim.elapsedMs))
  startPhase(sim)
}

/** 这一阶段的收获从此刻起算：开波的道具规则可能已经进账 */
export function markFightBase(sim: Sim): void {
  sim.fight.base = baseOf(sim.run)
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

/** 离这一阶段的时限还有多久；没有时限是 Infinity */
export function timeLeftMs(sim: Sim): number {
  const limit = timeLimitMs(phaseOf(sim.fight))
  return limit === undefined ? Infinity : limit - phaseMs(sim)
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

/** 一队连同护卫一共几只 */
export function squadSize(squad: LegacySquad): number {
  return squad.count + (squad.escort?.count ?? 0)
}

/** 还没放出的敌人：排着的单只、没登场的一队连同它还要再放的几次、没来的组；只数悬赏目标时护卫不算，一直放下去的一队只算下一次 */
function pendingCount(sim: Sim, bountyOnly: boolean): number {
  let n = 0
  const size = (sq: LegacySquad): number => (bountyOnly ? (sq.bounty ? sq.count : 0) : squadSize(sq))
  for (const e of query(sim.world, [Due, Order])) if (!bountyOnly || foeSpec[e]?.bounty) n++
  for (const e of query(sim.world, [Due, Call])) {
    const c = callSpec[e]
    if (c?.rule.kind === 'batch') n += size(c.rule.squad) * (c.rule.every === undefined || c.rule.times === undefined ? 1 : c.rule.times - c.round)
    if (c?.rule.kind === 'boss' && !bountyOnly) n++
  }
  for (const w of sim.fight.waves) for (const sq of w.rule.squads.slice(w.next)) n += size(sq)
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
    const r = callSpec[e]?.rule
    if (r?.kind === 'boss' || (r?.squad.enemy !== undefined && ENEMIES[r.squad.enemy].role === 'boss')) n++
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

/** 一条达成条件眼下满足了：头目在更早的阶段就已打倒也算 */
function won(sim: Sim, e: EndRule): boolean {
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
    case 'time':
    case 'downs':
      return false
  }
}

/** 这一阶段的目标达成了：时限之外的达成条件，要全部达成的全都满足，否则满足一条就算 */
function goalsMet(sim: Sim, p: LegacyPhaseDef): boolean {
  const wins = p.ends.filter((e) => e.kind !== 'time' && e.kind !== 'downs')
  return p.need === 'all' ? wins.length > 0 && wins.every((e) => won(sim, e)) : wins.some((e) => won(sim, e))
}

export type Verdict = { readonly win: true } | { readonly win: false; readonly reason: string }

const WIN: Verdict = { win: true }

/** 这一场的结果，还没分出来是 null：队长倒下就输的队长倒了、倒下到数，立刻输；撑到时限时已经达成目标或时限不算输就算达成；不是最后一个阶段的达成了就立刻接上下一阶段，最后一个阶段达成就赢，等倒下的敌人倒完 */
export function fightVerdict(sim: Sim, timeUp: boolean): Verdict | null {
  const f = sim.fight
  if (f.rules.critical && f.leaderFell) return { win: false, reason: '队长倒下了' }
  const p = phaseOf(f)
  for (const e of p.ends) {
    if (e.kind === 'downs' && downsOf(sim.run) - f.base.downs >= e.count) return { win: false, reason: `队员倒下了 ${e.count} 次` }
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
  for (const e of phaseOf(f).ends) {
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
      case 'boss':
        break
    }
  }
  if (f.rules.critical) out.push({ text: '队长倒下就输', warn: true })
  const lives = sim.run.lives
  if (Number.isFinite(lives)) out.push({ text: lives > 0 ? `还能起来 ${lives} 次` : '倒下就再也起不来', warn: lives === 0 })
  return out
}

/** 目标不在视野里时指过去的点：据点这一处，或离队长最近的悬赏目标；要清场又没有悬赏时是最近的敌人 */
export function goalSpot(sim: Sim): Point | null {
  const h = sim.fight.hold
  if (h && h.point < h.rule.points.length) return holdSpot(sim, h.rule.points[h.point]!)
  const bounty = nearestTo(sim, query(sim.world, [Bounty, Transform]))
  if (bounty || !phaseOf(sim.fight).ends.some((e) => e.kind === 'cleared')) return bounty
  return nearestTo(sim, query(sim.world, ENEMY_SET).filter((eid) => Faction.v[eid] === FACTION.enemy))
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
