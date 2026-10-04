import { UNIT } from '../../util/units.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin, roomAt } from '../worlds/basin.ts'
import { textWidth } from './font.ts'
import type { Basin } from '../worlds/basin'
import type { CircuitConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 能走的地面按这么细的格子算距离场，格 */
const BASIN_CELL_U = 0.25
/** 带电的铜按这么细的格子记下离铜多远、沿铜走了多远，格；电流着色器的数据图也按它一格一个像素 */
export const COPPER_CELL_U = 0.125
/** 离带电的铜这么远（格）以外不记：光晕和触电都够不着 */
export const COPPER_REACH_U = 3
/** 电流着色器把沿铜的距离按这么长（格）编进两个通道，网络状态图能放这么多条网络 */
export const ALONG_SPAN_U = 32
export const NET_SLOTS = 16
/** 布线按这么细的格子走，格 */
const ROUTE_CELL_U = 0.25
/** 屏蔽罩的罩壁多厚、往罩里折进来的边多宽，格 */
export const FRAME_WALL_U = 0.32
export const FRAME_LIP_U = 0.55
/** 身体离罩壁内侧、元件这么近（格）就算碰上 */
const FRAME_CLEAR_U = 0.1
const PART_CLEAR_U = 0.06
/** 电极：从根到尖多长、多宽（格），多高（毫米）；靠芯片那根离芯片的焊盘多远（格） */
export const ELECTRODE = { len: 0.8, wid: 1, zMM: 0.7, gapU: 0.3 } as const
/** 带电的线离罩壁、离元件、离别的带电的铜至少多远（格）；开局空地外再让开多远 */
const WALL_KEEP_U = 1.4
const PART_KEEP_U = 0.45
const NET_GAP_U = 1.1
const PLAZA_KEEP_U = 0.5
/** 阻焊层下的细线：线宽，离元件、离带电的铜、离罩壁至少多远（格） */
const SIGNAL_U = 0.3
const SIGNAL_KEEP = { part: 0.3, hazard: 0.55, wall: 0.7, other: 0.3 } as const
/** 布线拐 45° 与拐 90° 各多算多远（格）：走成长直线、拐角多用 45° */
const TURN45_U = 0.9
const TURN90_U = 3.5
/** 一次寻路最多展开这么多状态，再多就当走不通 */
const ROUTE_BUDGET = 400_000
/** 生成不出合格的电路板就换一组随机数重来，最多这么多次 */
const TRIES = 40

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)

