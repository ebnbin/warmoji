import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { Rng } from '../../util/rng'
import { MAPS } from '../../data/maps'
import { SPAWN } from '../../data/enemies'
import { Radius, Transform } from '../../ecs/components'
import { fleeSteer } from '../../ecs/systems/shared/steer'
import { leaderPoint } from '../../ecs/utils/team'
import { bounded, wanderIn } from '../../ecs/worlds/hooks'
import { alongWall, keepOut, makeBasin, roomAt } from '../basin'
import { roomFor } from '../landmark'
import { INK, newAuthor, SOLID, stepAuthor } from './author'
import { GRID_U, patchAt, talePlan } from './layout'
import type { Author } from './author'
import type { TalePlan } from './layout'
import type { Basin } from '../basin'
import type { Landmark } from '../landmark'
import type { TaleConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import type { WorldHooks } from '../../ecs/worlds/hooks'

/** 童话书按布景种子打散出自己的种子，作者的随机数再打散一次 */
const PLAN_SEED = 0x7a1e5b
const AUTHOR_SEED = 0x2b0c4d
/** 建能走的地面时窄过两倍这么宽（格）的缝填掉 */
const NECK_U = 0.35
/** 追兵寻路的距离场多久重算一次，毫秒 */
const FLOW_MS = 300
/** 看得见直路时沿直线追：沿线每隔这么远（格）看一眼脚下还在不在墨稿上 */
const SIGHT_STEP_U = 0.4
/** 怪物不在离队长这么近（格）的地方聚出来 */
const FORM_CLEAR_U = 2.2
const DIAG = Math.SQRT2

/**
 * 童话书此刻：按种子定下的这一页与作者；能站的地面（墨稿与正在被擦、还没褪尽的块）按作者的版本重建；
 * 追兵往队长走的距离场（每格到队长要走多远，格；走不到为无穷）与它几时重算；作者的随机数
 */
export interface TaleState {
  readonly plan: TalePlan
  readonly author: Author
  basin: Basin
  built: number
  readonly flow: Float32Array
  flowAt: number
  readonly rng: Rng
}

function cfgOf(sim: Sim): TaleConfig {
  return MAPS[sim.mapId].tale!
}

/** 这一局的这一页：视图与规则按同一个种子各要一次 */
export function talePlanFor(cfg: TaleConfig, decorSeed: number): TalePlan {
  return talePlan(cfg, (decorSeed ^ PLAN_SEED) >>> 0)
}

/** 能站的地面：作者此刻能站的块连成的一片；一块都没有时（不会发生）留住头一块 */
function groundOf(plan: TalePlan, a: Author): Basin {
  const keep = plan.patches.findIndex((_, i) => a.walk[i] === 1)
  const k = plan.patches[keep < 0 ? plan.first : keep]!
  const open = (x: number, y: number): boolean => {
    const id = patchAt(plan, x / UNIT, y / UNIT)
    return id >= 0 && a.walk[id] === 1
  }
  return makeBasin(open, plan.page.x0 * UNIT, plan.page.y0 * UNIT, plan.cols, plan.rows, GRID_U * UNIT, { x: k.cx * UNIT, y: k.cy * UNIT }, NECK_U * UNIT)
}

export function taleOf(sim: Sim): TaleState {
  let s = sim.worldState.tale
  if (!s) {
    const cfg = cfgOf(sim)
    const plan = talePlanFor(cfg, sim.run.decorSeed)
    const author = newAuthor(plan, cfg)
    s = { plan, author, basin: groundOf(plan, author), built: author.version, flow: new Float32Array(plan.cols * plan.rows).fill(Infinity), flowAt: -Infinity, rng: new Rng((sim.run.decorSeed ^ AUTHOR_SEED) >>> 0) }
    sim.worldState.tale = s
  }
  return s
}

/** 地面上离边至少 room 像素的一点：从 p 往外一圈圈找，找不到就退回头一块的块心 */
function openNear(s: TaleState, p: Point, room: number): Point {
  for (let r = 0; r <= 12 * UNIT; r += 0.5 * UNIT) {
    const n = r === 0 ? 1 : Math.ceil((r * Math.PI * 2) / (0.5 * UNIT))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      if (roomAt(s.basin, q.x, q.y) >= room) return q
    }
  }
  const f = s.plan.patches[s.plan.first]!
  return { x: f.cx * UNIT, y: f.cy * UNIT }
}

