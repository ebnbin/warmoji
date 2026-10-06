import { ACQUIRE } from '../../data/abilities'
import { ENEMIES, SPAWN } from '../../data/enemies'
import { ENTRANCE } from '../../data/feel'
import { MAPS } from '../../data/maps'
import { UNIT } from '../../util/units'
import { Rng } from '../../util/rng'
import type { Point } from '../../util/vec'
import type { EnemyKind } from '../../types/enemies'
import type { Entrance, EntranceLook, GateAway, GateKind, GatesConfig } from '../../types/maps'
import type { SpawnAt } from '../../types/runs'
import { awayFromWall, roomAt, wallLoops } from '../../maps/basin'
import type { Basin } from '../../maps/basin'
import type { Landmark } from '../../maps/landmark'
import { leaderX, leaderY } from '../utils/team'
import type { Sim } from '../sim'

/**
 * 一处出怪口，像素：point 是在 a 的半径 r 的口子，segment 是 a 到 b 的一段边，area 是整片能走的地面，reach 是从 a 抛得到 r 以内；
 * n 朝场地里，场地中间的为零
 */
export interface Gate {
  readonly key: string
  readonly kind: string
  readonly def: GateKind
  readonly shape: 'point' | 'segment' | 'area' | 'reach'
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly r: number
  readonly nx: number
  readonly ny: number
}

/** 一只敌人怎么进场，像素：从哪一处出怪口与它是哪一种（原地冒出来的都为空）、怎么进、起点与落点；at 是关卡给的站位，落点到时站不住时按它重找，moves 是已经换过几次 */
export interface Entry {
  readonly gate: string | null
  readonly kind: string | null
  readonly enter: Entrance
  readonly sx: number
  readonly sy: number
  readonly x: number
  readonly y: number
  readonly at?: SpawnAt
  readonly moves: number
}

/** 统计最近出了几只的时间窗，秒 */
const BINS = 10

/** 一处出怪口出过的怪：令牌按 perSec 攒，一共出了几只，最近每一秒出了几只，最近几只的落点 */
interface GateUse {
  tokens: number
  at: number
  count: number
  readonly bins: number[]
  sec: number
  readonly spots: { x: number; y: number; t: number }[]
}

/** 一只还在进场路上的敌人：到 at 毫秒落地时在 x、y 冒出它的样子，落地前倒下或换了实体（uid 对不上）就不冒 */
export interface Touchdown {
  readonly at: number
  readonly eid: number
  readonly uid: number
  readonly look: EntranceLook
  readonly x: number
  readonly y: number
}

/** 这一场的出怪口：不随时间变的几处按建出它们时的地图宽高留着，每处的计数，还在进场路上的，吸附不到在原地出来的与落点到时换地方的次数 */
export interface GateRuntime {
  readonly w: number
  readonly h: number
  readonly fixed: readonly Gate[]
  readonly use: Map<string, GateUse>
  readonly landing: Touchdown[]
  misses: number
  moves: number
}

/** 外边界上口子的半径：洞口的一半宽，格 */
const NOOK_U = 0.8
/** 口子前面至少要有这么大的空地，格 */
const NOOK_ROOM_U = 1
/** 沿外边界取点的步长，格 */
const STEP_U = 0.25
/** 落点要和这么久以内落下的几只散开 */
const SPOT_MS = 2000
const SPOT_KEEP = 6
/** 一只敌人的落点试几次，挑离最近几只最远的 */
const LANDING_TRIES = 3
/** 段上的落点沿段左右散开多远，格 */
const SLIDE_U = 0.6
/** 翻进、走出的落点横着散开多远，格 */
const SIDE_U = 0.5
function hashOf(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** 能走的地面最外面那一圈：面积最大的环，场地中间的洞不算 */
function outerLoop(b: Basin): readonly Point[] {
  let best: readonly Point[] = []
  let most = 0
  for (const loop of wallLoops(b)) {
    let twice = 0
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i]!
      const q = loop[(i + 1) % loop.length]!
      twice += p.x * q.y - q.x * p.y
    }
    if (Math.abs(twice) > most) {
      most = Math.abs(twice)
      best = loop
    }
  }
  return best
}

