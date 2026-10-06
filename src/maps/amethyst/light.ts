import { UNIT } from '../../util/units.ts'
import { roomAt } from '../basin.ts'
import { blockM, breachDepth, hallDepth, riftDepth, skyAbove, tunnelDepth } from './layout.ts'
import { torchLux } from './sky.ts'
import type { AmethystLayout } from './layout'
import type { Bearing, SkyNow } from './sky'
import type { AmethystConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 光照场的格子边长，像素 */
const LIGHT_CELL = 0.5 * UNIT
/** 查遮挡用的高度图与开口图的格子边长，像素 */
const RELIEF_CELL = 0.25 * UNIT
/** 反光在这么粗的格子上铺开，像素 */
const BOUNCE_CELL = UNIT
/** 每处开口查遮挡的探点数（含中心） */
const PROBES = 7
/** 直射查遮挡时沿光线取几个点：越靠近受光处越密 */
const MARCH = 14
/** 岩体里每往里一圈（半格）照度剩下多少 */
export const ROCK_KEEP = 0.5

/** 一处开口：天空按小块取的样点（像素，成对排）与每块的面积（格²），查遮挡的探点 */
interface Patch {
  readonly samples: Float32Array
  readonly area: number
  readonly probes: readonly Point[]
}

/**
 * 洞里的光：半格一格，铺满画地面的那块。天光按每格看得见多少天（视角系数）进来，直射看朝着太阳（月亮）的那条光线是不是从开口穿出去、半路有没有被洞壁与晶体挡住；
 * 洞底与晶壁把光反来反去，在洞厅里铺开（反光，晶体把它染成紫色），沿着暗道一路暗下去。diffuse 是天光与反光，勒克斯
 */
export interface Lighting {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly x0: number
  readonly y0: number
  /** 每格的地面离地多高，米 */
  readonly z: Float32Array
  /** 有光的格子：洞厅、暗道与它们的洞壁 */
  readonly air: Uint8Array
  /** 洞厅能走的地面：平均照度按它算 */
  readonly floor: Uint8Array
  readonly view: Float32Array
  /** 暗道里的格子：反光按洞口那一格的乘上它；洞厅里为 1 */
  readonly fade: Float32Array
  /** 暗道里的格子在粗格子上的洞口，洞厅里为 −1 */
  readonly mouth: Int32Array
  readonly diffuse: Float32Array
  /** diffuse 里反光占多少：反光被晶体染成紫色，天光不染 */
  readonly share: Float32Array
  /** 岩体里的格子按离光多远排的次序与圈数：照度从有光的地方一圈圈往岩体里淡出，画面上不出台阶 */
  readonly fill: Int32Array
  readonly rank: Uint16Array
  readonly bcols: number
  readonly brows: number
  readonly bair: Uint8Array
  readonly bsrc: Float32Array
  /** 查遮挡的高度图（米，见 blockM）与开口图（0 到 1），四分之一格一格 */
  readonly hcols: number
  readonly hrows: number
  readonly hz: Float32Array
  readonly hsky: Float32Array
  /** 洞厅能走的地面的平均照度（天光与反光），勒克斯 */
  hallLux: number
  /** 每算一次加一 */
  version: number
}

/** 格子上 (x, y) 像素处的双线性插值：格子 (0, 0) 的左上角在 (x0, y0) */
function sample(a: Float32Array, cols: number, rows: number, cell: number, x0: number, y0: number, x: number, y: number): number {
  const u = Math.min(cols - 1.001, Math.max(0, (x - x0) / cell - 0.5))
  const v = Math.min(rows - 1.001, Math.max(0, (y - y0) / cell - 0.5))
  const ix = Math.floor(u)
  const iy = Math.floor(v)
  const fx = u - ix
  const fy = v - iy
  const i = iy * cols + ix
  return (a[i]! * (1 - fx) + a[i + 1]! * fx) * (1 - fy) + (a[i + cols]! * (1 - fx) + a[i + cols + 1]! * fx) * fy
}

/** (x, y) 像素处查遮挡用的地面高度，米 */
export function reliefAt(lt: Lighting, x: number, y: number): number {
  return sample(lt.hz, lt.hcols, lt.hrows, RELIEF_CELL, lt.x0, lt.y0, x, y)
}

/** (x, y) 像素处正上方有多少是天，0 到 1 */
function openAt(lt: Lighting, x: number, y: number): number {
  return sample(lt.hsky, lt.hcols, lt.hrows, RELIEF_CELL, lt.x0, lt.y0, x, y)
}

/** 从 (x, y) 高 z 米处到 (px, py) 洞顶那么高的一条直线，有没有被地形挡住 */
function seesUp(lt: Lighting, ceil: number, x: number, y: number, z: number, px: number, py: number): boolean {
  const len = Math.hypot(px - x, py - y)
  const steps = Math.max(2, Math.ceil(len / (0.35 * UNIT)))
  for (let k = 1; k < steps; k++) {
    const t = k / steps
    if (reliefAt(lt, x + (px - x) * t, y + (py - y) * t) > z + (ceil - z) * t + 0.05) return false
  }
  return true
}

/** 每处开口按小块取样：塌顶半格一块、顶缝四分之一格一块；探点是塌顶的中心与一圈六成半径上的点、顶缝的几个折点 */
function patchesOf(L: AmethystLayout): Patch[] {
  const out: Patch[] = []
  const grid = (x0: number, y0: number, x1: number, y1: number, step: number, inside: (x: number, y: number) => boolean): Float32Array => {
    const pts: number[] = []
    for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / 2; x < x1; x += step) if (inside(x, y)) pts.push(x, y)
    return new Float32Array(pts)
  }
  for (const b of L.breaches) {
    const reach = b.r * 1.5
    const samples = grid(b.x - reach, b.y - reach, b.x + reach, b.y + reach, 0.5 * UNIT, (x, y) => breachDepth(b, x, y) > 0)
    const probes: Point[] = [{ x: b.x, y: b.y }]
    for (let k = 0; k < PROBES - 1; k++) {
      const a = (k / (PROBES - 1)) * Math.PI * 2
      probes.push({ x: b.x + Math.cos(a) * b.r * 0.6, y: b.y + Math.sin(a) * b.r * 0.6 })
    }
    out.push({ samples, area: 0.25, probes })
  }
  for (const r of L.rifts) {
    const xs = r.pts.map((p) => p.x)
    const ys = r.pts.map((p) => p.y)
    const pad = UNIT
    const samples = grid(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad, 0.25 * UNIT, (x, y) => riftDepth(r, x, y) > 0)
    out.push({ samples, area: 0.0625, probes: r.pts.filter((_, i) => i > 0 && i < r.pts.length - 1) })
  }
  return out
}

