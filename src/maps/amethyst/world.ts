import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { SPAWN } from '../../data/enemies'
import { Rng } from '../../util/rng'
import { MAPS } from '../../data/maps'
import { centered } from '../frame'
import { alongWall, keepOut, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { binAt, BIN, debrisAt, lowAt, makeAmethyst, tallAt } from './layout'
import { diffuseAt, directAt, makeLighting, stepLighting, torchesAt } from './light'
import { blankSky, clockAt, crossing, hourAngle, lag, LUNAR_DAYS, secsUntil, skyAt } from './sky'
import { makeTrail, straight, trailDir, trailFrom } from './nav'
import type { AmethystLayout } from './layout'
import type { Lighting } from './light'
import type { SkyNow } from './sky'
import type { Trail } from './nav'
import type { Landmark } from '../landmark'
import type { AmethystConfig, MapId } from '../../types/maps'
import type { ClockSnapshot } from '../../run/hudHost'
import { clockSec } from '../../ecs/fight/clock'
import { charSize } from '../../ecs/systems/shared/scale'
import { Alive, Radius, Transform, Uid } from '../../ecs/components'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'
import { leaderX, leaderY } from '../../ecs/utils/team'
import { clearM, phases, topOf } from '../../ecs/utils/pass'
import { makeSolids, solidOf, solidsTrace } from '../../ecs/worlds/solids'
import type { Solids } from '../../ecs/worlds/solids'
import { bounded, groundOf, wanderIn } from '../../ecs/worlds/hooks'
import { mapEvent } from '../../ecs/fight/events'
import type { Surface, WorldHooks } from '../../ecs/worlds/hooks'

/** 挡子弹与视线的实心按这么细的格子记，像素：矮晶丛也记得下 */
const SOLID_CELL = 0.125 * UNIT
/** 重算洞里的光、重算绕路的间隔，毫秒 */
export const LIGHT_MS = 200
const TRAIL_MS = 250
/** 火把点起、熄灭要多久，毫秒 */
const IGNITE_MS = 450
const DOUSE_MS = 600
/** 撞上晶体的地方最多攒几处等画面取走 */
const IMPACT_CAP = 24
/** 暗道洞道上每隔这么远记一处，格 */
const PASSAGE_STEP_U = 1

/** 一名队员的火把：uid 对不上就是换了人；want 是想不想点着、on 是点没点着、lit 是火光的大小（0 到 1）；想法变了要等到 at 时刻才动手 */
export interface Torch {
  uid: number
  want: boolean
  on: boolean
  lit: number
  at: number
}

/** 一局的紫水晶洞穴：地形由布景种子定下，画面从这里读；光照按难度时钟走，同一局里接着上一场的钟点 */
export interface AmethystState {
  readonly layout: AmethystLayout
  readonly solids: Solids
  readonly light: Lighting
  readonly trail: Trail
  readonly sky: SkyNow
  /** 出怪口用的地标（见 marksOf）与白天的那一份：白天亮堂的几组是空的 */
  readonly marks: Readonly<Record<string, readonly Landmark[]>>
  readonly dayMarks: Readonly<Record<string, readonly Landmark[]>>
  /** 按身体记的火把 */
  readonly torches: Map<number, Torch>
  /** 子弹与出手撞上晶体的地方：画面取走时清空 */
  readonly impacts: Point[]
  /** 离下一次重算光、重算绕路还有多久，毫秒 */
  lightIn: number
  trailIn: number
  /** 上一帧太阳在不在地平线下，还没看过是 null：变了就是日落或日出 */
  night: boolean | null
}

function cfgOf(sim: Sim): AmethystConfig {
  return MAPS[sim.mapId].amethyst!
}

/**
 * 紫水晶洞穴的地标，像素：tunnel 是暗道尽头的小晶洞，朝洞道往外；passage 是暗道洞道上一路的点（晶缝躲开它们）；
 * geode 是地上半埋的晶洞，rift 是顶缝，breach 是主晶洞上的塌顶，这三组只在入夜后出怪
 */
function marksOf(L: AmethystLayout): Record<string, Landmark[]> {
  const at = (x: number, y: number, r: number): Landmark => ({ x, y, r, nx: 0, ny: 0 })
  const passage: Landmark[] = []
  const tunnel = L.tunnels.map((t): Landmark => {
    for (let i = 0; i + 1 < t.path.length; i++) {
      const p = t.path[i]!
      const q = t.path[i + 1]!
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / (PASSAGE_STEP_U * UNIT)))
      for (let k = 0; k < n; k++) passage.push(at(p.x + ((q.x - p.x) * k) / n, p.y + ((q.y - p.y) * k) / n, 0))
    }
    const end = t.path[t.path.length - 1]!
    const back = t.path[t.path.length - 2]!
    passage.push(at(end.x, end.y, 0))
    const d = Math.hypot(back.x - end.x, back.y - end.y) || 1
    return { x: end.x, y: end.y, r: t.pocket * 0.5, nx: (back.x - end.x) / d, ny: (back.y - end.y) / d }
  })
  return {
    tunnel,
    passage,
    geode: L.nodules.map((n) => at(n.x, n.y, n.r * 0.5)),
    rift: L.rifts.map((r) => {
      const mid = r.pts[r.pts.length >> 1]!
      return at(mid.x, mid.y, 0.6 * UNIT)
    }),
    breach: L.breaches.slice(0, 1).map((b) => at(b.x, b.y, b.r * 0.5)),
  }
}