/** 沿环每隔 step 像素取一点 */
function resample(loop: readonly Point[], step: number): Point[] {
  const out: Point[] = []
  let next = 0
  let acc = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!
    const b = loop[(i + 1) % loop.length]!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    while (next <= acc + len) {
      const t = len > 0 ? (next - acc) / len : 0
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      next += step
    }
    acc += len
  }
  return out
}

/** 地标一组：地图没给这一组是配置写错了 */
function marksOf(sim: Sim, name: string): readonly Landmark[] {
  const list = sim.hooks.landmarks(sim)[name]
  if (!list) throw new Error(`地图 ${sim.mapId} 没有叫 ${name} 的地标`)
  return list
}

/** 离 away 那一组地标都够远 */
function farFrom(sim: Sim, away: GateAway | undefined, x: number, y: number): boolean {
  if (!away) return true
  const min = away.minU * UNIT
  return marksOf(sim, away.mark).every((m) => Math.hypot(x - m.x, y - m.y) >= min)
}

/** 不随时间变的出怪口：外边界切成的段、外边界上的口子、整片地面；地标上的由地图随时给 */
function fixedGates(sim: Sim, cfg: GatesConfig): Gate[] {
  const out: Gate[] = []
  for (const [kind, def] of Object.entries(cfg.kinds)) {
    const at = def.at
    if (at.kind === 'ground') out.push({ key: `${kind}:0`, kind, def, shape: 'area', ax: 0, ay: 0, bx: 0, by: 0, r: 0, nx: 0, ny: 0 })
    if (at.kind !== 'rim' && at.kind !== 'nooks') continue
    const b = sim.hooks.ground(sim)
    if (!b) throw new Error(`地图 ${sim.mapId} 的出怪口 ${kind} 摆在外边界上，地图却没有给能站的地面`)
    const ring = resample(outerLoop(b), STEP_U * UNIT)
    let n = 0
    if (at.kind === 'rim') {
      const every = Math.max(1, Math.round(at.segU / STEP_U))
      for (let i = 0; i < ring.length; i += every) {
        const a = ring[i]!
        const c = ring[(i + every) % ring.length]!
        const mx = (a.x + c.x) / 2
        const my = (a.y + c.y) / 2
        if (!farFrom(sim, at.away, mx, my)) continue
        const dir = awayFromWall(b, mx, my)
        out.push({ key: `${kind}:${n++}`, kind, def, shape: 'segment', ax: a.x, ay: a.y, bx: c.x, by: c.y, r: 0, nx: dir.x, ny: dir.y })
      }
      continue
    }
    const rng = new Rng(sim.run.decorSeed ^ hashOf(kind))
    const every = at.spacingU / STEP_U
    for (let f = rng.next() * every; f < ring.length - every * 0.5; f += every * (0.75 + rng.next() * 0.5)) {
      const p = ring[Math.floor(f)]!
      const dir = awayFromWall(b, p.x, p.y)
      if (!farFrom(sim, at.away, p.x, p.y)) continue
      if (roomAt(b, p.x + dir.x * (NOOK_U + NOOK_ROOM_U) * UNIT, p.y + dir.y * (NOOK_U + NOOK_ROOM_U) * UNIT) < NOOK_ROOM_U * UNIT) continue
      out.push({ key: `${kind}:${n++}`, kind, def, shape: 'point', ax: p.x, ay: p.y, bx: p.x, by: p.y, r: NOOK_U * UNIT, nx: dir.x, ny: dir.y })
    }
  }
  return out
}

/** 这一场的出怪口：横竖屏换了地图的宽高就重建 */
function runtime(sim: Sim, cfg: GatesConfig): GateRuntime {
  const old = sim.worldState.gates
  if (old && old.w === sim.mapW && old.h === sim.mapH) return old
  const rt: GateRuntime = { w: sim.mapW, h: sim.mapH, fixed: fixedGates(sim, cfg), use: new Map(), landing: old?.landing ?? [], misses: old?.misses ?? 0, moves: old?.moves ?? 0 }
  sim.worldState.gates = rt
  return rt
}