/** 种子打散：相邻的种子也生成很不一样的电路板 */
function scramble(seed: number): number {
  let h = Math.imul((seed ^ 0x5bd1e995) >>> 0, 0x297a2d39)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

function between(rng: Rng, r: readonly [number, number]): number {
  return r[0] + (r[1] - r[0]) * rng.next()
}

/** 屏蔽罩围出的能走的板面：罩壁内侧的长方形，四个角斜切掉 cut（左上、右上、右下、左下），格 */
export interface Arena {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
  readonly cut: readonly [number, number, number, number]
}

/** (x, y) 离罩壁内侧多远，格，罩外为负（罩外的值只是下界） */
export function arenaRoom(a: Arena, x: number, y: number): number {
  const s = Math.SQRT1_2
  return Math.min(
    x - a.x0,
    a.x1 - x,
    y - a.y0,
    a.y1 - y,
    (x - a.x0 + y - a.y0 - a.cut[0]) * s,
    (a.x1 - x + y - a.y0 - a.cut[1]) * s,
    (a.x1 - x + a.y1 - y - a.cut[2]) * s,
    (x - a.x0 + a.y1 - y - a.cut[3]) * s,
  )
}

/** 元件：芯片、贴片电阻电容、发光管、电解电容、电感、晶振、MOS 管和电极；都是正着摆的 */
export type PartKind = 'ic' | 'sot' | 'res' | 'cap' | 'led' | 'can' | 'coil' | 'xtal' | 'electrode'

/** 焊盘：中心与半宽半高（格），朝哪边伸出去；lead 是芯片的引脚压在上面 */
export interface Pad {
  readonly x: number
  readonly y: number
  readonly hw: number
  readonly hh: number
  readonly nx: number
  readonly ny: number
  readonly lead: boolean
}

/**
 * 一个元件：本体中心、半宽半高与高（格），长边顺着 x（axis 0）还是 y（axis 1）；连焊盘在内挡人的范围（bw、bh 是半宽半高）；
 * 丝印的位号与本体上印的字；电解电容的负极、电极的尖朝哪边
 */
export interface Part {
  readonly kind: PartKind
  readonly x: number
  readonly y: number
  readonly hw: number
  readonly hh: number
  readonly z: number
  readonly axis: 0 | 1
  readonly bw: number
  readonly bh: number
  readonly pads: readonly Pad[]
  readonly ref: string
  readonly mark: string
  readonly dx: number
  readonly dy: number
  /** 在屏蔽罩里：挡人、算进能走的地面；罩外的只是布景 */
  readonly inside: boolean
}

/** 一条走线：折线、线宽（格）；net 是带电的网络，−1 是阻焊层下不带电的细线 */
export interface Trace {
  readonly pts: readonly Point[]
  readonly w: number
  readonly net: number
}

/** 一块裸铜板：四角斜切掉 cut，格 */
export interface Plate {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
  readonly cut: number
  readonly net: number
}

/** 过孔：外圈半径与孔半径（格）；open 的露着金，否则盖在阻焊层下 */
export interface Via {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly hole: number
  readonly open: boolean
}

/** 一行丝印字：中心、字高（格）；rot 0 从左往右读，1 从下往上读 */
export interface Label {
  readonly s: string
  readonly x: number
  readonly y: number
  readonly size: number
  readonly rot: 0 | 1
}

/** 一笔丝印线：折线、线宽（格），dash 不为 0 时画成虚线（实一段空一段，各 dash 格） */
export interface Mark {
  readonly pts: readonly Point[]
  readonly w: number
  readonly dash: number
}

/** 贴在板上的条码纸：中心、宽高（格），竖着贴时 rot 为 1；印的编号 */
export interface Sticker {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly rot: 0 | 1
  readonly code: string
}

/** 板面上的一块长方形，格 */
export interface Box {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/** 丝印的高压警示：三角里一道闪电，中心与边长（格） */
export interface Warning {
  readonly x: number
  readonly y: number
  readonly size: number
}

/** 带电的网络：电源线一直通，时钟线按节拍通，开关线踩了才通；电从 sources 进来，沿铜走到最远处 length 格 */
export type NetKind = 'rail' | 'clock' | 'button'

export interface Net {
  readonly kind: NetKind
  readonly sources: readonly Point[]
  readonly length: number
  /** 时钟线是第几个时钟、开关线是第几个开关；电源线是 −1 */
  readonly driver: number
}

/** 时钟：哪几条网络归它管，指示灯在哪，节拍错开多少毫秒 */
export interface Clock {
  readonly nets: readonly number[]
  readonly led: Point
  readonly chip: Point
  readonly phaseMs: number
}

/** 一处电弧：两根电极的尖（a 靠墙，b 靠芯片），蓄电的电容在哪，节拍错开多少毫秒 */
export interface Gap {
  readonly a: Point
  readonly b: Point
  readonly cap: Point
  readonly phaseMs: number
}

/** 触摸开关：盘心与半径（格），它管的网络，连着的铜板 */
export interface Button {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly net: number
  readonly plate: Plate
}

/**
 * 带电的铜：细格子上每格离哪个网络的铜最近（COPPER_REACH_U 以外是 −1）、离那片铜多远（格，铜里为负）、
 * 那片铜上离这里最近的地方沿铜离电源多远（格）；格子 (0, 0) 的左上角在 (x0, y0)
 */
export interface CopperGrid {
  readonly x0: number
  readonly y0: number
  readonly cell: number
  readonly cols: number
  readonly rows: number
  readonly net: Int8Array
  readonly dist: Float32Array
  readonly along: Float32Array
}

/** 按种子生成的一块电路板：全是数据，能整个发给画画的线程 */
export interface CircuitPlan {
  readonly size: number
  readonly seed: number
  readonly arena: Arena
  readonly basin: Basin
  readonly start: Point
  readonly parts: readonly Part[]
  readonly traces: readonly Trace[]
  readonly plates: readonly Plate[]
  readonly vias: readonly Via[]
  readonly labels: readonly Label[]
  readonly marks: readonly Mark[]
  readonly warnings: readonly Warning[]
  readonly fiducials: readonly Point[]
  readonly holes: readonly Point[]
  readonly testpoints: readonly Point[]
  readonly sticker: Sticker | null
  /** 标题那一块不铺铜 */
  readonly keepout: Box
  readonly nets: readonly Net[]
  readonly clocks: readonly Clock[]
  readonly gaps: readonly Gap[]
  readonly buttons: readonly Button[]
  readonly copper: CopperGrid
}

/** 单位方向 */
function norm2(x: number, y: number): Point {
  const l = Math.hypot(x, y) || 1
  return { x: x / l, y: y / l }
}

/** 点到线段的距离 */
export function segDist(ax: number, ay: number, bx: number, by: number, x: number, y: number): number {
  const ex = bx - ax
  const ey = by - ay
  const l2 = ex * ex + ey * ey || 1e-12
  const t = clamp01(((x - ax) * ex + (y - ay) * ey) / l2)
  const dx = x - ax - ex * t
  const dy = y - ay - ey * t
  return Math.sqrt(dx * dx + dy * dy)
}

/** 点到折线的距离 */
export function polylineDist(pts: readonly Point[], x: number, y: number): number {
  let d = Infinity
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(pts[i - 1]!.x, pts[i - 1]!.y, pts[i]!.x, pts[i]!.y, x, y))
  return d
}

/** 到中心 (cx, cy)、半宽半高 (hw, hh) 的长方形的有符号距离，里面为负 */
export function boxDist(cx: number, cy: number, hw: number, hh: number, x: number, y: number): number {
  const qx = Math.abs(x - cx) - hw
  const qy = Math.abs(y - cy) - hh
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
}

/** 到铜板的有符号距离：长方形再切掉四个角 */
export function plateDist(p: Plate, x: number, y: number): number {
  const cx = (p.x0 + p.x1) / 2
  const cy = (p.y0 + p.y1) / 2
  const hw = (p.x1 - p.x0) / 2
  const hh = (p.y1 - p.y0) / 2
  const box = boxDist(cx, cy, hw, hh, x, y)
  const corner = (Math.abs(x - cx) + Math.abs(y - cy) - (hw + hh - p.cut)) * Math.SQRT1_2
  return Math.max(box, corner)
}

/** 元件挡人的范围的有符号距离（电解电容按圆，其余按长方形） */
export function partDist(p: Part, x: number, y: number): number {
  if (p.kind === 'can') return Math.max(Math.hypot(x - p.x, y - p.y) - p.hw, boxDist(p.x, p.y, p.bw, p.bh, x, y))
  return boxDist(p.x, p.y, p.bw, p.bh, x, y)
}

/** 以电路板中心为原点的一套坐标：u、v 各沿一条地图轴（可能反过来），四面罩壁在 u = ±hu、v = ±hv */
interface Orient {
  readonly cx: number
  readonly cy: number
  readonly ux: number
  readonly uy: number
  readonly vx: number
  readonly vy: number
  readonly hu: number
  readonly hv: number
}

function toMap(o: Orient, u: number, v: number): Point {
  return { x: o.cx + o.ux * u + o.vx * v, y: o.cy + o.uy * u + o.vy * v }
}

function toCanon(o: Orient, x: number, y: number): { u: number; v: number } {
  return { u: (x - o.cx) * o.ux + (y - o.cy) * o.uy, v: (x - o.cx) * o.vx + (y - o.cy) * o.vy }
}

/** 封装（毫米）：本体沿脚排的长与宽、高，每边几个脚、脚距，引脚伸出本体多远，焊盘的长与宽 */
interface Pkg {
  readonly len: number
  readonly wid: number
  readonly z: number
  readonly pins: number
  readonly pitch: number
  readonly lead: number
  readonly padLen: number
  readonly padWid: number
}

function soic(pins: number, pitch = 1.27): Pkg {
  return { len: (pins - 1) * pitch + 1.1, wid: 3.9, z: 1.5, pins, pitch, lead: 1.05, padLen: 1.55, padWid: 0.6 }
}

/** 焊盘比引脚尖多伸出去多少，毫米 */
const PAD_OVER_MM = 0.3

/** 两侧出脚的芯片：长边顺着 axis；焊盘按侧（先 −1 侧后 +1 侧）、每侧沿长边从小到大排 */
function makeIc(mpu: number, ref: string, mark: string, cx: number, cy: number, axis: 0 | 1, pkg: Pkg, inside: boolean): Part {
  const mm = (v: number): number => v / mpu
  const half = mm(pkg.len) / 2
  const side = mm(pkg.wid) / 2
  const reach = side + mm(pkg.lead + PAD_OVER_MM)
  const padOff = side + mm(pkg.lead + PAD_OVER_MM - pkg.padLen / 2)
  const pads: Pad[] = []
  for (const s of [-1, 1]) {
    for (let i = 0; i < pkg.pins; i++) {
      const a = (i - (pkg.pins - 1) / 2) * mm(pkg.pitch)
      const along = { hw: mm(pkg.padWid) / 2, hh: mm(pkg.padLen) / 2 }
      pads.push(
        axis === 0
          ? { x: cx + a, y: cy + s * padOff, hw: along.hw, hh: along.hh, nx: 0, ny: s, lead: true }
          : { x: cx + s * padOff, y: cy + a, hw: along.hh, hh: along.hw, nx: s, ny: 0, lead: true },
      )
    }
  }
  const hw = axis === 0 ? half : side
  const hh = axis === 0 ? side : half
  return { kind: 'ic', x: cx, y: cy, hw, hh, z: mm(pkg.z), axis, bw: axis === 0 ? half + mm(0.15) : reach, bh: axis === 0 ? reach : half + mm(0.15), pads, ref, mark, dx: 0, dy: 0, inside }
}

/** 两头焊的贴片件：0603、0805、1206 的长与宽（毫米） */
const CHIP_MM = { '0603': [1.6, 0.8], '0805': [2, 1.25], '1206': [3.2, 1.6] } as const

function makeChip(mpu: number, kind: 'res' | 'cap' | 'led', size: keyof typeof CHIP_MM, ref: string, mark: string, cx: number, cy: number, axis: 0 | 1, inside: boolean): Part {
  const [l, w] = CHIP_MM[size]
  const half = l / mpu / 2
  const side = w / mpu / 2
  const padHalf = 0.5 / mpu
  const padOff = half + 0.15 / mpu
  const pads: Pad[] = [-1, 1].map((s) =>
    axis === 0 ? { x: cx + s * padOff, y: cy, hw: padHalf, hh: side + 0.1 / mpu, nx: s, ny: 0, lead: false } : { x: cx, y: cy + s * padOff, hw: side + 0.1 / mpu, hh: padHalf, nx: 0, ny: s, lead: false },
  )
  const z = (kind === 'res' ? 0.45 : 0.8) / mpu
  const reach = padOff + padHalf
  return {
    kind,
    x: cx,
    y: cy,
    hw: axis === 0 ? half : side,
    hh: axis === 0 ? side : half,
    z,
    axis,
    bw: axis === 0 ? reach : side + 0.1 / mpu,
    bh: axis === 0 ? side + 0.1 / mpu : reach,
    pads,
    ref,
    mark,
    dx: 0,
    dy: 0,
    inside,
  }
}

/** SOT-23 的 MOS 管：一侧两个脚，另一侧一个 */
function makeSot(mpu: number, ref: string, mark: string, cx: number, cy: number, axis: 0 | 1, inside: boolean): Part {
  const half = 2.9 / mpu / 2
  const side = 1.3 / mpu / 2
  const off = side + 0.75 / mpu
  const pin = { a: 0.3 / mpu, b: 0.45 / mpu }
  const spots: [number, number][] = [
    [-0.95 / mpu, 1],
    [0.95 / mpu, 1],
    [0, -1],
  ]
  const pads: Pad[] = spots.map(([a, s]) =>
    axis === 0 ? { x: cx + a, y: cy + s * off, hw: pin.a, hh: pin.b, nx: 0, ny: s, lead: true } : { x: cx + s * off, y: cy + a, hw: pin.b, hh: pin.a, nx: s, ny: 0, lead: true },
  )
  const reach = off + pin.b
  return { kind: 'sot', x: cx, y: cy, hw: axis === 0 ? half : side, hh: axis === 0 ? side : half, z: 1 / mpu, axis, bw: axis === 0 ? half : reach, bh: axis === 0 ? reach : half, pads, ref, mark, dx: 0, dy: 0, inside }
}

/** 贴片电解电容：方形塑料底座上立着铝壳，两个焊盘顺着 axis 伸出去；负极朝 (dx, dy) */
function makeCan(mpu: number, ref: string, mark: string, cx: number, cy: number, diaMM: number, zMM: number, axis: 0 | 1, sign: number, inside: boolean): Part {
  const r = diaMM / mpu / 2
  const base = (diaMM + 0.3) / mpu / 2
  const padOff = base + 0.3 / mpu
  const pads: Pad[] = [-1, 1].map((s) =>
    axis === 0 ? { x: cx + s * padOff, y: cy, hw: 0.9 / mpu, hh: 0.6 / mpu, nx: s, ny: 0, lead: true } : { x: cx, y: cy + s * padOff, hw: 0.6 / mpu, hh: 0.9 / mpu, nx: 0, ny: s, lead: true },
  )
  return {
    kind: 'can',
    x: cx,
    y: cy,
    hw: r,
    hh: r,
    z: zMM / mpu,
    axis,
    bw: axis === 0 ? padOff + 0.9 / mpu : base,
    bh: axis === 0 ? base : padOff + 0.9 / mpu,
    pads,
    ref,
    mark,
    dx: axis === 0 ? sign : 0,
    dy: axis === 0 ? 0 : sign,
    inside,
  }
}

/** 一体成型的功率电感：方块，两个焊盘在底下两侧露出一截 */
function makeCoil(mpu: number, ref: string, mark: string, cx: number, cy: number, sizeMM: number, zMM: number, axis: 0 | 1, inside: boolean): Part {
  const h = sizeMM / mpu / 2
  const padOff = h - 0.4 / mpu
  const pads: Pad[] = [-1, 1].map((s) =>
    axis === 0 ? { x: cx + s * padOff, y: cy, hw: 0.9 / mpu, hh: h * 0.7, nx: s, ny: 0, lead: false } : { x: cx, y: cy + s * padOff, hw: h * 0.7, hh: 0.9 / mpu, nx: 0, ny: s, lead: false },
  )
  const reach = padOff + 0.9 / mpu
  return { kind: 'coil', x: cx, y: cy, hw: h, hh: h, z: zMM / mpu, axis, bw: axis === 0 ? reach : h, bh: axis === 0 ? h : reach, pads, ref, mark, dx: 0, dy: 0, inside }
}

/** 贴片晶振：金属盖的小方块，四个角底下各一个焊盘，露出一点边 */
function makeXtal(mpu: number, ref: string, mark: string, cx: number, cy: number, axis: 0 | 1, inside: boolean): Part {
  const hw = (axis === 0 ? 3.2 : 2.5) / mpu / 2
  const hh = (axis === 0 ? 2.5 : 3.2) / mpu / 2
  const pads: Pad[] = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: cx + sx * (hw - 0.45 / mpu), y: cy + sy * (hh - 0.4 / mpu), hw: 0.6 / mpu, hh: 0.55 / mpu, nx: sx, ny: 0, lead: false })))
  return { kind: 'xtal', x: cx, y: cy, hw, hh, z: 0.8 / mpu, axis, bw: hw + 0.15 / mpu, bh: hh + 0.15 / mpu, pads, ref, mark, dx: 0, dy: 0, inside }
}

/** 电极：一块根在 (bx, by) 的金属块，朝 (dx, dy) 伸出 ELECTRODE.len 格，尖是削出来的 */
function makeElectrode(mpu: number, ref: string, bx: number, by: number, dx: number, dy: number): Part {
  const cx = bx + (dx * ELECTRODE.len) / 2
  const cy = by + (dy * ELECTRODE.len) / 2
  const along = ELECTRODE.len / 2
  const across = ELECTRODE.wid / 2
  const hw = dx !== 0 ? along : across
  const hh = dx !== 0 ? across : along
  const pad: Pad = { x: cx - dx * 0.08, y: cy - dy * 0.08, hw: hw + 0.12, hh: hh + 0.12, nx: dx, ny: dy, lead: false }
  return { kind: 'electrode', x: cx, y: cy, hw, hh, z: ELECTRODE.zMM / mpu, axis: dx !== 0 ? 0 : 1, bw: hw + 0.04, bh: hh + 0.04, pads: [pad], ref, mark: '', dx, dy, inside: true }
}

/** 布线的格子：铺满屏蔽罩的外接框 */
interface Grid {
  readonly x0: number
  readonly y0: number
  readonly cell: number
  readonly cols: number
  readonly rows: number
}

const DIR_X = [1, 1, 0, -1, -1, -1, 0, 1] as const
const DIR_Y = [0, 1, 1, 1, 0, -1, -1, -1] as const

/** 一个方向在八个方向里是第几个 */
function dirIndex(dx: number, dy: number): number {
  const a = Math.atan2(dy, dx)
  return (Math.round(a / (Math.PI / 4)) + 8) % 8
}