/** 这一局的洞：头一回问到时按布景种子生成 */
export function amethystOf(sim: Sim): AmethystState {
  let s = sim.worldState.amethyst
  if (!s) {
    const cfg = cfgOf(sim)
    const size = MAPS[sim.mapId].size!
    const rng = new Rng(sim.run.decorSeed ^ 0x9e3d)
    const layout = makeAmethyst(cfg, centered(size.w, size.h), rng)
    const f = layout.field
    const solids = makeSolids(
      (x, y) => {
        if (roomAt(layout.shell, x, y) < 0) return { topM: Infinity, material: 'crystal' }
        const tall = tallAt(layout, x, y)
        if (tall > 0) return { topM: tall, material: 'crystal' }
        const low = lowAt(layout, x, y)
        return low > 0 ? { topM: low, material: 'crystal' } : null
      },
      f.x,
      f.y,
      Math.ceil(f.w / SOLID_CELL),
      Math.ceil(f.h / SOLID_CELL),
      SOLID_CELL,
    )
    const light = makeLighting(layout, cfg)
    const sky = skyAt(cfg.sky, clockSec(sim), blankSky())
    stepLighting(light, layout, cfg, sky)
    const marks = marksOf(layout)
    s = {
      layout,
      solids,
      light,
      trail: makeTrail(layout.basin),
      sky,
      marks,
      dayMarks: { ...marks, geode: [], rift: [], breach: [] },
      torches: new Map(),
      impacts: [],
      lightIn: LIGHT_MS,
      trailIn: 0,
      night: null,
    }
    sim.worldState.amethyst = s
  }
  return s
}

const DEBRIS = new Map<MapId, Surface>()

/** 碎晶坡上的地面：黏滞与费力来自地图，回复同平地 */
function debrisGround(sim: Sim): Surface {
  let g = DEBRIS.get(sim.mapId)
  if (!g) {
    const d = cfgOf(sim).debris
    g = { ...groundOf(sim), viscosity: d.viscosity, exertion: d.exertion }
    DEBRIS.set(sim.mapId, g)
  }
  return g
}

/** 半径 rad 的身体陷进比 clear 米高的矮晶丛、地上的晶洞多深就沿外法线退回多远：只有矮个子跨不过它们 */
function lowOut(L: AmethystLayout, x: number, y: number, rad: number, clear: number): Point {
  let px = x
  let py = y
  const { from, to } = binAt(L.bins, x, y)
  for (let k = from; k < to; k++) {
    const code = L.bins.items[k]!
    const kind = code >> 16
    if (kind !== BIN.druse && kind !== BIN.nodule) continue
    const c = kind === BIN.druse ? L.druse[code & 0xffff]! : L.nodules[code & 0xffff]!
    if (topOf(c.h) <= clear) continue
    const dx = px - c.x
    const dy = py - c.y
    const d = Math.hypot(dx, dy)
    const r = c.r + rad
    if (d >= r) continue
    px = c.x + (d > 1e-6 ? dx / d : 1) * r
    py = c.y + (d > 1e-6 ? dy / d : 0) * r
  }
  return { x: px, y: py }
}

/** 火把在身体上的位置：举在右上方，像素 */
export function torchSpot(x: number, y: number, size: number): Point {
  return { x: x + size * 0.3, y: y - size * 0.2 }
}

