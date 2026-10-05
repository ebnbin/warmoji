import { SPAWN_CLEAR_U, UNIT } from '../../util/units'
import { fbm } from '../../util/noise'
import { FRAME } from '../frame'
import { Rng } from '../../util/rng'
import { makeBasin, roomAt } from '../basin'
import type { Basin } from '../basin'
import type { Solids } from '../../ecs/worlds/solids'
import type { Landmark } from '../landmark'
import type { VolcanoConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Rect } from '../frame'

/**
 * 地形与熔岩的格子场：地面高度、熔岩厚度都以格计，温度 1 是刚喷出。
 * 格子 (0, 0) 的左上角在 (x0, y0) 像素，场铺满方框；能走的盆地另有更细的距离场。
 */
export interface LavaField {
  readonly basin: Basin
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly x0: number
  readonly y0: number
  readonly ground: Float32Array
  readonly lava: Float32Array
  readonly heat: Float32Array
  /** 凝固成岩的时刻，毫秒；从没凝固过是 -Infinity */
  readonly rockAt: Float32Array
  /** 火山口里常年不凝的熔岩湖：液面由岩浆通道撑着，流进来的熔岩也从通道里回落 */
  readonly lake: Uint8Array
  readonly lakeFloor: Float32Array
  /** 每格每秒降多少温度：离火山口越远冷得越快 */
  readonly cool: Float32Array
  readonly craterX: number
  readonly craterY: number
  /** 从火山口朝地图里的单位方向 */
  readonly inX: number
  readonly inY: number
  readonly seed: number
  readonly nextLava: Float32Array
  readonly nextHeat: Float32Array
}

/** 一次喷发熔岩从口沿外哪几格漫出、各分多少 */
export interface Spill {
  readonly cells: readonly number[]
  readonly share: readonly number[]
}

export type EruptionPhase = 'dormant' | 'warn' | 'erupt'

export interface VolcanoState {
  readonly field: LavaField
  /** 崖壁与山体：挡弹体与视线 */
  readonly solids: Solids
  /** 喷气孔：画面冒蒸汽、出怪口钻出火山怪都从这里取 */
  readonly vents: readonly Point[]
  readonly marks: VolcanoMarks
  phase: EruptionPhase
  /** 这一阶段开始的时刻 */
  since: number
  /** 下一次预兆开始的时刻 */
  nextAt: number
  spill: Spill
  count: number
  stepAcc: number
  hurtAt: number
}

const EPS = 1e-4
/** 熔岩流出场外时，场外按比这里低这么多算 */
const EDGE_DROP = 1
const DX = [1, -1, 0, 0, 1, 1, -1, -1] as const
const DY = [0, 0, 1, -1, 1, -1, 1, -1] as const
const DIST = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2] as const
const weights = new Float64Array(8)
export const NO_SPILL: Spill = { cells: [], share: [] }
/** 熔岩从口沿往外这么多格宽的一圈里漫出 */
const SPILL_CELLS = 1.5

/** 火山口：随机挑一条地图边，落在这条边的中段、离边 insetU；朝地图里的方向垂直于这条边 */
function craterOf(rng: Rng, cfg: VolcanoConfig, map: Rect): { x: number; y: number; inX: number; inY: number } {
  const side = Math.floor(rng.next() * 4)
  const along = 0.25 + rng.next() * 0.5
  const [near, far] = cfg.cone.insetU
  const inset = (near + rng.next() * (far - near)) * UNIT
  if (side === 0) return { x: map.x + along * map.w, y: map.y + inset, inX: 0, inY: 1 }
  if (side === 1) return { x: map.x + map.w - inset, y: map.y + along * map.h, inX: -1, inY: 0 }
  if (side === 2) return { x: map.x + along * map.w, y: map.y + map.h - inset, inX: 0, inY: -1 }
  return { x: map.x + inset, y: map.y + along * map.h, inX: 1, inY: 0 }
}