/** 此刻所有的出怪口：不变的几处，加上地图此刻给的地标；地标上抛入的口子是以它为心、抛得到的那一圈 */
export function gatesNow(sim: Sim): Gate[] {
  const cfg = MAPS[sim.mapId].gates
  if (!cfg) return []
  const out = [...runtime(sim, cfg).fixed]
  for (const [kind, def] of Object.entries(cfg.kinds)) {
    if (def.at.kind !== 'mark') continue
    const lob = def.enter === 'lob'
    marksOf(sim, kind).forEach((m, i) => {
      out.push({ key: `${kind}:${i}`, kind, def, shape: lob ? 'reach' : 'point', ax: m.x, ay: m.y, bx: m.x, by: m.y, r: lob ? (def.reachU ?? 0) * UNIT : m.r, nx: m.nx, ny: m.ny })
    })
  }
  return out
}

/** 把统计窗挪到此刻：跳过去的那几秒清零 */
function roll(u: GateUse, now: number): void {
  const sec = Math.floor(now / 1000)
  for (let s = Math.max(u.sec + 1, sec - BINS + 1); s <= sec; s++) u.bins[s % BINS] = 0
  u.sec = Math.max(u.sec, sec)
}

function useOf(rt: GateRuntime, g: Gate, now: number): GateUse {
  let u = rt.use.get(g.key)
  if (!u) {
    u = { tokens: Math.max(1, g.def.perSec ?? 1), at: now, count: 0, bins: new Array<number>(BINS).fill(0), sec: Math.floor(now / 1000), spots: [] }
    rt.use.set(g.key, u)
  }
  return u
}

/** 这一处此刻还出得了：令牌按每秒 perSec 攒，最多攒一秒的量；不限的总出得了 */
function ready(u: GateUse, def: GateKind, now: number): boolean {
  if (def.perSec === undefined) return true
  u.tokens = Math.min(Math.max(1, def.perSec), u.tokens + ((now - u.at) / 1000) * def.perSec)
  u.at = now
  return u.tokens >= 1
}

/** 记下这一处出了一只：扣一个令牌（设计好的一队可以扣成负的，之后这一处要歇一阵），落点留给后面的散开用 */
function record(u: GateUse, x: number, y: number, now: number): void {
  u.tokens -= 1
  u.count++
  roll(u, now)
  u.bins[Math.floor(now / 1000) % BINS]!++
  u.spots.push({ x, y, t: now })
  if (u.spots.length > SPOT_KEEP) u.spots.shift()
}

/** 沿段从 p 在段上的投影再挪 by 像素，不出段的两头 */
function slide(g: Gate, p: Point, by: number): Point {
  const dx = g.bx - g.ax
  const dy = g.by - g.ay
  const len = Math.hypot(dx, dy)
  if (len === 0) return { x: g.ax, y: g.ay }
  const t = Math.min(1, Math.max(0, ((p.x - g.ax) * dx + (p.y - g.ay) * dy) / (len * len) + by / len))
  return { x: g.ax + dx * t, y: g.ay + dy * t }
}

/**
 * p 吸附到这一处的距离与吸附到的点：口子取口心，段取最近的点，整片地面与抛得到的圈里就是 p 自己；抛不到是 null。
 * 有朝向的口子与段只吸它面前那一侧的点：墙后、栅栏外的出生点不会被挪到墙这边来
 */
function hitOf(g: Gate, p: Point): { readonly d: number; readonly x: number; readonly y: number } | null {
  switch (g.shape) {
    case 'area':
      return { d: 0, x: p.x, y: p.y }
    case 'reach':
      return Math.hypot(p.x - g.ax, p.y - g.ay) <= g.r ? { d: 0, x: p.x, y: p.y } : null
    case 'point':
      if ((p.x - g.ax) * g.nx + (p.y - g.ay) * g.ny < 0) return null
      return { d: Math.max(0, Math.hypot(p.x - g.ax, p.y - g.ay) - g.r), x: g.ax, y: g.ay }
    case 'segment': {
      const q = slide(g, p, 0)
      if ((p.x - q.x) * g.nx + (p.y - q.y) * g.ny < 0) return null
      return { d: Math.hypot(p.x - q.x, p.y - q.y), x: q.x, y: q.y }
    }
  }
}

/** 地图偏向的那一侧：出怪口朝外的方向越顺着偏向，权重乘得越多 */
function bias(sim: Sim, cfg: GatesConfig, g: Gate): number {
  const lean = cfg.lean
  if (!lean || (g.nx === 0 && g.ny === 0)) return 1
  const l = sim.hooks.lean(sim)
  const toward = -(g.nx * l.x + g.ny * l.y) / lean.full
  return 1 + (lean.mul - 1) * Math.min(1, Math.max(0, toward))
}

