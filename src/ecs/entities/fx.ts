import { addComponents, addEntity, query, removeEntity } from 'bitecs'
import { DamageNumber, Depth, Fx, FxBeam, FxBolt, FxBoom, FxCircle, FxSlash, Transform } from '../components'
import { boltPts } from '../store'
import { attachDrawable } from './drawable'
import type { CircleCue } from '../render/cues'
import type { Sim } from '../sim'

// 一次性战斗特效实体（阵营中立，放完即弃）。机制侧只管「放一个什么样的特效」，
// 绘制全在 render/cues.ts（GAS GameplayCue 思路：机制不依赖渲染）。
//
// 上限不是存储方式，是一条规则：同屏并发超出即顶掉最老的一个（顶掉的是放了最久、
// 最接近淡完的那个，肉眼基本看不出）。旧实现用定长数组 + 环形游标来表达它，
// 于是上限与存储绑死；现在上限就写在这里，存储照常是实体。

/** 固定时长（旧实现里是绘制层的常量，现在是投放时写进 Fx.durMs 的值） */
const BEAM_MS = 200
const BOLT_MS = 200
const SLASH_MS = 220
const BOOM_MS = 340
const RISE_MS = 350
/** 单条闪电的折点上限（超出截断；连锁传导实际只有三四个点） */
const BOLT_PTS = 8
/** 💥 的深度：落在 spriteBatch 的 [30,60) 带（Phaser depth 9），与旧实现同层 */
const BOOM_Z = 30

/** 同屏并发上限（与旧实现的池容量同值） */
const CAP = { circle: 64, beam: 16, bolt: 16, slash: 16, boom: 24, damage: 256 }

/** 超额即顶掉最老的一个（按出生时刻，不按查询集的物理次序） */
function capFx(sim: Sim, comp: object, cap: number): void {
  const live = query(sim.world, [Fx, comp])
  if (live.length < cap) return
  let oldest = live[0]!
  for (const e of live) if (Fx.bornMs[e]! < Fx.bornMs[oldest]!) oldest = e
  removeEntity(sim.world, oldest)
}

function newFx(sim: Sim, comp: object, cap: number, x: number, y: number, durMs: number, z: number): number {
  capFx(sim, comp, cap)
  const eid = addEntity(sim.world)
  addComponents(sim.world, eid, Fx, Transform, Depth, comp)
  Fx.bornMs[eid] = sim.fxMs
  Fx.durMs[eid] = durMs
  Transform.x[eid] = x
  Transform.y[eid] = y
  Transform.rot[eid] = 0
  Depth.z[eid] = z
  return eid
}

/** 扩散淡出的圆 */
export function spawnFxCircle(sim: Sim, x: number, y: number, radius: number, c: CircleCue): number {
  const eid = newFx(sim, FxCircle, CAP.circle, x, y, c.durationMs, c.depth)
  FxCircle.r[eid] = radius
  FxCircle.from[eid] = c.fromScale
  FxCircle.to[eid] = c.toScale
  FxCircle.fill[eid] = c.fill
  FxCircle.fillAlpha[eid] = c.fillAlpha
  FxCircle.stroke[eid] = c.stroke ?? -1
  FxCircle.lineW[eid] = c.lineWidth ?? 2
  FxCircle.lineAlpha[eid] = c.lineAlpha ?? 1
  return eid
}

/** 命中环：从锚点扩张淡出的一圈（弹道机器与能力效果链共用，不各画一遍） */
export function spawnFxRing(
  sim: Sim,
  x: number,
  y: number,
  radius: number,
  r: { color: number; fillAlpha: number; lineWidth: number; lineAlpha: number; durMs: number },
): number {
  return spawnFxCircle(sim, x, y, radius, {
    fill: r.color,
    fillAlpha: r.fillAlpha,
    stroke: r.color,
    lineWidth: r.lineWidth,
    lineAlpha: r.lineAlpha,
    fromScale: 0.3,
    toScale: 1,
    durationMs: r.durMs,
    depth: 7,
  })
}