/**
 * 离火山口 dU 格处火山的高度：口沿最高，往外按指数陡降到挡路圈边上的山脚高度，再缓缓降到 radiusU 处与平地齐平；
 * 口里挖一个碗形的火山口，口沿微微隆起。
 */
function coneHeight(cfg: VolcanoConfig, dU: number): number {
  const c = cfg.cone
  const fall = (c.blockU - c.craterU) / Math.log(c.height / c.footHeight)
  const tail = Math.exp(-(c.radiusU - c.craterU) / fall)
  const r = Math.min(Math.max(dU, c.craterU), c.radiusU)
  const body = (c.height * (Math.exp(-(r - c.craterU) / fall) - tail)) / (1 - tail)
  const bowl = dU < c.craterU ? c.craterDepth * (1 - (dU / c.craterU) ** 2) : 0
  const rim = 0.2 * Math.exp(-(((dU - c.craterU) / 0.4) ** 2))
  return body - bowl + rim
}

/** 山坡上放射状的冲沟：按方位角的噪声取山脊形，口沿以外才有，在山脚附近最深 */
function gully(cfg: VolcanoConfig, seed: number, dx: number, dy: number, dU: number): number {
  const c = cfg.cone
  if (dU <= c.craterU || dU >= c.radiusU) return 0
  const a = Math.atan2(dy, dx)
  const n = fbm(Math.cos(a) * 2.2 + 17, Math.sin(a) * 2.2 + dU * 0.12, seed + 31, 2)
  const ridge = 1 - Math.abs(n * 2 - 1)
  const along = Math.sin(Math.PI * ((dU - c.craterU) / (c.radiusU - c.craterU)) ** 0.55)
  return c.gullyDepth * ridge ** 3 * along
}

/** 方形地图里离四条边多远，格，角按 cornerU 的半径磨圆；地图外为负 */
function edgeDepthU(x: number, y: number, map: Rect, cornerU: number): number {
  const qx = Math.min(x - map.x, map.x + map.w - x) / UNIT
  const qy = Math.min(y - map.y, map.y + map.h - y) / UNIT
  if (qx >= 0 && qy >= 0 && qx < cornerU && qy < cornerU) return cornerU - Math.hypot(cornerU - qx, cornerU - qy)
  return Math.min(qx, qy)
}

/** 噪声拉开对比度落到 [0, 1]：分形噪声大多挤在中间 */
function spread01(n: number): number {
  return Math.min(1, Math.max(0, (n - 0.5) * 2.4 + 0.5))
}

/** 盆地的边在这里离方形地图的边多远，格 */
function rimInsetU(cfg: VolcanoConfig, seed: number, x: number, y: number): number {
  const r = cfg.rim
  return r.insetU[0] + (r.insetU[1] - r.insetU[0]) * spread01(fbm(x / UNIT / r.waveU, y / UNIT / r.waveU, seed + 101, 2))
}

/** 山脚在方位角 a 上离火山口多远，格 */
function footU(cfg: VolcanoConfig, seed: number, a: number): number {
  const c = cfg.cone
  return c.blockU * (1 + c.blockJitter * (spread01(fbm(Math.cos(a) * 1.6 + 3, Math.sin(a) * 1.6 + 7, seed + 111, 2)) * 2 - 1))
}

/** 陷进盆地边外 depthU 格处的崖壁与高地：从崖脚陡升到崖顶，再往外缓缓下降；崖高按 tall 在六成到一倍四之间起伏 */
function rimRise(cfg: VolcanoConfig, depthU: number, tall: number): number {
  const r = cfg.rim
  if (depthU <= 0) return 0
  const t = Math.min(1, depthU / r.cliffU)
  return r.cliffHeight * (0.6 + 0.8 * tall) * t * t * (3 - 2 * t) - r.backSlope * Math.max(0, depthU - r.cliffU)
}