/** 最小堆：按 f 取出状态 */
class Heap {
  private keys: number[] = []
  private vals: number[] = []
  get size(): number {
    return this.keys.length
  }
  push(v: number, k: number): void {
    const keys = this.keys
    const vals = this.vals
    let i = keys.length
    keys.push(k)
    vals.push(v)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (keys[p]! <= k) break
      keys[i] = keys[p]!
      vals[i] = vals[p]!
      i = p
    }
    keys[i] = k
    vals[i] = v
  }
  pop(): number {
    const keys = this.keys
    const vals = this.vals
    const top = vals[0]!
    const k = keys.pop()!
    const v = vals.pop()!
    const n = keys.length
    if (n > 0) {
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        if (l >= n) break
        const r = l + 1
        const c = r < n && keys[r]! < keys[l]! ? r : l
        if (keys[c]! >= k) break
        keys[i] = keys[c]!
        vals[i] = vals[c]!
        i = c
      }
      keys[i] = k
      vals[i] = v
    }
    return top
  }
}

/**
 * 在格子上从 from 出发、朝 fromDir 走出去，到 to 时正朝 toDir 走进去：八个方向走，拐 45° 与 90° 另算代价，不准折回来；
 * blocked 的格子走不进去，斜着走不准擦过走不进去的格子。返回折线（只留拐点），走不通返回 null
 */
function route(g: Grid, blocked: Uint8Array, from: Point, fromDir: number, to: Point, toDir: number): Point[] | null {
  const cellOf = (p: Point): number => {
    const cx = Math.min(g.cols - 1, Math.max(0, Math.floor((p.x - g.x0) / g.cell)))
    const cy = Math.min(g.rows - 1, Math.max(0, Math.floor((p.y - g.y0) / g.cell)))
    return cy * g.cols + cx
  }
  const start = cellOf(from)
  const goal = cellOf(to)
  if (blocked[start] || blocked[goal]) return null
  const n = g.cols * g.rows
  const cost = new Float32Array(n * 8).fill(Infinity)
  const prev = new Int32Array(n * 8).fill(-1)
  const gx = goal % g.cols
  const gy = (goal - gx) / g.cols
  const h = (c: number): number => {
    const x = c % g.cols
    const y = (c - x) / g.cols
    const dx = Math.abs(x - gx)
    const dy = Math.abs(y - gy)
    return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * g.cell
  }
  const heap = new Heap()
  const s0 = start * 8 + fromDir
  cost[s0] = 0
  heap.push(s0, h(start))
  let budget = ROUTE_BUDGET
  let found = -1
  while (heap.size > 0 && budget-- > 0) {
    const s = heap.pop()
    const c = s >> 3
    const d = s & 7
    if (c === goal && d === toDir) {
      found = s
      break
    }
    const base = cost[s]!
    const x = c % g.cols
    const y = (c - x) / g.cols
    for (let t = -2; t <= 2; t++) {
      const nd = (d + t + 8) & 7
      const nx = x + DIR_X[nd]!
      const ny = y + DIR_Y[nd]!
      if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue
      const nc = ny * g.cols + nx
      if (blocked[nc]) continue
      const diag = (nd & 1) === 1
      if (diag && (blocked[y * g.cols + nx] || blocked[ny * g.cols + x])) continue
      const turn = t === 0 ? 0 : Math.abs(t) === 1 ? TURN45_U : TURN90_U
      const nc8 = nc * 8 + nd
      const ng = base + (diag ? Math.SQRT2 : 1) * g.cell + turn
      if (ng >= cost[nc8]!) continue
      cost[nc8] = ng
      prev[nc8] = s
      heap.push(nc8, ng + h(nc))
    }
  }
  if (found < 0) return null
  const states: number[] = []
  for (let s = found; s >= 0; s = prev[s]!) states.push(s)
  states.reverse()
  const center = (c: number): Point => {
    const x = c % g.cols
    const y = (c - x) / g.cols
    return { x: g.x0 + (x + 0.5) * g.cell, y: g.y0 + (y + 0.5) * g.cell }
  }
  const pts: Point[] = [center(states[0]! >> 3)]
  for (let i = 1; i < states.length - 1; i++) if ((states[i]! & 7) !== (states[i + 1]! & 7)) pts.push(center(states[i]! >> 3))
  pts.push(center(goal))
  return pts
}

/** 把一条拐点折线接到两头的焊盘上：头一段顺着出线的方向、末一段顺着进线的方向，接口落在焊盘里 */
function attach(path: readonly Point[], from: Point, fromDir: number, to: Point, toDir: number): Point[] {
  const pts = path.map((p) => ({ ...p }))
  const first = pts[0]!
  if (DIR_Y[fromDir] === 0) first.y = from.y
  else if (DIR_X[fromDir] === 0) first.x = from.x
  const last = pts[pts.length - 1]!
  if (DIR_Y[toDir] === 0) last.y = to.y
  else if (DIR_X[toDir] === 0) last.x = to.x
  return [{ ...from }, ...pts, { ...to }].filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1]!.x, p.y - a[i - 1]!.y) > 1e-6)
}

/** 折线整体往左（顺着走向看）平移 off：拐角按斜接 */
function offsetLine(pts: readonly Point[], off: number): Point[] {
  const out: Point[] = []
  const nrm = (a: Point, b: Point): Point => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return { x: (b.y - a.y) / l, y: -(b.x - a.x) / l }
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const n0 = i > 0 ? nrm(pts[i - 1]!, p) : null
    const n1 = i < pts.length - 1 ? nrm(p, pts[i + 1]!) : null
    if (!n0 || !n1) {
      const n = (n0 ?? n1)!
      out.push({ x: p.x + n.x * off, y: p.y + n.y * off })
      continue
    }
    const mx = n0.x + n1.x
    const my = n0.y + n1.y
    const ml = Math.hypot(mx, my) || 1
    const cos = (n0.x * n1.x + n0.y * n1.y + 1) / 2
    const k = off / Math.sqrt(Math.max(1e-6, cos))
    out.push({ x: p.x + (mx / ml) * k, y: p.y + (my / ml) * k })
  }
  return out
}

/** 一块带电的铜：线段（带半宽）、铜板或圆盘 */
type Shape = { readonly kind: 'seg'; readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number; readonly r: number } | { readonly kind: 'plate'; readonly p: Plate } | { readonly kind: 'pad'; readonly p: Pad }

function shapeDist(s: Shape, x: number, y: number): number {
  if (s.kind === 'seg') return segDist(s.ax, s.ay, s.bx, s.by, x, y) - s.r
  if (s.kind === 'plate') return plateDist(s.p, x, y)
  return boxDist(s.p.x, s.p.y, s.p.hw, s.p.hh, x, y)
}

function shapeBox(s: Shape): { x0: number; y0: number; x1: number; y1: number } {
  if (s.kind === 'seg') return { x0: Math.min(s.ax, s.bx) - s.r, y0: Math.min(s.ay, s.by) - s.r, x1: Math.max(s.ax, s.bx) + s.r, y1: Math.max(s.ay, s.by) + s.r }
  if (s.kind === 'plate') return s.p
  return { x0: s.p.x - s.p.hw, y0: s.p.y - s.p.hh, x1: s.p.x + s.p.hw, y1: s.p.y + s.p.hh }
}

function traceShapes(t: Trace): Shape[] {
  const out: Shape[] = []
  for (let i = 1; i < t.pts.length; i++) out.push({ kind: 'seg', ax: t.pts[i - 1]!.x, ay: t.pts[i - 1]!.y, bx: t.pts[i]!.x, by: t.pts[i]!.y, r: t.w / 2 })
  return out
}

/** 生成中的一块电路板 */
interface Draft {
  readonly cfg: CircuitConfig
  readonly rng: Rng
  readonly mpu: number
  readonly o: Orient
  readonly arena: Arena
  readonly grid: Grid
  readonly parts: Part[]
  readonly traces: Trace[]
  readonly plates: Plate[]
  readonly vias: Via[]
  readonly labels: Label[]
  readonly marks: Mark[]
  readonly warnings: Warning[]
  /** 每个带电网络的铜 */
  readonly copper: Shape[][]
  readonly nets: { kind: NetKind; sources: Point[]; driver: number }[]
}

/** 格子上哪些格子挡着：离罩壁、元件、开局空地和已有的铜不够远 */
function blockedFor(d: Draft, half: number, keep: { wall: number; part: number; hazard: number; signal: number; plaza: number }): Uint8Array {
  const g = d.grid
  const out = new Uint8Array(g.cols * g.rows)
  const center = toMap(d.o, 0, 0)
  const shapes = d.copper.flat()
  const signals = d.traces.filter((t) => t.net < 0).flatMap(traceShapes)
  for (let cy = 0; cy < g.rows; cy++) {
    for (let cx = 0; cx < g.cols; cx++) {
      const x = g.x0 + (cx + 0.5) * g.cell
      const y = g.y0 + (cy + 0.5) * g.cell
      let bad = arenaRoom(d.arena, x, y) < keep.wall + half || Math.hypot(x - center.x, y - center.y) < keep.plaza + half
      for (let i = 0; !bad && i < d.parts.length; i++) bad = d.parts[i]!.inside && partDist(d.parts[i]!, x, y) < keep.part + half
      for (let i = 0; !bad && i < shapes.length; i++) bad = shapeDist(shapes[i]!, x, y) < keep.hazard + half
      for (let i = 0; !bad && i < signals.length; i++) bad = shapeDist(signals[i]!, x, y) < keep.signal + half
      if (bad) out[cy * g.cols + cx] = 1
    }
  }
  return out
}

/** 焊盘往外伸出 stub 格的那一点 */
function padOut(p: Pad, stub: number): Point {
  const reach = p.nx !== 0 ? p.hw : p.hh
  return { x: p.x + p.nx * (reach + stub), y: p.y + p.ny * (reach + stub) }
}