/**
 * 天光视角系数：从 (x, y) 高 z 米处仰看，各处开口里每一小块天占半球天光的多少（cosθ₁·cosθ₂/πr² 乘面积）；
 * 每处开口按它的探点有几成看得见打折
 */
function viewFactor(L: AmethystLayout, lt: Lighting, patches: readonly Patch[], x: number, y: number, z: number): number {
  const dz = Math.max(0.4, L.ceilingM - z)
  const dz2 = dz * dz
  let sum = 0
  for (const p of patches) {
    let part = 0
    const s = p.samples
    for (let i = 0; i < s.length; i += 2) {
      const dx = (s[i]! - x) / UNIT
      const dy = (s[i + 1]! - y) / UNIT
      const r2 = dx * dx + dy * dy + dz2
      part += dz2 / (Math.PI * r2 * r2)
    }
    part *= p.area
    if (part < 1e-6) continue
    let seen = 0
    for (const q of p.probes) if (seesUp(lt, L.ceilingM, x, y, z + 0.15, q.x, q.y)) seen++
    sum += (part * seen) / p.probes.length
  }
  return Math.min(1, sum)
}

/** 半格一格的照度场：每格的高度、有没有光、看得见多少天、在暗道里多深；岩体里的格子排好淡出的次序 */
export function makeLighting(L: AmethystLayout, cfg: AmethystConfig): Lighting {
  const f = L.field
  const cols = Math.ceil(f.w / LIGHT_CELL)
  const rows = Math.ceil(f.h / LIGHT_CELL)
  const n = cols * rows
  const hcols = Math.ceil(f.w / RELIEF_CELL)
  const hrows = Math.ceil(f.h / RELIEF_CELL)
  const hz = new Float32Array(hcols * hrows)
  const hsky = new Float32Array(hcols * hrows)
  for (let r = 0; r < hrows; r++) {
    for (let c = 0; c < hcols; c++) {
      const x = f.x + (c + 0.5) * RELIEF_CELL
      const y = f.y + (r + 0.5) * RELIEF_CELL
      hz[r * hcols + c] = blockM(L, x, y)
      hsky[r * hcols + c] = skyAbove(L, x, y, 0.12 * UNIT)
    }
  }
  const bcols = Math.ceil(f.w / BOUNCE_CELL)
  const brows = Math.ceil(f.h / BOUNCE_CELL)
  const lt: Lighting = {
    cols,
    rows,
    cell: LIGHT_CELL,
    x0: f.x,
    y0: f.y,
    z: new Float32Array(n),
    air: new Uint8Array(n),
    floor: new Uint8Array(n),
    view: new Float32Array(n),
    fade: new Float32Array(n).fill(1),
    mouth: new Int32Array(n).fill(-1),
    diffuse: new Float32Array(n),
    share: new Float32Array(n),
    fill: new Int32Array(0),
    rank: new Uint16Array(n),
    bcols,
    brows,
    bair: new Uint8Array(bcols * brows),
    bsrc: new Float32Array(bcols * brows),
    hcols,
    hrows,
    hz,
    hsky,
    hallLux: 0,
    version: 0,
  }
  const wallPx = L.wallU * UNIT
  const patches = patchesOf(L)
  const tunnelZone = new Uint8Array(n)
  const coarse = (i: number): number => Math.floor(Math.floor(i / cols) / 2) * bcols + Math.floor((i % cols) / 2)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const x = f.x + (c + 0.5) * LIGHT_CELL
      const y = f.y + (r + 0.5) * LIGHT_CELL
      const shell = roomAt(L.shell, x, y)
      lt.z[i] = reliefAt(lt, x, y)
      if (shell < -wallPx) continue
      lt.air[i] = 1
      lt.bair[coarse(i)] = 1
      let tunnel = -Infinity
      for (const t of L.tunnels) tunnel = Math.max(tunnel, tunnelDepth(t, L.seed, x, y))
      const zone = tunnel > hallDepth(L, x, y) ? 1 : 0
      tunnelZone[i] = zone
      if (zone === 0 && shell > 0) lt.floor[i] = 1
      lt.view[i] = viewFactor(L, lt, patches, x, y, lt.z[i]!)
    }
  }
  // 暗道里离洞厅多远：从挨着洞厅地面的那一圈起，先沿暗道的地面走，再从地面走上暗道的洞壁；记下是从洞厅的哪一格进来的
  const walk = (i: number): boolean => roomAt(L.shell, f.x + ((i % cols) + 0.5) * LIGHT_CELL, f.y + (Math.floor(i / cols) + 0.5) * LIGHT_CELL) > 0
  const dist = new Float32Array(n).fill(Infinity)
  const queue: number[] = []
  for (let i = 0; i < n; i++) {
    if (!tunnelZone[i] || !walk(i)) continue
    const c = i % cols
    for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) {
      if (j < 0 || j >= n || !lt.air[j] || tunnelZone[j] || !walk(j)) continue
      dist[i] = 0
      lt.mouth[i] = coarse(j)
      queue.push(i)
      break
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!
    const c = i % cols
    const from = walk(i)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx === 0 && dy === 0) || c + dx < 0 || c + dx >= cols) continue
        const j = i + dy * cols + dx
        if (j < 0 || j >= n || !tunnelZone[j] || (!from && walk(j))) continue
        const d = dist[i]! + LIGHT_CELL * (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1)
        if (d >= dist[j]!) continue
        dist[j] = d
        lt.mouth[j] = lt.mouth[i]!
        queue.push(j)
      }
    }
  }
  const fadePx = cfg.light.tunnelFadeU * UNIT
  for (let i = 0; i < n; i++) {
    if (!tunnelZone[i]) continue
    lt.fade[i] = Number.isFinite(dist[i]!) ? Math.exp(-dist[i]! / fadePx) : 0
  }
  // 岩体里：一圈圈往外排
  const fill: number[] = []
  let ring: number[] = []
  for (let i = 0; i < n; i++) if (lt.air[i]) ring.push(i)
  for (let k = 1; ring.length > 0 && k < 65535; k++) {
    const next: number[] = []
    for (const i of ring) {
      const c = i % cols
      for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) {
        if (j < 0 || j >= n || lt.air[j] || lt.rank[j]) continue
        lt.rank[j] = k
        fill.push(j)
        next.push(j)
      }
    }
    ring = next
  }
  return { ...lt, fill: new Int32Array(fill) }
}