/**
 * 按种子生成地形：先定下能走的盆地（地图矩形里起伏的边，扣掉山体，出生点四周总空着），再铺高度：火山加上朝地图里的整体下倾与起伏，
 * 盆地边外立起崖壁与高地（靠近火山处让给山体）；火山口里灌上熔岩湖，再补上开局前那几次喷发留下的岩石。格子铺满方框
 */
export function makeField(rng: Rng, cfg: VolcanoConfig, map: Rect, spawn: Point): LavaField {
  const cell = cfg.cellU * UNIT
  const cols = Math.ceil(FRAME.w / cell)
  const rows = Math.ceil(FRAME.h / cell)
  const n = cols * rows
  const c = craterOf(rng, cfg, map)
  const seed = Math.floor(rng.next() * 0x7fffffff)
  const cone = cfg.cone
  const open = (x: number, y: number): boolean =>
    Math.hypot(x - spawn.x, y - spawn.y) < SPAWN_CLEAR_U * UNIT ||
    (edgeDepthU(x, y, map, cfg.rim.cornerU) > rimInsetU(cfg, seed, x, y) && Math.hypot(x - c.x, y - c.y) / UNIT > footU(cfg, seed, Math.atan2(y - c.y, x - c.x)))
  const basin = makeBasin(open, FRAME.x, FRAME.y, cols * 2, rows * 2, cell / 2, spawn, cfg.rim.neckU * UNIT)
  const f: LavaField = {
    basin,
    cols,
    rows,
    cell,
    x0: FRAME.x,
    y0: FRAME.y,
    ground: new Float32Array(n),
    lava: new Float32Array(n),
    heat: new Float32Array(n),
    rockAt: new Float32Array(n).fill(-Infinity),
    lake: new Uint8Array(n),
    lakeFloor: new Float32Array(n),
    cool: new Float32Array(n),
    craterX: c.x,
    craterY: c.y,
    inX: c.inX,
    inY: c.inY,
    seed,
    nextLava: new Float32Array(n),
    nextHeat: new Float32Array(n),
  }
  const t = cfg.terrain
  const lakeLevel = cone.height - cone.craterDepth + cone.lakeDepth
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      const x = f.x0 + (cx + 0.5) * cell
      const y = f.y0 + (cy + 0.5) * cell
      const dx = (x - c.x) / UNIT
      const dy = (y - c.y) / UNIT
      const dU = Math.hypot(dx, dy)
      const foot = footU(cfg, seed, Math.atan2(dy, dx))
      const dCone = dU <= cone.craterU ? dU : cone.craterU + ((dU - cone.craterU) * (cone.blockU - cone.craterU)) / (foot - cone.craterU)
      const relief = (fbm(x / UNIT / t.waveU, y / UNIT / t.waveU, seed, 3) - 0.5) * 2 * t.relief
      const outside = Math.min(1, Math.max(0, dU / cone.craterU - 1))
      const tall = spread01(fbm(x / UNIT / 4, y / UNIT / 4, seed + 127, 2))
      const bank = rimRise(cfg, -roomAt(basin, x, y) / UNIT, tall) * Math.min(1, Math.max(0, (dU - foot - 0.5) / 2))
      const g =
        coneHeight(cfg, dCone) - gully(cfg, seed, dx, dy, dCone) + (relief * Math.min(1, dU / cone.radiusU) - t.tilt * (dx * c.inX + dy * c.inY)) * outside + bank
      f.ground[i] = g
      f.cool[i] = cfg.lava.cooling * (1 + (dU / cfg.lava.coolRadiusU) ** 2)
      if (dU < cone.craterU * 0.8) {
        f.lake[i] = 1
        f.lakeFloor[i] = Math.max(EPS * 2, lakeLevel - g)
        f.lava[i] = f.lakeFloor[i]!
        f.heat[i] = 1
      }
    }
  }
  for (let k = 0; k < cfg.eruption.history; k++) runEruption(f, cfg, spillOf(f, cfg, rng), -1e9)
  return f
}