/** (x, y) 像素处是不是墨稿：描完了、没在被擦 */
function inkedAt(s: TaleState, x: number, y: number): boolean {
  const id = patchAt(s.plan, x / UNIT, y / UNIT)
  return id >= 0 && s.author.phase[id] === SOLID
}

/** 追兵的距离场：从队长脚下那格往外按八邻域走，只走地面上的格 */
function buildFlow(s: TaleState, lead: Point): void {
  const { cols, rows } = s.plan
  const b = s.basin
  const f = s.flow
  f.fill(Infinity)
  const c0 = Math.floor((lead.x - b.x0) / b.cell)
  const r0 = Math.floor((lead.y - b.y0) / b.cell)
  if (c0 < 0 || r0 < 0 || c0 >= cols || r0 >= rows) return
  const start = r0 * cols + c0
  f[start] = 0
  // 距离按格计，桶宽半格：近似的戴克斯特拉
  const buckets: number[][] = [[start]]
  for (let k = 0; k < buckets.length; k++) {
    const list = buckets[k]
    if (!list) continue
    for (const i of list) {
      const d = f[i]!
      if (Math.floor(d * 2) !== k) continue
      const c = i % cols
      const r = (i - c) / cols
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const cc = c + dx
          const rr = r + dy
          if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue
          const j = rr * cols + cc
          if (b.room[j]! <= 0) continue
          const nd = d + (dx !== 0 && dy !== 0 ? DIAG : 1)
          if (nd >= f[j]!) continue
          f[j] = nd
          ;(buckets[Math.floor(nd * 2)] ??= []).push(j)
        }
      }
    }
  }
}

/** 从 (x, y) 到 (tx, ty) 的直线一路都在地面上，身体半径 r 像素 */
function inSight(b: Basin, x: number, y: number, tx: number, ty: number, r: number): boolean {
  const len = Math.hypot(tx - x, ty - y)
  const n = Math.ceil(len / (SIGHT_STEP_U * UNIT))
  for (let k = 1; k < n; k++) {
    const t = k / n
    if (roomAt(b, x + (tx - x) * t, y + (ty - y) * t) < r * 0.5) return false
  }
  return true
}

/** 顺着距离场往队长走：八个邻格里离队长最近的那个方向；走不到就是 null */
function downFlow(s: TaleState, x: number, y: number): Point | null {
  const { cols, rows } = s.plan
  const b = s.basin
  const c = Math.floor((x - b.x0) / b.cell)
  const r = Math.floor((y - b.y0) / b.cell)
  if (c < 1 || r < 1 || c >= cols - 1 || r >= rows - 1) return null
  const here = s.flow[r * cols + c]!
  if (!Number.isFinite(here)) return null
  let best = here
  let bx = 0
  let by = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const d = s.flow[(r + dy) * cols + c + dx]!
      if (d < best) {
        best = d
        bx = dx
        by = dy
      }
    }
  }
  return bx === 0 && by === 0 ? null : norm(bx, by)
}

/**
 * 童话书：只有墨稿是地面。身体走到墨稿的边上就停住，像走到了世界的尽头；脚下那块褪尽了，就按 pushU 格/秒被推回最近的墨稿，
 * 推回来之前只能往回走、不能往空白里走，敌我、掉落物都一样，不受伤。没有墙，子弹从空白的纸上飞过去。
 * 怪物在最近描完的几块上用墨迹聚出来，聚的时间由这张图定；追兵沿着地面绕过空白的纸
 */
