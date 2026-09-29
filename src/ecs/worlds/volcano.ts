import { UNIT } from '../../util/units'
import { fbm } from '../../util/noise'
import type { VolcanoConfig } from '../../types/maps'
import type { Rng } from '../../util/rng'

/**
 * 地形与熔岩的格子场：地面高度、熔岩厚度都以格计，温度 1 是刚喷出。
 * 格子 (0, 0) 的左上角在 (x0, y0) 像素，场比地图大出镜头能看到的一圈。
 */
export interface LavaField {
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
  /** 火山口里常年不凝的熔岩湖，与岩浆通道撑住的湖面下的深度 */
  readonly lake: Uint8Array
  readonly lakeFloor: Float32Array
  readonly craterX: number
  readonly craterY: number
  /** 从火山口朝地图里的单位方向 */
  readonly inX: number
  readonly inY: number
  readonly seed: number
  readonly nextLava: Float32Array
  readonly nextHeat: Float32Array
}

export type EruptionPhase = 'dormant' | 'warn' | 'erupt'

export interface VolcanoState {
  readonly field: LavaField
  phase: EruptionPhase
  /** 这一阶段开始的时刻 */
  since: number
  /** 下一次预兆开始的时刻 */
  nextAt: number
  /** 这次喷发的喷口，像素，与熔岩涌出的那几格 */
  ventX: number
  ventY: number
  vent: readonly number[]
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
export const NO_VENT: readonly number[] = []

/** 火山口：随机挑一条地图边，落在这条边的中段、离边 insetU；朝地图里的方向垂直于这条边 */
function craterOf(rng: Rng, cfg: VolcanoConfig, mapW: number, mapH: number): { x: number; y: number; inX: number; inY: number } {
  const side = Math.floor(rng.next() * 4)
  const along = 0.25 + rng.next() * 0.5
  const [near, far] = cfg.cone.insetU
  const inset = (near + rng.next() * (far - near)) * UNIT
  if (side === 0) return { x: along * mapW, y: inset, inX: 0, inY: 1 }
  if (side === 1) return { x: mapW - inset, y: along * mapH, inX: -1, inY: 0 }
  if (side === 2) return { x: along * mapW, y: mapH - inset, inX: 0, inY: -1 }
  return { x: inset, y: along * mapH, inX: 1, inY: 0 }
}

/** 离火山口 dU 格处火山锥的高度：山顶平台上挖一个碗形的火山口，口沿微微隆起，口外的山坡往外凹着降下去 */
function coneHeight(cfg: VolcanoConfig, dU: number): number {
  const c = cfg.cone
  const s = Math.max(0, dU - c.craterU) / (c.radiusU - c.craterU)
  const body = s < 1 ? c.height * (1 - s) ** 1.7 : 0
  const bowl = dU < c.craterU ? c.craterDepth * (1 - (dU / c.craterU) ** 2) : 0
  const rim = 0.25 * Math.exp(-(((dU - c.craterU) / 0.45) ** 2))
  return body - bowl + rim
}

/** 火山锥上放射状的冲沟：按方位角的噪声取山脊形，口沿以外才有，越往山脚越浅 */
function gully(cfg: VolcanoConfig, seed: number, dx: number, dy: number, dU: number): number {
  const c = cfg.cone
  if (dU <= c.craterU || dU >= c.radiusU) return 0
  const a = Math.atan2(dy, dx)
  const n = fbm(Math.cos(a) * 2.2 + 17, Math.sin(a) * 2.2 + dU * 0.12, seed + 31, 2)
  const ridge = 1 - Math.abs(n * 2 - 1)
  const along = Math.sin((Math.PI * (dU - c.craterU)) / (c.radiusU - c.craterU))
  return c.gullyDepth * ridge ** 3 * along
}

/** 按种子生成地形：火山锥加上朝地图里的整体下倾与起伏；火山口里灌上熔岩湖，再补上开局前那几次喷发留下的岩石 */
export function makeField(rng: Rng, cfg: VolcanoConfig, mapW: number, mapH: number, marginPx: number): LavaField {
  const cell = cfg.cellU * UNIT
  const cols = Math.ceil((mapW + marginPx * 2) / cell)
  const rows = Math.ceil((mapH + marginPx * 2) / cell)
  const n = cols * rows
  const c = craterOf(rng, cfg, mapW, mapH)
  const seed = Math.floor(rng.next() * 0x7fffffff)
  const f: LavaField = {
    cols,
    rows,
    cell,
    x0: -marginPx,
    y0: -marginPx,
    ground: new Float32Array(n),
    lava: new Float32Array(n),
    heat: new Float32Array(n),
    rockAt: new Float32Array(n).fill(-Infinity),
    lake: new Uint8Array(n),
    lakeFloor: new Float32Array(n),
    craterX: c.x,
    craterY: c.y,
    inX: c.inX,
    inY: c.inY,
    seed,
    nextLava: new Float32Array(n),
    nextHeat: new Float32Array(n),
  }
  const t = cfg.terrain
  const lakeLevel = cfg.cone.height - cfg.cone.craterDepth + cfg.cone.lakeDepth
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      const x = f.x0 + (cx + 0.5) * cell
      const y = f.y0 + (cy + 0.5) * cell
      const dx = (x - c.x) / UNIT
      const dy = (y - c.y) / UNIT
      const dU = Math.hypot(dx, dy)
      const relief = (fbm(x / UNIT / t.waveU, y / UNIT / t.waveU, seed, 3) - 0.5) * 2 * t.relief
      const outside = Math.min(1, Math.max(0, dU / cfg.cone.craterU - 1))
      const g = coneHeight(cfg, dU) - gully(cfg, seed, dx, dy, dU) + (relief * Math.min(1, dU / cfg.cone.radiusU) - t.tilt * (dx * c.inX + dy * c.inY)) * outside
      f.ground[i] = g
      if (dU < cfg.cone.craterU * 0.8) {
        f.lake[i] = 1
        f.lava[i] = Math.max(EPS * 2, lakeLevel - g)
        f.heat[i] = 1
        f.lakeFloor[i] = lakeLevel - g
      }
    }
  }
  for (let k = 0; k < cfg.eruption.history; k++) {
    const v = pickVent(f, cfg, rng)
    runEruption(f, cfg, fissureCells(f, v.x, v.y, cfg.eruption.fissureU), -1e9)
  }
  return f
}