/** 有几个喷气孔 */
export const VENT_COUNT = 5
/** 喷气孔口子的半径，格 */
const VENT_U = 0.45
/** 头目下山的起点：朝盆地那一侧的山坡上，离火山口占挡路圈半径的这么多 */
const FOOT_ON = 0.85

/** 冒硫磺蒸汽的喷气孔：山脚外朝盆地的那一侧有几个，落在盆地里 */
export function fumaroles(f: LavaField, cfg: VolcanoConfig, count: number): Point[] {
  const rng = new Rng(f.seed ^ 0x51f0)
  const out: Point[] = []
  const base = Math.atan2(f.inY, f.inX)
  for (let k = 0; k < count * 8 && out.length < count; k++) {
    const a = base + (rng.next() * 2 - 1) * 1.3
    const r = (cfg.cone.blockU + 0.8 + rng.next() * 5) * UNIT
    const p = { x: f.craterX + Math.cos(a) * r, y: f.craterY + Math.sin(a) * r }
    if (roomAt(f.basin, p.x, p.y) >= 0.6 * UNIT) out.push(p)
  }
  return out
}

/** 火山给出怪口的地标，按组：山体（cone，别的出怪口离它远些）、喷气孔、头目下山的山坡（foot）；火山口只在喷发时有 */
export interface VolcanoMarks {
  readonly calm: Readonly<Record<string, readonly Landmark[]>>
  readonly erupt: Readonly<Record<string, readonly Landmark[]>>
}

export function volcanoMarks(f: LavaField, cfg: VolcanoConfig, vents: readonly Point[]): VolcanoMarks {
  const c = cfg.cone
  const cone: Landmark = { x: f.craterX, y: f.craterY, r: c.blockU * (1 + c.blockJitter) * UNIT, nx: 0, ny: 0 }
  const vent = vents.map((p): Landmark => ({ x: p.x, y: p.y, r: VENT_U * UNIT, nx: 0, ny: 0 }))
  const foot: Landmark = { x: f.craterX + f.inX * c.blockU * FOOT_ON * UNIT, y: f.craterY + f.inY * c.blockU * FOOT_ON * UNIT, r: 0, nx: f.inX, ny: f.inY }
  const crater: Landmark = { x: f.craterX, y: f.craterY, r: 0, nx: f.inX, ny: f.inY }
  const calm = { cone: [cone], vent, foot: [foot], crater: [] }
  return { calm, erupt: { ...calm, crater: [crater] } }
}

/** 这次喷发熔岩从口沿外那一圈格子漫出：随机几股集中、大多朝着盆地，其余方向只漫出一点 */
export function spillOf(f: LavaField, cfg: VolcanoConfig, rng: Rng): Spill {
  const e = cfg.eruption
  const count = e.lobes[0] + Math.floor(rng.next() * (e.lobes[1] - e.lobes[0] + 1))
  const lobes: number[] = []
  const toward = Math.atan2(f.inY, f.inX)
  for (let k = 0; k < count; k++) lobes.push(toward + (rng.next() * 2 - 1) * ((e.lobeSpreadDeg * Math.PI) / 180))
  const width = (e.lobeDeg * Math.PI) / 180
  const r0 = cfg.cone.craterU * UNIT
  const r1 = r0 + SPILL_CELLS * f.cell
  const cells: number[] = []
  const share: number[] = []
  let sum = 0
  const c0 = Math.max(0, Math.floor((f.craterX - r1 - f.x0) / f.cell))
  const c1 = Math.min(f.cols - 1, Math.ceil((f.craterX + r1 - f.x0) / f.cell))
  const w0 = Math.max(0, Math.floor((f.craterY - r1 - f.y0) / f.cell))
  const w1 = Math.min(f.rows - 1, Math.ceil((f.craterY + r1 - f.y0) / f.cell))
  for (let cy = w0; cy <= w1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const dx = f.x0 + (cx + 0.5) * f.cell - f.craterX
      const dy = f.y0 + (cy + 0.5) * f.cell - f.craterY
      const d = Math.hypot(dx, dy)
      if (d < r0 || d >= r1) continue
      const a = Math.atan2(dy, dx)
      let w = e.lobeFloor
      for (const m of lobes) w += Math.exp(-((Math.atan2(Math.sin(a - m), Math.cos(a - m)) / width) ** 2))
      cells.push(cy * f.cols + cx)
      share.push(w)
      sum += w
    }
  }
  return { cells, share: share.map((w) => w / sum) }
}