interface Landing {
  readonly sx: number
  readonly sy: number
  readonly x: number
  readonly y: number
}

/** 口子里、段边上往里一点、或者就是 p：钻出与落下的落点 */
function inside(sim: Sim, g: Gate, hit: Point, p: Point): Point {
  const rng = sim.rng
  if (g.shape === 'point') {
    const a = rng.next() * Math.PI * 2
    const r = g.r * Math.sqrt(rng.next())
    return { x: g.ax + Math.cos(a) * r, y: g.ay + Math.sin(a) * r }
  }
  if (g.shape === 'segment') {
    const q = slide(g, hit, (rng.next() * 2 - 1) * SLIDE_U * UNIT)
    const d = (0.4 + rng.next() * 0.8) * UNIT
    return { x: q.x + g.nx * d, y: q.y + g.ny * d }
  }
  return p
}

/** 一个起点与落点：抛入从地标抛到 p，钻出、落下就在口子里，走出、翻进从口子（翻进从边外）往场地里落；没有朝里方向的口子只能原地钻出 */
function sampleLanding(sim: Sim, g: Gate, hit: Point, p: Point): Landing {
  const rng = sim.rng
  const enter = g.def.enter
  if (enter === 'lob') return { sx: g.ax, sy: g.ay, x: p.x, y: p.y }
  if (enter === 'rise' || enter === 'drop' || (g.nx === 0 && g.ny === 0)) {
    const q = inside(sim, g, hit, p)
    return { sx: q.x, sy: q.y, x: q.x, y: q.y }
  }
  const f = enter === 'walk' ? ENTRANCE.walk : ENTRANCE.climb
  const base = g.shape === 'segment' ? slide(g, hit, (rng.next() * 2 - 1) * SLIDE_U * UNIT) : { x: g.ax, y: g.ay }
  const d = (f.distU[0] + rng.next() * (f.distU[1] - f.distU[0])) * UNIT
  const side = (rng.next() * 2 - 1) * SIDE_U * UNIT
  const out = enter === 'climb' ? ENTRANCE.climb.outU * UNIT + sunk(sim, g, base) : 0
  return { sx: base.x - g.nx * out, sy: base.y - g.ny * out, x: base.x + g.nx * d - g.ny * side, y: base.y + g.ny * d + g.nx * side }
}

/** 外边界上的一点陷在能站的地面里多深：弯弯曲曲的边，切成的段从里面抄近路；地标上的为零 */
function sunk(sim: Sim, g: Gate, p: Point): number {
  if (g.def.at.kind === 'mark') return 0
  const b = sim.hooks.ground(sim)
  return b ? Math.max(0, roomAt(b, p.x, p.y)) : 0
}

/**
 * 挑一个落点：试几次，半径 radius 的身体站得住、外边界上翻进的起点在能站的地面外（地标上的由地图摆好）的里面，离这一处刚落下的几只最远的；
 * 都不行是 null
 */
function landing(sim: Sim, g: Gate, hit: Point, p: Point, u: GateUse, now: number, radius: number): Landing | null {
  const ground = g.def.enter === 'climb' && g.def.at.kind !== 'mark' ? sim.hooks.ground(sim) : null
  let best: Landing | null = null
  let bestGap = -1
  for (let i = 0; i < LANDING_TRIES; i++) {
    const c = sampleLanding(sim, g, hit, p)
    if (!sim.hooks.canSpawn(sim, c.x, c.y, radius)) continue
    if (ground && roomAt(ground, c.sx, c.sy) >= 0) continue
    let gap = Infinity
    for (const s of u.spots) if (now - s.t <= SPOT_MS) gap = Math.min(gap, Math.hypot(c.x - s.x, c.y - s.y))
    if (gap > bestGap) {
      best = c
      bestGap = gap
    }
    if (gap === Infinity) break
  }
  return best
}

interface Candidate {
  readonly g: Gate
  readonly hit: Point
  readonly w: number
}