export const tale: WorldHooks = {
  ...bounded,
  constrainBody(sim, eid, from, next) {
    const s = taleOf(sim)
    const b = s.basin
    const r = Radius.v[eid]!
    const d1 = roomAt(b, next.x, next.y)
    if (d1 >= r) return next
    const d0 = roomAt(b, from.x, from.y)
    if (d0 >= r - 0.5) return keepOut(b, next.x, next.y, r)
    // 脚下已经不存在：一帧最多往回推这么多，自己也只能往回走
    const floor = Math.min(r, d0 + cfgOf(sim).pushU * UNIT * (sim.wdtMs / 1000))
    return d1 >= floor ? next : keepOut(b, next.x, next.y, floor)
  },
  seat(sim, _from, at) {
    const b = taleOf(sim).basin
    return roomAt(b, at.x, at.y) >= 0.4 * UNIT ? at : keepOut(b, at.x, at.y, 0.4 * UNIT)
  },
  basin(sim) {
    return taleOf(sim).basin
  },
  ground(sim) {
    return taleOf(sim).basin
  },
  chaseDir(sim, eid, tx, ty) {
    const s = taleOf(sim)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const r = Radius.v[eid]!
    const d = inSight(s.basin, x, y, tx, ty, r) ? norm(tx - x, ty - y) : (downFlow(s, x, y) ?? norm(tx - x, ty - y))
    return alongWall(s.basin, x, y, d.x, d.y, r + 0.3 * UNIT)
  },
  wanderDir(sim, eid, dx, dy) {
    return wanderIn(taleOf(sim).basin, eid, dx, dy)
  },
  fleeDir(sim, eid, awayX, awayY) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const d = fleeSteer(x, y, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
    return alongWall(taleOf(sim).basin, x, y, d.x, d.y, Radius.v[eid]! + 1.5 * UNIT)
  },
  /** 刷怪点落在墨稿上、离边至少一格；头目离队长更远 */
  spawnPoint(sim, boss) {
    const s = taleOf(sim)
    const lead = leaderPoint(sim)
    const far = SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1)
    const { page } = s.plan
    let p: Point = lead
    for (let i = 0; i < 64; i++) {
      p = { x: (page.x0 + sim.rng.next() * (page.x1 - page.x0)) * UNIT, y: (page.y0 + sim.rng.next() * (page.y1 - page.y0)) * UNIT }
      if (roomAt(s.basin, p.x, p.y) < UNIT || !inkedAt(s, p.x, p.y)) continue
      if ((p.x - lead.x) ** 2 + (p.y - lead.y) ** 2 >= far * far) return p
    }
    return openNear(s, p, UNIT)
  },
  center(sim) {
    const f = taleOf(sim).plan.patches[taleOf(sim).plan.first]!
    return { x: f.cx * UNIT, y: f.cy * UNIT }
  },
  settle(sim, p) {
    return openNear(taleOf(sim), p, SPAWN.edgeInset * UNIT)
  },
  /** 只在描完、没在被擦的墨稿上聚，离队长不太近 */
  canSpawn(sim, x, y, radius) {
    const s = taleOf(sim)
    if (!roomFor(s.basin, x, y, radius) || !inkedAt(s, x, y)) return false
    const lead = leaderPoint(sim)
    return Math.hypot(x - lead.x, y - lead.y) >= FORM_CLEAR_U * UNIT + radius
  },
  /** 新墨：最近描完、还没在被擦的几块 */
  landmarks(sim) {
    const s = taleOf(sim)
    const fresh: Landmark[] = []
    for (const i of s.author.inked) {
      if (s.author.phase[i] !== SOLID) continue
      const p = s.plan.patches[i]!
      fresh.push({ x: p.cx * UNIT, y: p.cy * UNIT, r: p.inner * 0.75 * UNIT, nx: 0, ny: 0 })
    }
    return { fresh }
  },
  /** 作者下一笔要落的地方：起好铅笔稿的那块，或正在描的那块 */
  beacon(sim) {
    const s = taleOf(sim)
    const a = s.author
    const i = a.next >= 0 ? a.next : a.phase.indexOf(INK)
    if (i < 0) return null
    const p = s.plan.patches[i]!
    return { x: p.cx * UNIT, y: p.cy * UNIT }
  },
  forming(sim, boss) {
    const f = cfgOf(sim).form
    return boss ? f.bossMs : f.ms
  },
  onStart(sim) {
    taleOf(sim)
  },
  tick(sim) {
    const s = taleOf(sim)
    stepAuthor(s.author, s.plan, cfgOf(sim), sim.elapsedMs, () => s.rng.next())
    const rebuilt = s.built !== s.author.version
    if (rebuilt) {
      s.basin = groundOf(s.plan, s.author)
      s.built = s.author.version
    }
    if (rebuilt || sim.elapsedMs - s.flowAt >= FLOW_MS) {
      buildFlow(s, leaderPoint(sim))
      s.flowAt = sim.elapsedMs
    }
  },
}