/** 高 z 米处朝 dir 那个天体看出去，有多少光从开口照到这里：光线在洞顶的高度上落在开口里，半路没被地形挡住；返回 0 到 1 */
function beamThrough(lt: Lighting, ceil: number, x: number, y: number, z: number, dir: Bearing): number {
  if (dir.elev <= 0.01) return 0
  const run = ((ceil - z) / Math.tan(dir.elev)) * UNIT
  const open = openAt(lt, x + dir.x * run, y + dir.y * run)
  if (open <= 0.001) return 0
  for (let k = 0; k < MARCH; k++) {
    const t = ((k + 0.5) / MARCH) ** 2
    if (reliefAt(lt, x + dir.x * run * t, y + dir.y * run * t) > z + 0.1 + (ceil - z - 0.1) * t + 0.02) return 0
  }
  return open
}

/** 这一点地面此刻的直射照度（太阳加月亮），勒克斯 */
export function directAt(lt: Lighting, ceil: number, sky: SkyNow, x: number, y: number): number {
  const z = reliefAt(lt, x, y)
  let e = 0
  if (sky.sunLux > 0) e += sky.sunLux * Math.sin(sky.sun.elev) * beamThrough(lt, ceil, x, y, z, sky.sun)
  if (sky.moonLux > 0) e += sky.moonLux * Math.sin(sky.moon.elev) * beamThrough(lt, ceil, x, y, z, sky.moon)
  return e
}