/** 点着的火把在哪、多亮 */
export function torchLights(sim: Sim, s: AmethystState): { spots: Point[]; lits: number[] } {
  const spots: Point[] = []
  const lits: number[] = []
  for (const m of sim.characters) {
    const t = s.torches.get(m)
    if (!t || t.uid !== Uid.v[m] || t.lit <= 0) continue
    spots.push(torchSpot(Transform.x[m]!, Transform.y[m]!, charSize(m)))
    lits.push(t.lit)
  }
  return { spots, lits }
}

/**
 * 推进一名队员的火把：身边的光（不算火把）暗过 igniteLux 就想点起、亮过 douseLux 才想熄灭；想法变了以后按队员在队里的位置各等一阵，
 * 所以全队是一个个点起来的；倒下的人火把落地就灭
 */
function stepTorch(t: Torch, cfg: AmethystConfig['torch'], lux: number, alive: boolean, slot: number, now: number, dt: number): void {
  const want = alive && lux < (t.on ? cfg.douseLux : cfg.igniteLux)
  if (want !== t.want) {
    t.want = want
    t.at = alive ? now + cfg.staggerMs * ((slot * 0.618034 + 0.17) % 1) : now
  }
  if (now >= t.at) t.on = t.want
  t.lit = t.on ? Math.min(1, t.lit + dt / IGNITE_MS) : Math.max(0, t.lit - dt / DOUSE_MS)
}

/** 怪物只从照度不到 spawnLux 的地方出来，离队长至少 minPlayerDist 格；挑不到就挑最暗的 */
function darkSpawn(sim: Sim, boss: boolean): Point {
  const s = amethystOf(sim)
  const cfg = cfgOf(sim)
  const L = s.layout
  const cells = boss ? L.bossSpawns : L.spawns
  const n = cells.length / 2
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  const near = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
  const { spots, lits } = torchLights(sim, s)
  let best: Point = { x: cells[0]!, y: cells[1]! }
  let darkest = Infinity
  for (let k = 0; k < 64; k++) {
    const i = Math.floor(sim.rng.next() * n)
    const x = cells[i * 2]!
    const y = cells[i * 2 + 1]!
    if (Math.hypot(x - lx, y - ly) < near) continue
    const e = diffuseAt(s.light, x, y) + directAt(s.light, L.ceilingM, s.sky, x, y) + torchesAt(cfg.torch, spots, lits, x, y)
    if (e < cfg.spawnLux) return { x, y }
    if (e < darkest) {
      darkest = e
      best = { x, y }
    }
  }
  return best
}

/** 洞里此刻天上的样子给时辰盘：太阳与月亮的时角、月相，离日落或日出还有几秒；不在紫水晶洞穴里为 null */
export function amethystClock(sim: Sim): ClockSnapshot | null {
  const s = sim.worldState.amethyst
  const cfg = MAPS[sim.mapId].amethyst
  if (!s || !cfg) return null
  const { hour } = clockAt(cfg.sky, clockSec(sim))
  const turn = crossing(cfg.sky, 0)
  if (!turn) return null
  const night = hour >= turn.set || hour < turn.rise
  const sun = hourAngle(hour)
  return { sun, moon: sun - lag(s.sky.age), phase: s.sky.age / LUNAR_DAYS, night, inSec: secsUntil(cfg.sky, hour, night ? turn.rise : turn.set) }
}

/**
 * 紫水晶洞穴：能走的是几个晶洞连成的洞厅与拐进岩体的暗道，洞壁、晶簇与巨晶是硬边界，挡人也挡子弹；矮晶丛与地上的晶洞只挡矮个子；
 * 绕不过去的按路程场绕。光照随真实的太阳月亮走，队员天暗了点起火把；怪物只从暗处出来；碎晶坡上走得慢、更累
 */