/** 一束线从这排焊盘出线时，中线先直着伸出去到哪一点才开始寻路：离元件够远 */
function busEnd(pads: readonly Pad[], half: number, keepPart: number): Point {
  const a = pads[0]!
  const b = pads[pads.length - 1]!
  return padOut({ ...a, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, half + keepPart + ROUTE_CELL_U * 1.5)
}

/** 从一排焊盘连到另一排焊盘的一束线：中线按整束的宽度寻路，再平移出每一条；每条的两头落在对应的焊盘上 */
function routeBus(d: Draft, from: readonly Pad[], to: readonly Pad[], w: number, pitch: number, keep: { wall: number; part: number; hazard: number; signal: number; plaza: number }): Point[][] | null {
  const n = from.length
  const mid = (pads: readonly Pad[]): Point => ({ x: (pads[0]!.x + pads[pads.length - 1]!.x) / 2, y: (pads[0]!.y + pads[pads.length - 1]!.y) / 2 })
  const f0 = from[0]!
  const t0 = to[0]!
  const half = ((n - 1) * pitch + w) / 2
  const fromDir = dirIndex(f0.nx, f0.ny)
  const toDir = dirIndex(-t0.nx, -t0.ny)
  const fm = mid(from)
  const tm = mid(to)
  const a = busEnd(from, half, keep.part)
  const b = busEnd(to, half, keep.part)
  const blocked = blockedFor(d, half, keep)
  const path = route(d.grid, blocked, a, fromDir, b, toDir)
  if (!path) return null
  const center = attach(path, fm, fromDir, tm, toDir)
  const lines: Point[][] = []
  for (let k = 0; k < n; k++) {
    const off = (k - (n - 1) / 2) * pitch
    const line = offsetLine(center, off)
    // 平移后的两头挑最近的焊盘接上
    const near = (q: Point, pads: readonly Pad[]): Pad => pads.reduce((m, p) => (Math.hypot(p.x - q.x, p.y - q.y) < Math.hypot(m.x - q.x, m.y - q.y) ? p : m))
    const pf = near(line[0]!, from)
    const pt = near(line[line.length - 1]!, to)
    line[0] = { x: pf.x, y: pf.y }
    line[line.length - 1] = { x: pt.x, y: pt.y }
    if (f0.nx === 0) line[1] = { x: pf.x, y: line[1]!.y }
    else line[1] = { x: line[1]!.x, y: pf.y }
    const m = line.length - 2
    if (t0.nx === 0) line[m] = { x: pt.x, y: line[m]!.y }
    else line[m] = { x: line[m]!.x, y: pt.y }
    lines.push(line)
  }
  return lines
}

/** 元件两两之间都留出 gap 格以上的空当（按挡人的范围量） */
function spaced(parts: readonly Part[], gap: number): boolean {
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i]!
      const b = parts[j]!
      const gx = Math.abs(a.x - b.x) - a.bw - b.bw
      const gy = Math.abs(a.y - b.y) - a.bh - b.bh
      if ((gx > 0 && gy > 0 ? Math.hypot(gx, gy) : Math.max(gx, gy)) < gap) return false
    }
  }
  return true
}

/** 芯片一侧的焊盘，按在 (u 或 v) 上的位置从小到大排 */
function sidePads(o: Orient, ic: Part, nx: number, ny: number, byU: boolean): Pad[] {
  return ic.pads.filter((p) => p.nx === nx && p.ny === ny).sort((a, b) => (byU ? toCanon(o, a.x, a.y).u - toCanon(o, b.x, b.y).u : toCanon(o, a.x, a.y).v - toCanon(o, b.x, b.y).v))
}

type Wall = 'W' | 'N' | 'E' | 'S'

/** 墙在 u、v 上朝里的方向 */
const INWARD: Record<Wall, { du: number; dv: number }> = { W: { du: 1, dv: 0 }, N: { du: 0, dv: 1 }, E: { du: -1, dv: 0 }, S: { du: 0, dv: -1 } }

/** 靠着一面墙摆的芯片：长边顺着墙，靠墙那排焊盘离墙 aisle 格，沿墙的位置 along（u 或 v） */
function wallIc(d: Draft, wall: Wall, along: number, aisle: number, pkg: Pkg, ref: string, mark: string): Part {
  const o = d.o
  const mpu = d.mpu
  const depth = (pkg.wid + 2 * (pkg.lead + PAD_OVER_MM)) / mpu
  const inw = INWARD[wall]
  const off = aisle + depth / 2
  const u = inw.du !== 0 ? -inw.du * o.hu + inw.du * off : along
  const v = inw.dv !== 0 ? -inw.dv * o.hv + inw.dv * off : along
  const c = toMap(o, u, v)
  // 长边顺着墙：墙是 u = 常数时长边顺着 v
  const alongV = inw.du !== 0
  const axis: 0 | 1 = (alongV ? o.vx : o.ux) !== 0 ? 0 : 1
  return makeIc(mpu, ref, mark, c.x, c.y, axis, pkg, true)
}

/** 芯片朝某个 u、v 方向的那排焊盘 */
function facing(d: Draft, ic: Part, du: number, dv: number): Pad[] {
  const dir = { x: d.o.ux * du + d.o.vx * dv, y: d.o.uy * du + d.o.vy * dv }
  return sidePads(d.o, ic, dir.x, dir.y, dv !== 0)
}

/** 丝印的位号与芯片上印的字摆在芯片顺着长边的一头外面 */
function refLabel(d: Draft, p: Part, size: number, end: number): void {
  const along = p.axis === 0 ? { x: 1, y: 0 } : { x: 0, y: 1 }
  const reach = (p.axis === 0 ? p.bw : p.bh) + size * 0.75 + 0.2
  d.labels.push({ s: p.ref, x: p.x + along.x * reach * end, y: p.y + along.y * reach * end, size, rot: p.axis === 0 ? 1 : 0 })
}

/** 芯片丝印：两头的框线与一号脚的圆点 */
function icOutline(d: Draft, p: Part): void {
  const w = 0.12
  const x0 = p.x - p.hw - 0.1
  const x1 = p.x + p.hw + 0.1
  const y0 = p.y - p.hh - 0.1
  const y1 = p.y + p.hh + 0.1
  if (p.axis === 0) {
    d.marks.push({ pts: [{ x: x0, y: y0 + 0.2 }, { x: x0, y: y1 - 0.2 }], w, dash: 0 }, { pts: [{ x: x1, y: y0 + 0.2 }, { x: x1, y: y1 - 0.2 }], w, dash: 0 })
  } else {
    d.marks.push({ pts: [{ x: x0 + 0.2, y: y0 }, { x: x1 - 0.2, y: y0 }], w, dash: 0 }, { pts: [{ x: x0 + 0.2, y: y1 }, { x: x1 - 0.2, y: y1 }], w, dash: 0 })
  }
  const pin1 = p.pads[0]
  if (pin1) {
    const r = 0.18
    const px = p.axis === 0 ? x0 - 0.35 : pin1.x + pin1.nx * (pin1.hw + 0.35)
    const py = p.axis === 0 ? pin1.y + pin1.ny * (pin1.hh + 0.35) : y0 - 0.35
    d.marks.push({ pts: [{ x: px - r * 0.01, y: py }, { x: px + r * 0.01, y: py }], w: r * 2, dash: 0 })
  }
}

/** 没连线的焊盘往外拉一小段细线到一个过孔：那里空着才拉 */
function fanOut(d: Draft, p: Part, used: ReadonlySet<Pad>, free: (x: number, y: number, r: number) => boolean): void {
  for (const pad of p.pads) {
    if (used.has(pad) || d.rng.next() < 0.25) continue
    const len = 0.9 + d.rng.next() * 0.6
    const end = padOut(pad, len)
    const r = 0.36
    if (!free(end.x, end.y, r + 0.25)) continue
    const start = { x: pad.x, y: pad.y }
    d.traces.push({ pts: [start, end], w: SIGNAL_U * 0.9, net: -1 })
    d.vias.push({ x: end.x, y: end.y, r, hole: 0.16, open: false })
  }
}

/** 网络的铜按细格子栅格化：每格离最近的网络多远，铜里沿铜从电源走过来的距离，铜外取最近那片铜上的 */
function rasterCopper(arena: Arena, copper: readonly Shape[][], nets: readonly { sources: readonly Point[] }[]): { grid: CopperGrid; lengths: number[] } {
  const cell = COPPER_CELL_U
  const reach = COPPER_REACH_U
  const x0 = Math.floor(arena.x0 - reach)
  const y0 = Math.floor(arena.y0 - reach)
  const cols = Math.ceil((arena.x1 + reach - x0) / cell)
  const rows = Math.ceil((arena.y1 + reach - y0) / cell)
  const n = cols * rows
  const net = new Int8Array(n).fill(-1)
  const dist = new Float32Array(n).fill(reach)
  const along = new Float32Array(n).fill(Infinity)
  copper.forEach((shapes, k) => {
    for (const s of shapes) {
      const b = shapeBox(s)
      const c0 = Math.max(0, Math.floor((b.x0 - reach - x0) / cell))
      const c1 = Math.min(cols - 1, Math.ceil((b.x1 + reach - x0) / cell))
      const r0 = Math.max(0, Math.floor((b.y0 - reach - y0) / cell))
      const r1 = Math.min(rows - 1, Math.ceil((b.y1 + reach - y0) / cell))
      for (let cy = r0; cy <= r1; cy++) {
        for (let cx = c0; cx <= c1; cx++) {
          const i = cy * cols + cx
          const v = shapeDist(s, x0 + (cx + 0.5) * cell, y0 + (cy + 0.5) * cell)
          if (v < dist[i]!) {
            dist[i] = v
            net[i] = k
          }
        }
      }
    }
  })
  // 铜里：从电源所在的格子起，按八邻域在同一网络的铜里走
  const lengths = nets.map(() => 0)
  const heap = new Heap()
  nets.forEach((nt, k) => {
    for (const s of nt.sources) {
      const cx = Math.floor((s.x - x0) / cell)
      const cy = Math.floor((s.y - y0) / cell)
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx
          const y = cy + dy
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue
          const i = y * cols + x
          if (net[i] !== k || dist[i]! > 0) continue
          const a = Math.hypot(dx, dy) * cell
          if (a < along[i]!) {
            along[i] = a
            heap.push(i, a)
          }
        }
      }
    }
  })
  while (heap.size > 0) {
    const i = heap.pop()
    const a = along[i]!
    const x = i % cols
    const y = (i - x) / cols
    for (let k = 0; k < 8; k++) {
      const nx = x + DIR_X[k]!
      const ny = y + DIR_Y[k]!
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const j = ny * cols + nx
      if (net[j] !== net[i] || dist[j]! > 0) continue
      const na = a + ((k & 1) === 1 ? Math.SQRT2 : 1) * cell
      if (na < along[j]!) {
        along[j] = na
        heap.push(j, na)
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const k = net[i]!
    if (k < 0 || dist[i]! > 0) continue
    if (!Number.isFinite(along[i]!)) along[i] = 0
    lengths[k] = Math.max(lengths[k]!, along[i]!)
  }
  // 铜外：从铜的边一圈圈往外，取走过来的那一格的
  const queue: number[] = []
  for (let i = 0; i < n; i++) if (net[i]! >= 0 && dist[i]! <= 0) queue.push(i)
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!
    const x = i % cols
    const y = (i - x) / cols
    for (let k = 0; k < 8; k += 2) {
      const nx = x + DIR_X[k]!
      const ny = y + DIR_Y[k]!
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const j = ny * cols + nx
      if (net[j] !== net[i] || dist[j]! <= 0 || Number.isFinite(along[j]!)) continue
      along[j] = along[i]!
      queue.push(j)
    }
  }
  for (let i = 0; i < n; i++) {
    if (net[i]! >= 0 && dist[i]! < reach && Number.isFinite(along[i]!)) continue
    net[i] = -1
    dist[i] = reach
    along[i] = 0
  }
  return { grid: { x0, y0, cell, cols, rows, net, dist, along }, lengths }
}