/** 照度场在 (x, y) 处的天光与反光，勒克斯 */
export function diffuseAt(lt: Lighting, x: number, y: number): number {
  return sample(lt.diffuse, lt.cols, lt.rows, lt.cell, lt.x0, lt.y0, x, y)
}

/** 一行（或一列）上的指数平滑，先正着走一遍再倒着走一遍：只在有光的格子里走，岩体隔开的两段互不相干 */
function smoothLine(a: Float32Array, air: Uint8Array, start: number, stride: number, count: number, keep: number): void {
  let on = false
  let y = 0
  for (let k = 0; k < count; k++) {
    const i = start + k * stride
    if (!air[i]) {
      on = false
      continue
    }
    y = on ? (1 - keep) * a[i]! + keep * y : a[i]!
    a[i] = y
    on = true
  }
  on = false
  for (let k = count - 1; k >= 0; k--) {
    const i = start + k * stride
    if (!air[i]) {
      on = false
      continue
    }
    y = on ? (1 - keep) * a[i]! + keep * y : a[i]!
    a[i] = y
    on = true
  }
}

/**
 * 按此刻的天重算洞里的光：每格的直射与天光是洞底受的光，乘上两回反照率（洞底反到晶壁与洞顶、再反回来）、算上反了又反的那些，
 * 在粗格子上按 bounceU 指数地铺开，岩体隔开的地方不走；暗道里的反光按洞口那一格的、往深处一路暗下去
 */