/** 喷口：朝地图里的方向两侧 spreadDeg 内，离火山口 ventU 之间 */
export function pickVent(f: LavaField, cfg: VolcanoConfig, rng: Rng): { x: number; y: number } {
  const e = cfg.eruption
  const a = Math.atan2(f.inY, f.inX) + (rng.next() * 2 - 1) * ((e.spreadDeg * Math.PI) / 180)
  const r = (e.ventU[0] + rng.next() * (e.ventU[1] - e.ventU[0])) * UNIT
  return { x: f.craterX + Math.cos(a) * r, y: f.craterY + Math.sin(a) * r }
}

function cellAt(f: LavaField, x: number, y: number): number {
  const cx = Math.min(f.cols - 1, Math.max(0, Math.floor((x - f.x0) / f.cell)))
  const cy = Math.min(f.rows - 1, Math.max(0, Math.floor((y - f.y0) / f.cell)))
  return cy * f.cols + cx
}

/** 喷口是顺着山坡裂开的一道缝：从 (x, y) 往外 lengthU 格上的格子，熔岩均分到这些格子里 */
export function fissureCells(f: LavaField, x: number, y: number, lengthU: number): number[] {
  const dx = x - f.craterX
  const dy = y - f.craterY
  const d = Math.hypot(dx, dy) || 1
  const cells: number[] = []
  const n = Math.max(1, Math.ceil((lengthU * UNIT) / (f.cell * 0.5)))
  for (let k = 0; k < n; k++) {
    const c = cellAt(f, x + (dx / d) * (k / n) * lengthU * UNIT, y + (dy / d) * (k / n) * lengthU * UNIT)
    if (!cells.includes(c)) cells.push(c)
  }
  return cells
}

/** 一步从喷口涌出的熔岩，折成喷口那一格的厚度 */
export function ventVolume(cfg: VolcanoConfig): number {
  return (cfg.eruption.rate * cfg.lava.stepMs) / 1000 / cfg.cellU ** 2
}

/** 开局前的一次喷发：出完熔岩后一直积分到全部凝固，凝固时刻记成 at */
function runEruption(f: LavaField, cfg: VolcanoConfig, vent: readonly number[], at: number): void {
  const dt = cfg.lava.stepMs / 1000
  const volume = ventVolume(cfg)
  const steps = Math.ceil(cfg.eruption.effuseMs / cfg.lava.stepMs)
  for (let s = 0; s < steps; s++) stepLava(f, cfg.lava, dt, at, vent, volume)
  for (let s = 0; s < 3000 && hasFlow(f); s++) stepLava(f, cfg.lava, dt, at, NO_VENT, 0)
}

function hasFlow(f: LavaField): boolean {
  for (let i = 0; i < f.lava.length; i++) if (f.lava[i]! > 0 && !f.lake[i]) return true
  return false
}

/**
 * 积分一步。熔岩按宾汉流体流动：朝一个邻格流，厚度要超过屈服强度除以那个方向的坡度，坡越缓要堆得越厚；
 * 超出的部分乘坡度作为分量，按分量分给更低的邻格，一步最多流走一半高差。越冷屈服强度越大、流得越慢，
 * 越薄冷得越快，低于凝固温度就把厚度加进地面变成岩石。熔岩湖一直是热的，湖面由岩浆通道撑住不会漏干。
 */
export function stepLava(f: LavaField, c: VolcanoConfig['lava'], dt: number, now: number, vent: readonly number[], volume: number): void {
  const { cols, rows, ground, lava, heat, nextLava, nextHeat, lake } = f
  const cellU = f.cell / UNIT
  for (let i = 0; i < lava.length; i++) {
    nextLava[i] = lava[i]!
    nextHeat[i] = lava[i]! * heat[i]!
  }
  const share = vent.length > 0 ? volume / vent.length : 0
  for (const v of vent) {
    nextLava[v] = nextLava[v]! + share
    nextHeat[v] = nextHeat[v]! + share
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
    const l = nextLava[i]!
    if (l <= EPS) {
      if (l > 0) ground[i] = ground[i]! + l
      lava[i] = 0
      heat[i] = 0
      continue
    }
    let t = nextHeat[i]! / l
    if (lake[i]) {
      t = 1
      nextLava[i] = Math.max(l, f.lakeFloor[i]!)
    } else t -= (dt * c.cooling * (0.2 + t * t)) / (l + c.coolDepth)
    if (!lake[i] && t < c.solidus) {
      ground[i] = ground[i]! + l
      lava[i] = 0
      heat[i] = 0
      f.rockAt[i] = now
      continue
    }
    lava[i] = nextLava[i]!
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