/** 贯穿光束（外层色带在 7 带、白芯在 8 带；两带共读同一颗实体） */
export function spawnFxBeam(
  sim: Sim,
  x: number,
  y: number,
  angle: number,
  length: number,
  radius: number,
  color: number,
): number {
  const eid = newFx(sim, FxBeam, CAP.beam, x, y, BEAM_MS, 7)
  Transform.rot[eid] = angle
  FxBeam.len[eid] = length
  FxBeam.radius[eid] = radius
  FxBeam.color[eid] = color
  return eid
}

/** 锯齿闪电折线：沿折点串每段拆几截加垂直抖动。抖动在此算死——每帧重算会疯狂跳动 */
export function spawnFxBolt(sim: Sim, points: readonly { x: number; y: number }[], color: number): number {
  const pts: number[] = [points[0]!.x, points[0]!.y]
  for (let p = 1; p < points.length && pts.length < BOLT_PTS * 2; p++) {
    const a = points[p - 1]!
    const b = points[p]!
    const segs = 4
    for (let s = 1; s <= segs && pts.length < BOLT_PTS * 2; s++) {
      const t = s / segs
      const nx = -(b.y - a.y)
      const ny = b.x - a.x
      const len = Math.hypot(nx, ny) || 1
      const jitter = s === segs ? 0 : (Math.random() - 0.5) * 18
      pts.push(a.x + (b.x - a.x) * t + (nx / len) * jitter, a.y + (b.y - a.y) * t + (ny / len) * jitter)
    }
  }
  const eid = newFx(sim, FxBolt, CAP.bolt, pts[0]!, pts[1]!, BOLT_MS, 9)
  FxBolt.n[eid] = pts.length / 2
  FxBolt.color[eid] = color
  boltPts[eid] = Float32Array.from(pts)
  return eid
}

/** 💥 爆裂：缩小随机微转弹出到全尺寸并淡出。它是精灵不是形状——贴图走图集，
 * 由 spriteBatch 画（z=30 那条带），逐帧的缩放/淡出在 systems/animateBooms */
export function spawnFxBoom(sim: Sim, x: number, y: number, size: number): number {
  capFx(sim, FxBoom, CAP.boom)
  const eid = addEntity(sim.world)
  addComponents(sim.world, eid, Fx, FxBoom)
  Fx.bornMs[eid] = sim.fxMs
  Fx.durMs[eid] = BOOM_MS
  FxBoom.size[eid] = size
  attachDrawable(sim.world, eid, sim.frames, {
    id: '1f4a5',
    outline: undefined, // 特效不描边：描一圈会把同一标称尺寸的墨迹撑大一圈（见 manifest 的 PLAIN_EMOJIS）
    x,
    y,
    size: size * 0.4, // 起始 0.4 倍，由 animateBooms 弹到全尺寸
    rot: (Math.random() - 0.5) * 0.8,
    z: BOOM_Z,
  })
  return eid
}

/** 伤害飘字：命中点上浮淡出的数字。绘制在 render/damageText.ts（自绘字形四边形），
 * 故这里只有数据，不挂 Sprite */
export function spawnDamageNumber(sim: Sim, x: number, y: number, amount: number, crit: boolean): number {
  capFx(sim, DamageNumber, CAP.damage)
  const eid = addEntity(sim.world)
  addComponents(sim.world, eid, Fx, DamageNumber, Transform)
  Fx.bornMs[eid] = sim.fxMs
  Fx.durMs[eid] = RISE_MS
  Transform.x[eid] = x
  Transform.y[eid] = y - 14 // 起点略高于命中点（与旧实现同）
  DamageNumber.value[eid] = amount
  DamageNumber.crit[eid] = crit ? 1 : 0
  return eid
}

/** 斩击弧光 */
export function spawnFxSlash(sim: Sim, x: number, y: number, angle: number, radius: number): number {
  const eid = newFx(sim, FxSlash, CAP.slash, x, y, SLASH_MS, 9)
  Transform.rot[eid] = angle
  FxSlash.r[eid] = radius
  return eid
}