export function stepLighting(lt: Lighting, L: AmethystLayout, cfg: AmethystConfig, sky: SkyNow): void {
  const { cols, rows, cell, x0, y0, bcols, brows, bair, bsrc } = lt
  const skyTot = sky.skyLux + sky.moonSkyLux
  const ceil = L.ceilingM
  bsrc.fill(0)
  const count = new Float32Array(bcols * brows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      if (!lt.air[i]) continue
      const x = x0 + (c + 0.5) * cell
      const y = y0 + (r + 0.5) * cell
      let e = lt.view[i]! * skyTot
      if (sky.sunLux > 0) e += sky.sunLux * Math.sin(sky.sun.elev) * beamThrough(lt, ceil, x, y, lt.z[i]!, sky.sun)
      if (sky.moonLux > 0) e += sky.moonLux * Math.sin(sky.moon.elev) * beamThrough(lt, ceil, x, y, lt.z[i]!, sky.moon)
      const b = (r >> 1) * bcols + (c >> 1)
      bsrc[b] = bsrc[b]! + e
      count[b] = count[b]! + 1
    }
  }
  for (let b = 0; b < bsrc.length; b++) if (count[b]! > 0) bsrc[b] = bsrc[b]! / count[b]!
  const keep = Math.exp(-BOUNCE_CELL / (cfg.light.bounceU * UNIT))
  for (let pass = 0; pass < 2; pass++) {
    for (let r = 0; r < brows; r++) smoothLine(bsrc, bair, r * bcols, 1, bcols, keep)
    for (let c = 0; c < bcols; c++) smoothLine(bsrc, bair, c, bcols, brows, keep)
  }
  const rho2 = cfg.light.albedo * cfg.light.albedo
  const gain = rho2 / (1 - rho2)
  let sum = 0
  let num = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      if (!lt.air[i]) continue
      let bounce: number
      if (lt.mouth[i]! >= 0) bounce = gain * bsrc[lt.mouth[i]!]! * lt.fade[i]!
      else {
        // 粗格子的格心落在细格子的 (2k + 0.5) 处，双线性插回来；岩体里的粗格子不算
        const u = Math.min(bcols - 1.001, Math.max(0, (c - 0.5) / 2))
        const v = Math.min(brows - 1.001, Math.max(0, (r - 0.5) / 2))
        const ix = Math.floor(u)
        const iy = Math.floor(v)
        const fx = u - ix
        const fy = v - iy
        const j = iy * bcols + ix
        const w00 = bair[j]! * (1 - fx) * (1 - fy)
        const w10 = bair[j + 1]! * fx * (1 - fy)
        const w01 = bair[j + bcols]! * (1 - fx) * fy
        const w11 = bair[j + bcols + 1]! * fx * fy
        const w = w00 + w10 + w01 + w11
        bounce = w > 0 ? (gain * (bsrc[j]! * w00 + bsrc[j + 1]! * w10 + bsrc[j + bcols]! * w01 + bsrc[j + bcols + 1]! * w11)) / w : 0
      }
      const e = lt.view[i]! * skyTot + bounce
      lt.diffuse[i] = e
      lt.share[i] = e > 0 ? bounce / e : 0
      if (lt.floor[i]) {
        sum += e
        num++
      }
    }
  }
  // 岩体里：取已定下的相邻格里最亮的一格，每往里一圈暗一半
  const { fill, rank } = lt
  for (let k = 0; k < fill.length; k++) {
    const i = fill[k]!
    const c = i % cols
    let best = 0
    let share = 0
    for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) {
      if (j < 0 || j >= cols * rows || rank[j]! >= rank[i]! || lt.diffuse[j]! <= best) continue
      best = lt.diffuse[j]!
      share = lt.share[j]!
    }
    lt.diffuse[i] = best * ROCK_KEEP
    lt.share[i] = share
  }
  lt.hallLux = num > 0 ? sum / num : 0
  lt.version++
}

/** 一处被这些火把照到多亮（不算遮挡），勒克斯 */
export function torchesAt(torch: AmethystConfig['torch'], spots: readonly Point[], lits: readonly number[], x: number, y: number): number {
  let e = 0
  for (let k = 0; k < spots.length; k++) {
    const lit = lits[k]!
    if (lit > 0) e += lit * torchLux(torch, Math.hypot(spots[k]!.x - x, spots[k]!.y - y) / UNIT)
  }
  return e
}

/** 一处立着的身体此刻受的光：x、y 是有方向的光各按迎着它受的照度（勒克斯）乘地图平面上朝它的单位向量加起来，e 是连天光与反光在内的总照度 */
export interface Facing {
  x: number
  y: number
  e: number
}

/** 立着的身体从哪边受光：太阳、月亮按迎着它受的照度（光线在开口里、没被挡住），火把按点光源，写进 out */
export function facingAt(lt: Lighting, ceil: number, sky: SkyNow, torch: AmethystConfig['torch'], spots: readonly Point[], lits: readonly number[], x: number, y: number, out: Facing): void {
  out.x = 0
  out.y = 0
  out.e = diffuseAt(lt, x, y)
  const z = reliefAt(lt, x, y)
  for (const [dir, lux] of [
    [sky.sun, sky.sunLux],
    [sky.moon, sky.moonLux],
  ] as const) {
    if (lux <= 0) continue
    const b = lux * beamThrough(lt, ceil, x, y, z, dir)
    out.x += b * dir.x
    out.y += b * dir.y
    out.e += b
  }
  for (let k = 0; k < spots.length; k++) {
    const lit = lits[k]!
    if (lit <= 0) continue
    const dx = spots[k]!.x - x
    const dy = spots[k]!.y - y
    const d = Math.hypot(dx, dy)
    const b = (lit * torch.candela) / ((d / UNIT) ** 2 + torch.heightM ** 2)
    if (d > 0) {
      out.x += (b * dx) / d
      out.y += (b * dy) / d
    }
    out.e += b
  }
}