/** 罩外的布景：一圈排得密密的贴片件、几颗芯片和电感，空处打过孔 */
function furnishOutside(d: Draft, size: number, pad: number, holes: readonly Point[]): void {
  const mpu = d.mpu
  const rng = d.rng
  const a = d.arena
  const lo = -pad + 0.6
  const hi = size + pad - 0.6
  const clear = (p: Part): boolean => {
    if (holes.some((h) => boxDist(p.x, p.y, p.bw, p.bh, h.x, h.y) < 2.4)) return false
    for (const c of [
      [p.x - p.bw, p.y - p.bh],
      [p.x + p.bw, p.y - p.bh],
      [p.x - p.bw, p.y + p.bh],
      [p.x + p.bw, p.y + p.bh],
    ] as const) {
      if (arenaRoom(a, c[0], c[1]) > -FRAME_WALL_U - FRAME_LIP_U - 0.7) return false
      if (c[0] < lo || c[1] < lo || c[0] > hi || c[1] > hi) return false
    }
    return d.parts.every((q) => Math.abs(q.x - p.x) > q.bw + p.bw + 0.7 || Math.abs(q.y - p.y) > q.bh + p.bh + 0.7)
  }
  let n = { r: 1, c: 1, u: 10, l: 4 }
  const area = (hi - lo) ** 2 - (a.x1 - a.x0) * (a.y1 - a.y0)
  for (let i = 0; i < area * 1.1; i++) {
    const x = lo + rng.next() * (hi - lo)
    const y = lo + rng.next() * (hi - lo)
    const axis: 0 | 1 = rng.next() < 0.5 ? 0 : 1
    const roll = rng.next()
    let p: Part
    if (roll < 0.05) p = makeIc(mpu, `U${n.u}`, ['LM358', '74HC14', 'TL431', 'ESP32', 'CH340'][Math.floor(rng.next() * 5)]!, x, y, axis, soic(rng.next() < 0.6 ? 4 : 7), false)
    else if (roll < 0.09) p = makeCan(mpu, `C${n.c}`, '220', x, y, 5, 5.4, axis, rng.next() < 0.5 ? -1 : 1, false)
    else if (roll < 0.13) p = makeCoil(mpu, `L${n.l}`, ['4R7', '100', '2R2'][Math.floor(rng.next() * 3)]!, x, y, 4, 2, axis, false)
    else if (roll < 0.55) p = makeChip(mpu, 'res', rng.next() < 0.5 ? '0603' : '0805', `R${n.r}`, ['103', '472', '1001', '220', '4701', '0'][Math.floor(rng.next() * 6)]!, x, y, axis, false)
    else p = makeChip(mpu, 'cap', rng.next() < 0.5 ? '0603' : '0805', `C${n.c}`, '', x, y, axis, false)
    if (!clear(p)) continue
    d.parts.push(p)
    if (p.kind === 'ic') {
      n = { ...n, u: n.u + 1 }
      icOutline(d, p)
      refLabel(d, p, 0.85, rng.next() < 0.5 ? -1 : 1)
    } else {
      if (p.kind === 'res') n = { ...n, r: n.r + 1 }
      else if (p.kind === 'coil') n = { ...n, l: n.l + 1 }
      else n = { ...n, c: n.c + 1 }
      if (rng.next() < 0.5) refLabel(d, p, 0.6, rng.next() < 0.5 ? -1 : 1)
    }
  }
}