/** 喷发开始 ms 毫秒时熔岩漫过口沿的流量，格³/秒 */
export function effusion(e: VolcanoConfig['eruption'], ms: number): number {
  if (ms < 0 || ms >= e.effuseMs) return 0
  return ms < e.peakMs ? (e.rate * ms) / e.peakMs : e.rate * Math.exp(-(ms - e.peakMs) / e.waneMs)
}

/** 喷发开始 ms 毫秒时这一步漫出的熔岩，折成一格的厚度 */
export function spillVolume(cfg: VolcanoConfig, ms: number): number {
  return (effusion(cfg.eruption, ms) * cfg.lava.stepMs) / 1000 / cfg.cellU ** 2
}

/** 开局前的一次喷发：出完熔岩后一直积分到全部凝固，凝固时刻记成 at */
function runEruption(f: LavaField, cfg: VolcanoConfig, spill: Spill, at: number): void {
  const step = cfg.lava.stepMs
  for (let ms = 0; ms < cfg.eruption.effuseMs; ms += step) stepLava(f, cfg.lava, step / 1000, at, spill, spillVolume(cfg, ms))
  for (let s = 0; s < 3000 && hasFlow(f); s++) stepLava(f, cfg.lava, step / 1000, at, NO_SPILL, 0)
}

function hasFlow(f: LavaField): boolean {
  for (let i = 0; i < f.lava.length; i++) if (f.lava[i]! > 0 && !f.lake[i]) return true
  return false
}

/**
 * 积分一步。熔岩按宾汉流体流动：朝一个邻格流，厚度要超过屈服强度除以那个方向的坡度，坡越缓要堆得越厚；
 * 超出的部分乘坡度作为分量，按分量分给更低的邻格，一步最多流走一半高差。越冷屈服强度越大、流得越慢，
 * 离火山口越远冷得越快，低于凝固温度就把厚度加进地面变成岩石；陡坡上流干的地方也留下一层岩壳。
 * 熔岩湖一直是热的，液面不变。
 */