export const amethyst: WorldHooks = {
  ...bounded,
  surface(sim, x, y) {
    return debrisAt(amethystOf(sim).layout, x, y) > 0.5 ? debrisGround(sim) : groundOf(sim)
  },
  constrainBody(sim, eid, from, next) {
    if (phases(sim.world, eid, 'crystal')) return bounded.constrainBody(sim, eid, from, next)
    const L = amethystOf(sim).layout
    const p = keepOut(L.basin, next.x, next.y, Radius.v[eid]!)
    return lowOut(L, p.x, p.y, Radius.v[eid]!, clearM(eid))
  },
  basin(sim) {
    return amethystOf(sim).layout.basin
  },
  chaseDir(sim, eid, tx, ty) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = norm(tx - x, ty - y)
    if (phases(sim.world, eid, 'crystal')) return d
    const s = amethystOf(sim)
    const b = s.layout.basin
    const rad = Radius.v[eid]!
    const f = straight(b, x, y, tx, ty, rad * 0.9) ? d : (trailDir(s.trail, x, y) ?? d)
    return alongWall(b, x, y, f.x, f.y, rad + 0.3 * UNIT)
  },
  trace(sim, probe, ax, ay, bx, by) {
    return solidsTrace(amethystOf(sim).solids, probe, ax, ay, bx, by)
  },
  solidAt(sim, x, y) {
    return solidOf(amethystOf(sim).solids, x, y)
  },
  impact(sim, x, y, material) {
    const list = amethystOf(sim).impacts
    if (material === 'crystal' && list.length < IMPACT_CAP) list.push({ x, y })
  },
  wanderDir(sim, eid, dx, dy) {
    return wanderIn(amethystOf(sim).layout.basin, eid, dx, dy)
  },
  fleeDir(sim, eid, awayX, awayY) {
    return alongWall(amethystOf(sim).layout.basin, Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, Radius.v[eid]! + 1.5 * UNIT)
  },
  spawnPoint(sim, boss) {
    return darkSpawn(sim, boss)
  },
  /** 只看站不站得下：暗处由刷怪点挑，白天亮堂的地标整组不出 */
  canSpawn(sim, x, y, radius) {
    return roomFor(amethystOf(sim).layout.basin, x, y, radius)
  },
  /** 洞里暗到看不清了，地上的晶洞、顶缝与塌顶才出怪：白天那里亮堂堂的，怪只从暗处出来 */
  landmarks(sim) {
    const s = amethystOf(sim)
    return s.light.hallLux < cfgOf(sim).view.clearLux ? s.marks : s.dayMarks
  },
  settle(sim, p) {
    const L = amethystOf(sim).layout
    const inset = SPAWN.edgeInset * UNIT
    const q = keepOut(L.basin, p.x, p.y, inset)
    if (roomAt(L.basin, q.x, q.y) >= inset * 0.9) return q
    const cells = L.spawns
    let best = { x: cells[0]!, y: cells[1]! }
    let bd = Infinity
    for (let i = 0; i < cells.length; i += 2) {
      const d = (cells[i]! - p.x) ** 2 + (cells[i + 1]! - p.y) ** 2
      if (d < bd) {
        bd = d
        best = { x: cells[i]!, y: cells[i + 1]! }
      }
    }
    return best
  },
  onStart(sim) {
    trailFrom(amethystOf(sim).trail, leaderX(sim), leaderY(sim))
  },
  /** 每隔一阵按此刻的天重算洞里的光；火把每帧推进；绕路的路程场跟着队长重算 */
  tick(sim, delta) {
    const cfg = cfgOf(sim)
    const s = amethystOf(sim)
    const L = s.layout
    s.lightIn -= delta
    if (s.lightIn <= 0) {
      s.lightIn += LIGHT_MS
      skyAt(cfg.sky, clockSec(sim), s.sky)
      stepLighting(s.light, L, cfg, s.sky)
    }
    sim.characters.forEach((m, slot) => {
      let t = s.torches.get(m)
      if (!t || t.uid !== Uid.v[m]) {
        t = { uid: Uid.v[m]!, want: false, on: false, lit: 0, at: 0 }
        s.torches.set(m, t)
      }
      const x = Transform.x[m]!
      const y = Transform.y[m]!
      const lux = diffuseAt(s.light, x, y) + directAt(s.light, L.ceilingM, s.sky, x, y)
      stepTorch(t, cfg.torch, lux, Alive.v[m] === 1, slot, sim.elapsedMs, delta)
    })
    s.trailIn -= delta
    if (s.trailIn <= 0) {
      s.trailIn = TRAIL_MS
      trailFrom(s.trail, leaderX(sim), leaderY(sim))
    }
    const night = amethystClock(sim)?.night ?? false
    if (s.night !== null && s.night !== night) mapEvent(sim, night ? 'dusk' : 'dawn')
    s.night = night
  },
}