/** 一次尝试：定屏蔽罩与朝向，摆芯片，布带电的线，布开关与铜板、电弧，再布不带电的细线与布景；哪一步不合格返回 null */
function attempt(cfg: CircuitConfig, rng: Rng): CircuitPlan | null {
  const S = cfg.sizeU
  const mpu = cfg.mmPerU
  const seed = Math.floor(rng.next() * 0x7fffffff)
  const inset = [0, 1, 2, 3].map(() => between(rng, cfg.frame.insetU))
  const cut = [0, 1, 2, 3].map(() => between(rng, cfg.frame.chamferU))
  const arena: Arena = { x0: inset[0]!, y0: inset[1]!, x1: S - inset[2]!, y1: S - inset[3]!, cut: [cut[0]!, cut[1]!, cut[2]!, cut[3]!] }
  // 朝向：u 轴转四个方向之一，v 轴再看要不要翻过来
  const k = Math.floor(rng.next() * 4)
  const ux = [1, 0, -1, 0][k]!
  const uy = [0, 1, 0, -1][k]!
  const flip = rng.next() < 0.5 ? -1 : 1
  const vx = -uy * flip
  const vy = ux * flip
  const cx = (arena.x0 + arena.x1) / 2
  const cy = (arena.y0 + arena.y1) / 2
  const hx = (arena.x1 - arena.x0) / 2
  const hy = (arena.y1 - arena.y0) / 2
  const o: Orient = { cx, cy, ux, uy, vx, vy, hu: ux !== 0 ? hx : hy, hv: vx !== 0 ? hx : hy }
  const gx0 = arena.x0
  const gy0 = arena.y0
  const grid: Grid = { x0: gx0, y0: gy0, cell: ROUTE_CELL_U, cols: Math.ceil((arena.x1 - gx0) / ROUTE_CELL_U), rows: Math.ceil((arena.y1 - gy0) / ROUTE_CELL_U) }
  const d: Draft = { cfg, rng, mpu, o, arena, grid, parts: [], traces: [], plates: [], vias: [], labels: [], marks: [], warnings: [], copper: [], nets: [] }
  const used = new Set<Pad>()
  const hazardKeep = { wall: WALL_KEEP_U, part: PART_KEEP_U, hazard: NET_GAP_U, signal: 0, plaza: cfg.plazaU + PLAZA_KEEP_U }

  // 哪几条过道里有电弧：电源与时钟各挑一头，再多的给左下角那颗芯片
  const arcs = Math.round(between(rng, cfg.arc.count))
  const arcAt = new Set<string>()
  arcAt.add(rng.next() < 0.5 ? 'U1' : 'U2')
  if (arcs >= 2) arcAt.add(rng.next() < 0.5 ? 'U3' : 'U4')
  if (arcs >= 3) arcAt.add('U5')
  const gapOf = new Map<string, number>()
  const aisleOf = (ref: string): number => {
    if (!arcAt.has(ref)) return between(rng, cfg.aisleU)
    const gap = between(rng, cfg.arc.gapU)
    gapOf.set(ref, gap)
    return gap + ELECTRODE.len * 2 + ELECTRODE.gapU
  }

  // 电源：左上角，左墙偏上、上墙偏左各一颗芯片，电源芯片朝里那排最下面的脚绕过开局空地的左上，接到负载芯片朝里那排最右边的脚
  const pitchMM = cfg.clock.pitchU * mpu
  const railW = between(rng, cfg.rail.widthU)
  const n = Math.round(between(rng, cfg.clock.traces))
  const busHalf = ((n - 1) * cfg.clock.pitchU + cfg.clock.widthU) / 2
  // 芯片先摆在离墙中点 chipU 处；接线那排脚伸出来的线头落进开局空地外那一圈，就顺着墙往外挪到让开为止
  const slide = (wall: Wall, sign: number, aisle: number, pkg: Pkg, ref: string, mark: string, pick: (ic: Part) => Pad[], half: number): Part | null => {
    const keepR = cfg.plazaU + PLAZA_KEEP_U + half + ROUTE_CELL_U * 2
    let along = sign * between(rng, cfg.chipU)
    for (let k = 0; k < 24; k++) {
      const ic = wallIc(d, wall, along, aisle, pkg, ref, mark)
      const end = busEnd(pick(ic), half, PART_KEEP_U)
      if (Math.hypot(end.x - cx, end.y - cy) >= keepR) return ic
      along += sign * 0.25
    }
    return null
  }
  const u1 = slide('W', -1, aisleOf('U1'), soic(4), 'U1', 'MP2307', (ic) => [facing(d, ic, 1, 0).at(-1)!], railW / 2)
  const u2 = slide('N', -1, aisleOf('U2'), soic(4), 'U2', 'ATTINY85', (ic) => [facing(d, ic, 0, 1).at(-1)!], railW / 2)
  // 时钟：右下角，右墙偏下、下墙偏右各一颗，定时芯片朝里那排最上面几个脚并排绕过开局空地的右下，接到计数芯片
  const u3 = slide('E', 1, aisleOf('U3'), soic(4, pitchMM), 'U3', 'NE555', (ic) => facing(d, ic, -1, 0).slice(0, n), busHalf)
  const u4 = slide('S', 1, aisleOf('U4'), soic(4, pitchMM), 'U4', '24C02', (ic) => facing(d, ic, 0, -1).slice(0, n), busHalf)
  if (!u1 || !u2 || !u3 || !u4) return null
  // 左下角一颗运放，靠哪面墙随机
  const u5Wall: Wall = rng.next() < 0.5 ? 'S' : 'W'
  const u5Off = between(rng, cfg.chipU) + 4.5
  const u5 = wallIc(d, u5Wall, u5Wall === 'S' ? -u5Off : u5Off, aisleOf('U5'), soic(4), 'U5', 'LM358')
  d.parts.push(u1, u2, u3, u4, u5)
  const wallOf: Record<string, Wall> = { U1: 'W', U2: 'N', U3: 'E', U4: 'S', U5: u5Wall }
  const icOf: Record<string, Part> = { U1: u1, U2: u2, U3: u3, U4: u4, U5: u5 }
  // 芯片不能挨着开局空地，彼此之间也得留出走得过去的路
  const plazaClear = (p: Part): boolean => partDist(p, cx, cy) > cfg.plazaU + 0.5
  if (![u1, u2, u3, u4, u5].every(plazaClear)) return null
  if (!spaced(d.parts, 2.8)) return null

  // 定时芯片旁的指示灯与限流电阻：灯亮着就是时钟线通着
  const u3In = toCanon(o, u3.x, u3.y)
  const u3Len = Math.abs(o.ux) * u3.hh + Math.abs(o.uy) * u3.hw
  const ledAxis: 0 | 1 = o.ux !== 0 ? 0 : 1
  const ledC = toMap(o, u3In.u - 1.4, u3In.v + u3Len + 1.7)
  const led = makeChip(mpu, 'led', '0805', 'D1', '', ledC.x, ledC.y, ledAxis, true)
  const resC = toMap(o, u3In.u + 1.4, u3In.v + u3Len + 1.7)
  const res = makeChip(mpu, 'res', '0805', 'R1', '471', resC.x, resC.y, ledAxis, true)
  d.parts.push(led, res)

  // 配套的小元件顺着芯片的长边排在它一头，不占过道：电源芯片旁一颗功率电感和一颗输出电容，负载芯片旁一颗晶振和一颗负载电容，
  // 计数芯片与运放另一头各一颗去耦电容；挤到别的元件或开局空地就不放
  const beyond = (ic: Part, du: number, dv: number, gap: number, half: number): Point => {
    const dx = o.ux * du + o.vx * dv
    const dy = o.uy * du + o.vy * dv
    const ext = Math.abs(dx) * ic.bw + Math.abs(dy) * ic.bh
    return { x: ic.x + dx * (ext + gap + half), y: ic.y + dy * (ext + gap + half) }
  }
  const axisOf = (du: number, dv: number): 0 | 1 => (o.ux * du + o.vx * dv !== 0 ? 0 : 1)
  const fits = (p: Part, host: Part): boolean =>
    partDist(p, cx, cy) > cfg.plazaU + 1 && arenaRoom(arena, p.x, p.y) > Math.max(p.bw, p.bh) + 1.2 && d.parts.every((q) => q === host || spaced([q, p], 2.8))
  const extra = (p: Part, host: Part): Part | null => {
    if (!fits(p, host)) return null
    d.parts.push(p)
    return p
  }
  const l1c = beyond(u1, 0, -1, 1.1, 2)
  const l1 = extra(makeCoil(mpu, 'L1', '4R7', l1c.x, l1c.y, 4, 2, axisOf(0, 1), true), u1)
  if (l1) {
    const c1c = beyond(l1, 0, -1, 0.8, 1)
    extra(makeChip(mpu, 'cap', '1206', 'C1', '', c1c.x, c1c.y, axisOf(0, 1), true), l1)
  }
  const y1c = beyond(u2, -1, 0, 1.2, 1.6)
  const y1 = extra(makeXtal(mpu, 'Y1', '16.000', y1c.x, y1c.y, axisOf(1, 0), true), u2)
  if (y1) {
    const c2c = beyond(y1, -1, 0, 0.7, 0.8)
    extra(makeChip(mpu, 'cap', '0603', 'C2', '', c2c.x, c2c.y, axisOf(1, 0), true), y1)
  }
  const c5c = beyond(u4, 1, 0, 0.9, 1)
  extra(makeChip(mpu, 'cap', '0805', 'C5', '', c5c.x, c5c.y, axisOf(1, 0), true), u4)
  const u5Along = u5Wall === 'S' ? { du: 1, dv: 0 } : { du: 0, dv: -1 }
  const c6c = beyond(u5, u5Along.du, u5Along.dv, 0.9, 1)
  extra(makeChip(mpu, 'cap', '0805', 'C6', '', c6c.x, c6c.y, axisOf(u5Along.du, u5Along.dv), true), u5)
  const r2c = beyond(u5, -u5Along.du, -u5Along.dv, 0.9, 1)
  extra(makeChip(mpu, 'res', '0805', 'R2', '103', r2c.x, r2c.y, axisOf(u5Along.du, u5Along.dv), true), u5)

  // 电源线
  const railFrom = facing(d, u1, 1, 0).at(-1)!
  const railTo = facing(d, u2, 0, 1).at(-1)!
  const railBus = routeBus(d, [railFrom], [railTo], railW, 0, hazardKeep)
  if (!railBus) return null
  used.add(railFrom).add(railTo)
  d.traces.push({ pts: railBus[0]!, w: railW, net: 0 })
  d.copper.push([...traceShapes(d.traces[d.traces.length - 1]!), { kind: 'pad', p: railFrom }, { kind: 'pad', p: railTo }])
  d.nets.push({ kind: 'rail', sources: [{ x: railFrom.x, y: railFrom.y }], driver: -1 })

  // 时钟线
  const clkFrom = facing(d, u3, -1, 0).slice(0, n)
  const clkTo = facing(d, u4, 0, -1).slice(0, n)
  const bus = routeBus(d, clkFrom, clkTo, cfg.clock.widthU, cfg.clock.pitchU, hazardKeep)
  if (!bus) return null
  const clockNet = d.nets.length
  const clkShapes: Shape[] = []
  for (const line of bus) {
    const t: Trace = { pts: line, w: cfg.clock.widthU, net: clockNet }
    d.traces.push(t)
    clkShapes.push(...traceShapes(t))
  }
  for (const p of [...clkFrom, ...clkTo]) {
    used.add(p)
    clkShapes.push({ kind: 'pad', p })
  }
  d.copper.push(clkShapes)
  d.nets.push({ kind: 'clock', sources: clkFrom.map((p) => ({ x: p.x, y: p.y })), driver: 0 })

  // 开关与铜板：右上角，铜板朝角落，触摸盘在它朝开局空地的一侧或下方
  const bc = cfg.button
  const pw = between(rng, bc.plateU)
  const ph = between(rng, bc.plateU)
  const pc = { u: o.hu * (0.42 + rng.next() * 0.12), v: -o.hv * (0.42 + rng.next() * 0.12) }
  const pm = toMap(o, pc.u, pc.v)
  const pwx = o.ux !== 0 ? pw : ph
  const phy = o.ux !== 0 ? ph : pw
  const plate: Plate = { x0: pm.x - pwx / 2, y0: pm.y - phy / 2, x1: pm.x + pwx / 2, y1: pm.y + phy / 2, cut: 0.7, net: d.nets.length }
  const westSide = rng.next() < 0.5
  const reach = between(rng, bc.reachU)
  const bu = westSide ? { u: pc.u - pw / 2 - reach - bc.padU, v: pc.v + (rng.next() * 2 - 1) * (ph / 2 - 1) } : { u: pc.u + (rng.next() * 2 - 1) * (pw / 2 - 1), v: pc.v + ph / 2 + reach + bc.padU }
  const bm = toMap(o, bu.u, bu.v)
  if (Math.hypot(bm.x - cx, bm.y - cy) < cfg.plazaU + bc.padU + 0.6) return null
  if (arenaRoom(arena, bm.x, bm.y) < bc.padU + 1.5 || plateDist(plate, cx, cy) < cfg.plazaU + PLAZA_KEEP_U + 1) return null
  for (const p of d.parts) if (partDist(p, bm.x, bm.y) < bc.padU + 1.2) return null
  for (const corner of [
    [plate.x0, plate.y0],
    [plate.x1, plate.y0],
    [plate.x0, plate.y1],
    [plate.x1, plate.y1],
  ] as const) {
    if (arenaRoom(arena, corner[0], corner[1]) < 1.6) return null
  }
  for (const p of d.parts) if (partDist(p, pm.x, pm.y) < Math.max(pwx, phy) / 2 + 1.6) return null
  for (const s of d.copper.flat()) if (shapeDist(s, pm.x, pm.y) < Math.hypot(pwx, phy) / 2 + NET_GAP_U) return null
  // 连线：从盘边朝铜板出去，接到铜板朝盘那一边的中点
  const toPlate = westSide ? { du: 1, dv: 0 } : { du: 0, dv: -1 }
  const lw = cfg.clock.widthU
  const padEdge: Pad = { x: bm.x, y: bm.y, hw: bc.padU + 0.15, hh: bc.padU + 0.15, nx: o.ux * toPlate.du + o.vx * toPlate.dv, ny: o.uy * toPlate.du + o.vy * toPlate.dv, lead: false }
  const entry = toMap(o, westSide ? pc.u - pw / 2 : bu.u, westSide ? bu.v : pc.v + ph / 2)
  // 连线是一条直线：从盘外 0.35 格起（站在盘上的身体碰不到它），伸进铜板里一点
  const linkPts: Point[] = [padOut(padEdge, 0.2), { x: entry.x - padEdge.nx * 0.3, y: entry.y - padEdge.ny * 0.3 }]
  const linkTrace: Trace = { pts: linkPts, w: lw, net: plate.net }
  const linkShapes = traceShapes(linkTrace)
  for (const sh of linkShapes) {
    for (const p of d.parts) if (shapeDist(sh, p.x, p.y) < Math.hypot(p.bw, p.bh) + PART_KEEP_U) return null
    for (const other of d.copper.flat()) for (let t = 0; t <= 1; t += 0.1) if (shapeDist(other, linkPts[0]!.x + (linkPts[1]!.x - linkPts[0]!.x) * t, linkPts[0]!.y + (linkPts[1]!.y - linkPts[0]!.y) * t) < NET_GAP_U + lw / 2) return null
  }
  d.plates.push(plate)
  d.traces.push(linkTrace)
  d.copper.push([...linkShapes, { kind: 'plate', p: plate }])
  d.nets.push({ kind: 'button', sources: [linkPts[0]!], driver: 0 })
  const button: Button = { x: bm.x, y: bm.y, r: bc.padU, net: plate.net, plate }
  // MOS 管摆在连线旁边
  const lm = { x: (linkPts[0]!.x + linkPts[1]!.x) / 2, y: (linkPts[0]!.y + linkPts[1]!.y) / 2 }
  const side = toMap(o, westSide ? 0 : 1.9, westSide ? 1.9 : 0)
  const qx = lm.x + side.x - o.cx
  const qy = lm.y + side.y - o.cy
  const q1 = makeSot(mpu, 'Q1', '702', qx, qy, o.ux !== 0 ? (westSide ? 0 : 1) : westSide ? 1 : 0, true)
  if (d.copper.flat().every((s) => shapeDist(s, q1.x, q1.y) > 1.4) && partDist(q1, cx, cy) > cfg.plazaU + 0.5) d.parts.push(q1)

  // 电弧：过道当中，一根电极从罩壁伸出来，一根从芯片那边伸过去，尖对着尖
  const gaps: Gap[] = []
  const period = cfg.arc.restMs + cfg.arc.chargeMs + cfg.arc.arcMs
  let gi = 0
  for (const ref of arcAt) {
    const ic = icOf[ref]!
    const wall = wallOf[ref]!
    const inw = INWARD[wall]
    const c = toCanon(o, ic.x, ic.y)
    const wallAt = inw.du !== 0 ? { u: -inw.du * o.hu, v: c.v } : { u: c.u, v: -inw.dv * o.hv }
    const gap = gapOf.get(ref)!
    const outerPad = (ic.axis === 0 ? ic.bh : ic.bw) - 0
    const icSide = inw.du !== 0 ? { u: c.u - inw.du * outerPad, v: c.v } : { u: c.u, v: c.v - inw.dv * outerPad }
    const baseA = toMap(o, wallAt.u, wallAt.v)
    const baseB = toMap(o, icSide.u - inw.du * ELECTRODE.gapU, icSide.v - inw.dv * ELECTRODE.gapU)
    const dirIn = { x: o.ux * inw.du + o.vx * inw.dv, y: o.uy * inw.du + o.vy * inw.dv }
    const ea = makeElectrode(mpu, `E${gi * 2 + 1}`, baseA.x, baseA.y, dirIn.x, dirIn.y)
    const eb = makeElectrode(mpu, `E${gi * 2 + 2}`, baseB.x, baseB.y, -dirIn.x, -dirIn.y)
    d.parts.push(ea, eb)
    const tipA = { x: baseA.x + dirIn.x * ELECTRODE.len, y: baseA.y + dirIn.y * ELECTRODE.len }
    const tipB = { x: baseB.x - dirIn.x * ELECTRODE.len, y: baseB.y - dirIn.y * ELECTRODE.len }
    if (Math.abs(Math.hypot(tipA.x - tipB.x, tipA.y - tipB.y) - gap) > 0.05) return null
    // 蓄电的高压电容在罩外，正对着靠墙那根电极
    const capC = toMap(o, wallAt.u - inw.du * 4.6, wallAt.v - inw.dv * 4.6)
    const cap = makeCan(mpu, `C${20 + gi}`, '400V', capC.x, capC.y, 5, 5.4, dirIn.x !== 0 ? 1 : 0, rng.next() < 0.5 ? -1 : 1, false)
    d.parts.push(cap)
    gaps.push({ a: tipA, b: tipB, cap: { x: cap.x, y: cap.y }, phaseMs: (gi / Math.max(1, arcAt.size)) * period + rng.next() * 600 })
    // 丝印：两尖之间的虚线、高压警示与字
    d.marks.push({ pts: [tipA, tipB], w: 0.1, dash: 0.3 })
    const mid = { x: (tipA.x + tipB.x) / 2, y: (tipA.y + tipB.y) / 2 }
    const along = toMap(o, inw.du !== 0 ? 0 : 1, inw.du !== 0 ? 1 : 0)
    const ax = along.x - o.cx
    const ay = along.y - o.cy
    const off = ELECTRODE.wid / 2 + 1.1
    d.warnings.push({ x: mid.x + ax * off, y: mid.y + ay * off, size: 1.1 })
    d.labels.push({ s: 'HV', x: mid.x - ax * off, y: mid.y - ay * off, size: 0.75, rot: 0 })
    gi++
  }

  // 丝印：位号、框线、网络名、标题
  for (const p of [u1, u2, u3, u4, u5]) {
    icOutline(d, p)
    const end = (p.axis === 0 ? Math.sign(p.x - cx) : Math.sign(p.y - cy)) || 1
    refLabel(d, p, 0.95, -end)
  }
  for (const p of [led, res]) refLabel(d, p, 0.6, -1)
  if (d.parts.includes(q1)) refLabel(d, q1, 0.6, 1)
  // 网络名印在离电源不远的一段横平竖直的线旁边、背着开局空地的那一侧
  const beside = (s: string, line: readonly Point[], off: number): void => {
    const size = 0.8
    let best = -1
    let bestLen = 0
    let acc = 0
    for (let i = 1; i < line.length && acc < 9; i++) {
      const a = line[i - 1]!
      const b = line[i]!
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      acc += len
      if ((Math.abs(b.x - a.x) < 1e-6 || Math.abs(b.y - a.y) < 1e-6) && len > bestLen) {
        best = i
        bestLen = len
      }
    }
    if (best < 0 || bestLen < 1.5) return
    const a = line[best - 1]!
    const b = line[best]!
    const px = (a.x + b.x) / 2
    const py = (a.y + b.y) / 2
    const nx = (b.y - a.y) / bestLen
    const ny = -(b.x - a.x) / bestLen
    const sgn = (px - cx) * nx + (py - cy) * ny >= 0 ? 1 : -1
    const r = off + 0.15 + (Math.abs(nx) > 0.5 ? textWidth(s, size) / 2 : size / 2)
    d.labels.push({ s, x: px + nx * sgn * r, y: py + ny * sgn * r, size, rot: 0 })
  }
  beside('+5V', railBus[0]!, railW / 2)
  beside('CLK', bus[0]!, (n - 1) * cfg.clock.pitchU + cfg.clock.widthU / 2)
  // 开关的字印在背着连线的那一侧：TOUCH 正对着连线的反方向，SW1 在旁边
  const away = { x: -padEdge.nx, y: -padEdge.ny }
  const across = { x: -away.y, y: away.x }
  const room = (sgn: number, size: number, s: string): Label => ({
    s,
    x: bm.x + across.x * sgn * (bc.padU + 0.75 + textWidth(s, size) * 0.5 * Math.abs(across.x)),
    y: bm.y + across.y * sgn * (bc.padU + 0.75 + size * 0.5 * Math.abs(across.y)),
    size,
    rot: 0,
  })
  d.labels.push(room(1, 0.75, 'SW1'), room(-1, 0.65, 'TOUCH'))
  d.labels.push({ s: 'WARMOJI', x: cx, y: cy - 0.6, size: 1.25, rot: 0 }, { s: 'REV A  2026', x: cx, y: cy + 1.25, size: 0.6, rot: 0 })
  const tw = textWidth('WARMOJI', 1.25) / 2 + 0.9
  const box = { x0: cx - tw, y0: cy - 2.1, x1: cx + tw, y1: cy + 2.4 }
  const keepout: Box = { x0: box.x0 - 0.35, y0: box.y0 - 0.35, x1: box.x1 + 0.35, y1: box.y1 + 0.35 }
  d.marks.push({
    pts: [
      { x: box.x0 + 0.5, y: box.y0 },
      { x: box.x1 - 0.5, y: box.y0 },
      { x: box.x1, y: box.y0 + 0.5 },
      { x: box.x1, y: box.y1 - 0.5 },
      { x: box.x1 - 0.5, y: box.y1 },
      { x: box.x0 + 0.5, y: box.y1 },
      { x: box.x0, y: box.y1 - 0.5 },
      { x: box.x0, y: box.y0 + 0.5 },
      { x: box.x0 + 0.5, y: box.y0 },
    ],
    w: 0.12,
    dash: 0,
  })

  // 阻焊层下不带电的细线：几颗芯片之间连几束，走不通就算了
  const signalKeep = { wall: SIGNAL_KEEP.wall, part: SIGNAL_KEEP.part, hazard: SIGNAL_KEEP.hazard, signal: SIGNAL_KEEP.other, plaza: cfg.plazaU - 0.5 }
  const free = (pads: readonly Pad[]): Pad[] => pads.filter((p) => !used.has(p))
  const pairs: [Pad[], Pad[]][] = [
    [free(facing(d, u2, 0, 1)).slice(-3), free(facing(d, u3, -1, 0)).slice(0, 3)],
    [free(facing(d, u1, 1, 0)).slice(-2), u5Wall === 'S' ? free(facing(d, u5, 0, -1)).slice(0, 2) : free(facing(d, u5, 1, 0)).slice(0, 2)],
    [free(facing(d, u4, 0, -1)).slice(0, 3), u5Wall === 'S' ? free(facing(d, u5, 0, -1)).slice(-3) : free(facing(d, u5, 1, 0)).slice(-3)],
  ]
  for (const [a, b] of pairs) {
    const k = Math.min(a.length, b.length)
    if (k === 0) continue
    const pa = a.slice(0, k)
    const pb = b.slice(0, k)
    if (pa.some((p) => used.has(p)) || pb.some((p) => used.has(p))) continue
    const pitch = Math.hypot(pa[k - 1]!.x - pa[0]!.x, pa[k - 1]!.y - pa[0]!.y) / Math.max(1, k - 1)
    const lines = routeBus(d, pa, pb, SIGNAL_U, pitch, signalKeep)
    if (!lines) continue
    for (const line of lines) d.traces.push({ pts: line, w: SIGNAL_U, net: -1 })
    for (const p of [...pa, ...pb]) used.add(p)
  }
  // 芯片到它旁边的电感、晶振各一条细线
  const nearestPad = (p: Part, to: Part): Pad => p.pads.reduce((m, q) => (Math.hypot(q.x - to.x, q.y - to.y) < Math.hypot(m.x - to.x, m.y - to.y) ? q : m))
  const link2 = (a: Pad | undefined, b: Pad | undefined): void => {
    if (!a || !b || used.has(a) || used.has(b)) return
    const lines = routeBus(d, [a], [b], SIGNAL_U, 0, signalKeep)
    if (!lines) return
    d.traces.push({ pts: lines[0]!, w: SIGNAL_U, net: -1 })
    used.add(a).add(b)
  }
  if (l1) link2(free(facing(d, u1, 1, 0))[0], nearestPad(l1, u1))
  if (y1) link2(free(facing(d, u2, 0, 1))[0], nearestPad(y1, u2))

  // 能走的地面：屏蔽罩里、元件外，留下与开局空地连通的一块
  const inside = d.parts.filter((p) => p.inside)
  const open = (px: number, py: number): boolean => {
    const x = px / UNIT
    const y = py / UNIT
    if (arenaRoom(arena, x, y) < FRAME_CLEAR_U) return false
    for (const p of inside) if (partDist(p, x, y) < PART_CLEAR_U) return false
    return true
  }
  const cell = BASIN_CELL_U * UNIT
  const nb = Math.ceil(S / BASIN_CELL_U) + 2
  const start: Point = { x: cx, y: cy }
  const basin = makeBasin(open, -cell, -cell, nb, nb, cell, { x: cx * UNIT, y: cy * UNIT }, cfg.neckU * UNIT)
  let cells = 0
  for (let i = 0; i < basin.room.length; i++) if (basin.room[i]! > 0) cells++
  const area = cells * BASIN_CELL_U * BASIN_CELL_U
  if (area < cfg.areaU2[0] || area > cfg.areaU2[1]) return null
  if (roomAt(basin, cx * UNIT, cy * UNIT) < (cfg.plazaU - 0.5) * UNIT) return null
  // 电弧的两尖之间、铜板与开关都在能走的地面上
  for (const g of gaps) if (roomAt(basin, ((g.a.x + g.b.x) / 2) * UNIT, ((g.a.y + g.b.y) / 2) * UNIT) < 0.5 * UNIT) return null
  if (roomAt(basin, bm.x * UNIT, bm.y * UNIT) < bc.padU * UNIT) return null
  if (roomAt(basin, pm.x * UNIT, pm.y * UNIT) <= 0) return null

  // 不带电的细线拉出去的过孔与罩外的布景
  const occupied = (x: number, y: number, r: number): boolean => {
    if (Math.hypot(x - cx, y - cy) < cfg.plazaU - 0.5 + r) return true
    if (arenaRoom(arena, x, y) > -FRAME_WALL_U - FRAME_LIP_U - r && arenaRoom(arena, x, y) < r) return true
    for (const p of d.parts) if (partDist(p, x, y) < r) return true
    for (const t of d.traces) if (polylineDist(t.pts, x, y) < t.w / 2 + r) return true
    for (const pl of d.plates) if (plateDist(pl, x, y) < r) return true
    if (Math.hypot(x - bm.x, y - bm.y) < bc.padU + r + 0.4) return true
    for (const v of d.vias) if (Math.hypot(x - v.x, y - v.y) < v.r + r) return true
    return false
  }
  // 靠墙那排脚拉几条细线横过过道，到罩壁跟前打过孔下到内层
  const lineFree = (a: Point, b: Point, r: number): boolean => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.2)
    for (let i = 1; i <= n; i++) {
      const t = i / n
      const x = a.x + (b.x - a.x) * t
      const y = a.y + (b.y - a.y) * t
      if (d.parts.some((p) => partDist(p, x, y) < r)) return false
    }
    return true
  }
  for (const [ic, wall] of [
    [u1, 'W'],
    [u2, 'N'],
    [u3, 'E'],
    [u4, 'S'],
    [u5, u5Wall],
  ] as const) {
    const inw = INWARD[wall]
    for (const pad of facing(d, ic, -inw.du, -inw.dv)) {
      if (used.has(pad) || rng.next() < 0.4) continue
      const c = toCanon(o, pad.x, pad.y)
      const wallAt = inw.du !== 0 ? -inw.du * o.hu : -inw.dv * o.hv
      const reach = Math.abs((inw.du !== 0 ? c.u : c.v) - wallAt) - 1.1
      if (reach < 1) continue
      const end = padOut(pad, reach - (pad.nx !== 0 ? pad.hw : pad.hh))
      if (!lineFree({ x: pad.x, y: pad.y }, end, 0.35) || occupied(end.x, end.y, 0.55)) continue
      d.traces.push({ pts: [{ x: pad.x, y: pad.y }, end], w: SIGNAL_U * 0.9, net: -1 })
      d.vias.push({ x: end.x, y: end.y, r: 0.36, hole: 0.16, open: false })
      used.add(pad)
    }
  }
  // 空着的地方拉几束细线过去，末端一排过孔下到内层
  for (let k = 0, tries = 0; k < 3 && tries < 60; tries++) {
    const t = { x: arena.x0 + 3 + rng.next() * (arena.x1 - arena.x0 - 6), y: arena.y0 + 3 + rng.next() * (arena.y1 - arena.y0 - 6) }
    if (Math.hypot(t.x - cx, t.y - cy) < cfg.plazaU + 3 || arenaRoom(arena, t.x, t.y) < 2.5) continue
    if (d.parts.some((p) => partDist(p, t.x, t.y) < 3.5) || d.copper.flat().some((sh) => shapeDist(sh, t.x, t.y) < 2.2)) continue
    const ics = [u1, u2, u3, u4, u5].sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))
    let done = false
    for (const ic of ics.slice(0, 2)) {
      const dir = norm2(t.x - ic.x, t.y - ic.y)
      const row = ic.pads.filter((p) => !used.has(p) && p.nx * dir.x + p.ny * dir.y > 0.3)
      if (row.length < 2) continue
      const kk = Math.min(row.length, 2 + Math.floor(rng.next() * 3))
      const start = Math.floor(rng.next() * (row.length - kk + 1))
      const pa = row
        .sort((a, b) => (a.nx !== 0 ? a.y - b.y : a.x - b.x))
        .slice(start, start + kk)
      if (pa.some((p) => p.nx !== pa[0]!.nx || p.ny !== pa[0]!.ny)) continue
      const pitch = kk > 1 ? Math.hypot(pa[kk - 1]!.x - pa[0]!.x, pa[kk - 1]!.y - pa[0]!.y) / (kk - 1) : 1
      // 目标处排一行和出线一样间距的假焊盘：线头朝着芯片的方向斜过来，落在一排过孔上
      const axisX = Math.abs(dir.x) >= Math.abs(dir.y)
      const pb: Pad[] = Array.from({ length: kk }, (_, i) => {
        const off = (i - (kk - 1) / 2) * pitch
        return { x: t.x + (axisX ? 0 : off), y: t.y + (axisX ? off : 0), hw: 0.2, hh: 0.2, nx: axisX ? -Math.sign(dir.x) : 0, ny: axisX ? 0 : -Math.sign(dir.y), lead: false }
      })
      const lines = routeBus(d, pa, pb, SIGNAL_U, pitch, signalKeep)
      if (!lines) continue
      for (const line of lines) {
        d.traces.push({ pts: line, w: SIGNAL_U, net: -1 })
        const e = line[line.length - 1]!
        d.vias.push({ x: e.x, y: e.y, r: 0.36, hole: 0.16, open: false })
      }
      for (const p of pa) used.add(p)
      done = true
      break
    }
    if (done) k++
  }
  for (const p of [u1, u2, u3, u4, u5]) fanOut(d, p, used, (x, y, r) => !occupied(x, y, r) && Math.hypot(x - cx, y - cy) > cfg.plazaU + 1)
  // 丝印字占着的地方
  const onLabel = (x: number, y: number, m: number): boolean =>
    d.labels.some((l) => {
      const hw = textWidth(l.s, l.size) / 2 + m
      const hh = l.size / 2 + m
      return l.rot === 0 ? Math.abs(x - l.x) < hw && Math.abs(y - l.y) < hh : Math.abs(x - l.x) < hh && Math.abs(y - l.y) < hw
    })
  // 测试点：几块圆形的金，旁边印着编号
  const testpoints: Point[] = []
  for (let tries = 0; tries < 80 && testpoints.length < 4; tries++) {
    const t = { x: arena.x0 + 2 + rng.next() * (arena.x1 - arena.x0 - 4), y: arena.y0 + 2 + rng.next() * (arena.y1 - arena.y0 - 4) }
    if (arenaRoom(arena, t.x, t.y) < 2 || occupied(t.x, t.y, 1.3) || onLabel(t.x, t.y, 1) || onLabel(t.x + 1.6, t.y, 0.5) || d.copper.flat().some((sh) => shapeDist(sh, t.x, t.y) < 1.6)) continue
    if (testpoints.some((q) => Math.hypot(q.x - t.x, q.y - t.y) < 6)) continue
    testpoints.push(t)
    const ring = Array.from({ length: 33 }, (_, i) => ({ x: t.x + Math.cos((i / 32) * Math.PI * 2) * 0.72, y: t.y + Math.sin((i / 32) * Math.PI * 2) * 0.72 }))
    d.marks.push({ pts: ring, w: 0.08, dash: 0 })
    d.labels.push({ s: `TP${testpoints.length}`, x: t.x + 0.95 + textWidth(`TP${testpoints.length}`, 0.6) / 2, y: t.y, size: 0.6, rot: 0 })
  }
  // 一张贴在板上的条码纸
  let sticker: Sticker | null = null
  for (let tries = 0; tries < 60 && !sticker; tries++) {
    const rot: 0 | 1 = rng.next() < 0.5 ? 0 : 1
    const w = 5.2
    const h = 1.9
    const t = { x: arena.x0 + 4 + rng.next() * (arena.x1 - arena.x0 - 8), y: arena.y0 + 4 + rng.next() * (arena.y1 - arena.y0 - 8) }
    const hw = rot === 0 ? w / 2 : h / 2
    const hh = rot === 0 ? h / 2 : w / 2
    const spots = [t, { x: t.x - hw, y: t.y - hh }, { x: t.x + hw, y: t.y - hh }, { x: t.x - hw, y: t.y + hh }, { x: t.x + hw, y: t.y + hh }]
    if (spots.some((q) => occupied(q.x, q.y, 0.6) || onLabel(q.x, q.y, 0.4) || arenaRoom(arena, q.x, q.y) < 1.5)) continue
    if (d.copper.flat().some((sh) => shapeDist(sh, t.x, t.y) < Math.hypot(hw, hh) + 1)) continue
    if (testpoints.some((q) => Math.abs(q.x - t.x) < hw + 1.5 && Math.abs(q.y - t.y) < hh + 1.5)) continue
    const hex = Math.floor(rng.next() * 0xffffff).toString(16).toUpperCase().padStart(6, '0')
    sticker = { x: t.x, y: t.y, w, h, rot, code: `SN${hex}` }
  }
  const holes = [
    { x: -cfg.padU * 0.45, y: -cfg.padU * 0.45 },
    { x: S + cfg.padU * 0.45, y: -cfg.padU * 0.45 },
    { x: S + cfg.padU * 0.45, y: S + cfg.padU * 0.45 },
    { x: -cfg.padU * 0.45, y: S + cfg.padU * 0.45 },
  ]
  furnishOutside(d, S, cfg.padU, holes)
  for (const p of d.parts.filter((q) => !q.inside && q.kind === 'ic')) fanOut(d, p, new Set(), (x, y, r) => !occupied(x, y, r) && arenaRoom(arena, x, y) < -FRAME_WALL_U - FRAME_LIP_U - r)
  // 铺铜上每隔一段打一个过孔，把地连到底层
  const stitch = 2.6
  const sx = rng.next() * stitch
  const sy = rng.next() * stitch
  for (let y = -cfg.padU + sy; y < S + cfg.padU; y += stitch) {
    for (let x = -cfg.padU + sx; x < S + cfg.padU; x += stitch) {
      if (rng.next() < 0.25 || occupied(x, y, 0.75)) continue
      d.vias.push({ x, y, r: 0.3, hole: 0.13, open: false })
    }
  }
  // 基准点与罩外四角的安装孔
  const fiducials = [toMap(o, -o.hu + 2.6, o.hv - 2.6), toMap(o, o.hu - 2.6, -o.hv + 2.6)].filter((p) => !occupied(p.x, p.y, 1.2))

  const { grid: copper, lengths } = rasterCopper(arena, d.copper, d.nets)
  const nets: Net[] = d.nets.map((nt, i) => ({ kind: nt.kind, sources: nt.sources, driver: nt.driver, length: lengths[i]! }))
  const clocks: Clock[] = [{ nets: [clockNet], led: { x: led.x, y: led.y }, chip: { x: u3.x, y: u3.y }, phaseMs: rng.next() * (cfg.clock.offMs + cfg.clock.warnMs + cfg.clock.onMs) }]
  return {
    size: S,
    seed,
    arena,
    basin,
    start,
    parts: d.parts,
    traces: d.traces,
    plates: d.plates,
    vias: d.vias,
    labels: d.labels,
    marks: d.marks,
    warnings: d.warnings,
    fiducials,
    holes,
    testpoints,
    sticker,
    keepout,
    nets,
    clocks,
    gaps,
    buttons: [button],
    copper,
  }
}

let last: { cfg: CircuitConfig; seed: number; plan: CircuitPlan } | null = null

/** 按种子生成电路板：哪一步不合格就换一组随机数。同一块板视图与规则各要一次，记住最近一块 */
export function circuitPlan(cfg: CircuitConfig, seed: number): CircuitPlan {
  if (last && last.cfg === cfg && last.seed === seed) return last.plan
  const rng = new Rng(scramble(seed))
  for (let k = 0; k < TRIES; k++) {
    const plan = attempt(cfg, rng)
    if (!plan) continue
    last = { cfg, seed, plan }
    return plan
  }
  throw new Error(`电路板生成不出来：种子 ${seed}`)
}

/** 带电的铜在 (x, y)（格）处：最近的网络、离它多远、沿铜离电源多远；格子外返回 null */
export function copperAt(g: CopperGrid, x: number, y: number): { net: number; dist: number; along: number } | null {
  const cx = Math.floor((x - g.x0) / g.cell)
  const cy = Math.floor((y - g.y0) / g.cell)
  if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) return null
  const i = cy * g.cols + cx
  const net = g.net[i]!
  if (net < 0) return null
  return { net, dist: g.dist[i]!, along: g.along[i]! }
}