/** 按权重排个先后：每一项抽中的先后与权重成正比 */
function byWeight(sim: Sim, list: readonly Candidate[]): Candidate[] {
  return list
    .map((c) => ({ c, k: Math.pow(sim.rng.next(), 1 / c.w) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.c)
}

/** 依次试候选的出怪口，第一处落点站得住的就是它 */
function firstLanding(sim: Sim, rt: GateRuntime, order: readonly Candidate[], p: () => Point, radius: number): Entry | null {
  const now = sim.elapsedMs
  for (const c of order) {
    const u = useOf(rt, c.g, now)
    const at = landing(sim, c.g, c.hit, p(), u, now, radius)
    if (!at) continue
    record(u, at.x, at.y, now)
    return { gate: c.g.key, kind: c.g.kind, enter: c.g.def.enter, ...at, moves: 0 }
  }
  return null
}

/** p 吸附到哪一处出怪口：吸附半径以内、接这种敌人、此刻还出得了的里面按权重抽；都不行是 null */
function snap(sim: Sim, cfg: GatesConfig, rt: GateRuntime, p: Point, enemy: EnemyKind, radius: number): Entry | null {
  const now = sim.elapsedMs
  const list: Candidate[] = []
  for (const g of gatesNow(sim)) {
    if (g.def.only && !g.def.only.includes(enemy)) continue
    const h = hitOf(g, p)
    if (!h || h.d > (g.def.snapU ?? cfg.snapU) * UNIT) continue
    if (!ready(useOf(rt, g, now), g.def, now)) continue
    list.push({ g, hit: h, w: g.def.weight * bias(sim, cfg, g) })
  }
  return firstLanding(sim, rt, byWeight(sim, list), () => p, radius)
}

/**
 * 指定种类的出怪口：接这种敌人的几处里，离队长在 near 到索敌距离之间的按权重抽，一处都不在就从离这个范围最近的试起；
 * 段按两头与中点试，整片地面与抛得到的圈按 base 定下的出生点试。设计好的一队不看每一处还出不出得了
 */
function pick(sim: Sim, cfg: GatesConfig, rt: GateRuntime, kind: string, enemy: EnemyKind, boss: boolean, base: () => Point, radius: number): Entry | null {
  const near = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
  const far = ACQUIRE.range * UNIT
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  let seed: Point | null = null
  const p = (): Point => (seed ??= base())
  const banded: Candidate[] = []
  const rest: (Candidate & { readonly off: number })[] = []
  for (const g of gatesNow(sim)) {
    if (g.kind !== kind || (g.def.only && !g.def.only.includes(enemy))) continue
    const probes: Point[] =
      g.shape === 'segment' ? [{ x: g.ax, y: g.ay }, { x: (g.ax + g.bx) / 2, y: (g.ay + g.by) / 2 }, { x: g.bx, y: g.by }] : g.shape === 'point' ? [{ x: g.ax, y: g.ay }] : [p()]
    for (const q of probes) {
      if (!hitOf(g, q)) continue
      const d = sim.hooks.worldDelta(sim, lx, ly, q.x, q.y)
      const dist = Math.hypot(d.x, d.y)
      const off = dist < near ? near - dist : dist > far ? dist - far : 0
      const c = { g, hit: q, w: g.def.weight * bias(sim, cfg, g) }
      if (off === 0) banded.push(c)
      else rest.push({ ...c, off })
    }
  }
  const order = [...byWeight(sim, banded), ...rest.sort((a, b) => a.off - b.off)]
  return firstLanding(sim, rt, order, p, radius)
}

/** p 附近半径 radius 的身体站得住的一点：由近到远绕几圈找，找不到就是 p */
function standNear(sim: Sim, p: Point, radius: number): Point {
  if (sim.hooks.canSpawn(sim, p.x, p.y, radius)) return p
  for (let ring = 1; ring <= 6; ring++) {
    const r = ring * 0.6 * UNIT
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + ring
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      if (sim.hooks.canSpawn(sim, q.x, q.y, radius)) return q
    }
  }
  return p
}

/**
 * 一只敌人从哪进场，只在有出怪口的地图上用。关卡指定了出怪口（头目没写站位时用地图的头目出怪口）就从那种口子出来；
 * 否则先按 base 照常定一个出生点，再吸附到附近的出怪口；哪一处都不行就在那一点（站不住就挪到附近站得住的地方）按地图的 fallback 出来
 */
export function gateEntry(sim: Sim, at: SpawnAt | undefined, enemy: EnemyKind, boss: boolean, base: () => Point): Entry {
  const cfg = MAPS[sim.mapId].gates!
  const rt = runtime(sim, cfg)
  const radius = ENEMIES[enemy].radius * UNIT
  const named = at?.kind === 'gate' ? at.gate : boss && at === undefined ? cfg.boss : undefined
  if (named !== undefined && cfg.kinds[named] !== undefined) {
    const e = pick(sim, cfg, rt, named, enemy, boss, base, radius)
    if (e) return { ...e, at }
  }
  const p = base()
  const e = snap(sim, cfg, rt, p, enemy, radius)
  if (e) return { ...e, at }
  rt.misses++
  const q = standNear(sim, p, radius)
  return { gate: null, kind: null, enter: cfg.fallback, sx: q.x, sy: q.y, x: q.x, y: q.y, at, moves: 0 }
}

/** 落点到时站不住了（比如熔岩漫了过来）：按原来的站位重找一处 */
export function moveEntry(sim: Sim, e: Entry, enemy: EnemyKind, boss: boolean, base: () => Point): Entry {
  const next = gateEntry(sim, e.at, enemy, boss, base)
  runtime(sim, MAPS[sim.mapId].gates!).moves++
  return { ...next, moves: e.moves + 1 }
}

/** 这只敌人进场时冒出的样子：从出怪口出来的按那种口子，原地出来的按地图 */
export function entryLook(sim: Sim, e: Entry): EntranceLook {
  const cfg = MAPS[sim.mapId].gates!
  return (e.kind === null ? cfg.look : cfg.kinds[e.kind]!.look) ?? 'puff'
}

/** 记下一只还在进场路上的敌人 */
export function expectLanding(sim: Sim, t: Touchdown): void {
  runtime(sim, MAPS[sim.mapId].gates!).landing.push(t)
}

/** 到点落地的：交出去冒样子，没到的留着 */
export function takeLandings(sim: Sim): Touchdown[] {
  const list = sim.worldState.gates?.landing
  if (!list || list.length === 0) return []
  const now = sim.elapsedMs
  const due = list.filter((t) => t.at <= now)
  if (due.length === 0) return due
  const rest = list.filter((t) => t.at > now)
  list.length = 0
  list.push(...rest)
  return due
}

/** 进场动作要多久，毫秒：钻出没有动作，抛入按飞多远 */
export function entranceMs(e: Entry): number {
  switch (e.enter) {
    case 'rise':
      return 0
    case 'walk':
      return ENTRANCE.walk.ms
    case 'climb':
      return ENTRANCE.climb.ms
    case 'drop':
      return ENTRANCE.drop.ms
    case 'lob':
      return Math.max(ENTRANCE.lob.minMs, (ENTRANCE.lob.msPerU * Math.hypot(e.x - e.sx, e.y - e.sy)) / UNIT)
  }
}

/** 这一处最近十秒出了几只 */
export function gateLoad(sim: Sim, g: Gate): number {
  const u = sim.worldState.gates?.use.get(g.key)
  if (!u) return 0
  roll(u, sim.elapsedMs)
  return u.bins.reduce((s, n) => s + n, 0)
}

/** 开发者工具看的统计：每种出怪口眼下几处、一共出了几只、最近十秒出了几只，吸附不到在原地出来的与落点到时换地方的次数 */
export function gateStats(sim: Sim): { readonly rows: readonly { readonly name: string; readonly n: number; readonly total: number; readonly recent: number }[]; readonly misses: number; readonly moves: number } | null {
  const cfg = MAPS[sim.mapId].gates
  if (!cfg) return null
  const gates = gatesNow(sim)
  const rt = runtime(sim, cfg)
  const rows = Object.entries(cfg.kinds).map(([kind, def]) => {
    const mine = gates.filter((g) => g.kind === kind)
    return {
      name: def.name,
      n: mine.length,
      total: [...rt.use].filter(([key]) => key.startsWith(`${kind}:`)).reduce((s, [, u]) => s + u.count, 0),
      recent: mine.reduce((s, g) => s + gateLoad(sim, g), 0),
    }
  })
  return { rows, misses: rt.misses, moves: rt.moves }
}