export function stepLava(f: LavaField, c: VolcanoConfig['lava'], dt: number, now: number, spill: Spill, volume: number): void {
  const { cols, rows, ground, lava, heat, nextLava, nextHeat, lake } = f
  const cellU = f.cell / UNIT
  for (let i = 0; i < lava.length; i++) {
    nextLava[i] = lava[i]!
    nextHeat[i] = lava[i]! * heat[i]!
  }
  for (let k = 0; k < spill.cells.length; k++) {
    const v = spill.cells[k]!
    const q = volume * spill.share[k]!
    nextLava[v] = nextLava[v]! + q
    nextHeat[v] = nextHeat[v]! + q
  }
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      const l = lava[i]!
      if (l <= EPS) continue
      const t = heat[i]!
      const strength = c.yieldHot + (c.yieldCold - c.yieldHot) * (1 - t) * (1 - t)
      const z = ground[i]! + l
      let sum = 0
      let maxDrop = 0
      let excess = 0
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k]!
        const ny = cy + DY[k]!
        const zj = nx < 0 || ny < 0 || nx >= cols || ny >= rows ? ground[i]! - EDGE_DROP : ground[ny * cols + nx]! + lava[ny * cols + nx]!
        const drop = z - zj
        const slope = drop / (DIST[k]! * cellU)
        const avail = slope > 0 ? l - strength / slope : 0
        if (avail <= 0) {
          weights[k] = 0
          continue
        }
        weights[k] = (avail * slope) ** 2
        sum += weights[k]!
        if (drop > maxDrop) maxDrop = drop
        if (avail > excess) excess = avail
      }
      if (sum <= 0) continue
      const rate = 1 - Math.exp(-c.mobility * t ** c.mobilityPow * dt)
      const out = Math.min(excess, maxDrop * 0.5) * rate
      if (out <= 0) continue
      nextLava[i] = nextLava[i]! - out
      nextHeat[i] = nextHeat[i]! - out * t
      for (let k = 0; k < 8; k++) {
        const w = weights[k]!
        if (w <= 0) continue
        const nx = cx + DX[k]!
        const ny = cy + DY[k]!
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        const j = ny * cols + nx
        const q = (out * w) / sum
        nextLava[j] = nextLava[j]! + q
        nextHeat[j] = nextHeat[j]! + q * t
      }
    }
  }
  for (let i = 0; i < lava.length; i++) {
    if (lake[i]) {
      lava[i] = f.lakeFloor[i]!
      heat[i] = 1
      continue
    }
    const l = nextLava[i]!
    if (l <= EPS) {
      if (l > 0) ground[i] = ground[i]! + l
      if (lava[i]! > 0) f.rockAt[i] = now
      lava[i] = 0
      heat[i] = 0
      continue
    }
    const t = nextHeat[i]! / l - dt * f.cool[i]!
    if (t < c.solidus) {
      ground[i] = ground[i]! + l
      lava[i] = 0
      heat[i] = 0
      f.rockAt[i] = now
      continue
    }
    lava[i] = l
    heat[i] = Math.min(1, t)
  }
}

/** 这一点脚下是不是还没凝固的熔岩 */
export function moltenAt(f: LavaField, x: number, y: number): boolean {
  const cx = Math.floor((x - f.x0) / f.cell)
  const cy = Math.floor((y - f.y0) / f.cell)
  if (cx < 0 || cy < 0 || cx >= f.cols || cy >= f.rows) return false
  return f.lava[cy * f.cols + cx]! > 0
}

/**
 * 从 (x, y) 朝 (tx, ty) 走的方向：直线穿过半径 r 的挡路圈时改走切线绕过去，圈不大过两点离火山口的距离。
 * 山体压着地图边、背后没有路，所以按两点绕火山口的方位角（朝地图里为 0），从自己这边经朝地图里的那一侧转向目标那边。
 */
export function around(f: LavaField, r: number, x: number, y: number, tx: number, ty: number): Point {
  const vx = tx - x
  const vy = ty - y
  const len = Math.hypot(vx, vy)
  if (len === 0) return { x: 0, y: 0 }
  const ux = vx / len
  const uy = vy / len
  const ox = f.craterX - x
  const oy = f.craterY - y
  const od = Math.hypot(ox, oy)
  const rs = Math.min(r, od, Math.hypot(tx - f.craterX, ty - f.craterY)) * 0.999
  const along = ox * ux + oy * uy
  if (along <= 0 || along >= len || Math.abs(ox * uy - oy * ux) >= rs) return { x: ux, y: uy }
  const half = Math.asin(rs / od)
  const bearing = (px: number, py: number): number =>
    Math.atan2(f.inX * (py - f.craterY) - f.inY * (px - f.craterX), f.inX * (px - f.craterX) + f.inY * (py - f.craterY))
  const a = Math.atan2(oy, ox) + (bearing(tx, ty) > bearing(x, y) ? -half : half)
  return { x: Math.cos(a), y: Math.sin(a) }
}
