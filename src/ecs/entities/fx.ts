import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { Depth, Fx, FxBeam, FxBolt, FxBoom, FxCircle, FxSlash, Transform } from '../components'
import { boltPts } from '../store'
import { pushDamageNumber } from '../damageNumbers'
import { attachDrawable } from './drawable'
import type { CircleCue } from '../render/cues'
import type { Sim } from '../sim'

const BEAM_MS = 200
const BOLT_MS = 200
const SLASH_MS = 220
const BOOM_MS = 340
/** 压在被保护中心之上、队员之下 */
const BOOM_Z = 9

function newFx(sim: Sim, comp: object, x: number, y: number, durMs: number, z: number): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Fx, Transform, Depth, comp)
  Fx.bornMs[eid] = sim.fxMs
  Fx.durMs[eid] = durMs
  Transform.x[eid] = x
  Transform.y[eid] = y
  Transform.rot[eid] = 0
  Depth.z[eid] = z
  return eid
}

export function spawnFxCircle(sim: Sim, x: number, y: number, radius: number, c: CircleCue): number {
  const eid = newFx(sim, FxCircle, x, y, c.durationMs, c.depth)
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
  const eid = newFx(sim, FxBeam, x, y, BEAM_MS, 7)
  Transform.rot[eid] = angle
  FxBeam.len[eid] = length
  FxBeam.radius[eid] = radius
  FxBeam.color[eid] = color
  return eid
}

/** 锯齿闪电折线：沿折点串每段拆几截加垂直抖动。抖动在此算死——每帧重算会疯狂跳动 */
export function spawnFxBolt(sim: Sim, points: readonly { x: number; y: number }[], color: number): number {
  const pts: number[] = [points[0]!.x, points[0]!.y]
  for (let p = 1; p < points.length; p++) {
    const a = points[p - 1]!
    const b = points[p]!
    const segs = 4
    for (let s = 1; s <= segs; s++) {
      const t = s / segs
      const nx = -(b.y - a.y)
      const ny = b.x - a.x
      const len = Math.hypot(nx, ny) || 1
      const jitter = s === segs ? 0 : (Math.random() - 0.5) * 18
      pts.push(a.x + (b.x - a.x) * t + (nx / len) * jitter, a.y + (b.y - a.y) * t + (ny / len) * jitter)
    }
  }
  const eid = newFx(sim, FxBolt, pts[0]!, pts[1]!, BOLT_MS, 9)
  FxBolt.n[eid] = pts.length / 2
  FxBolt.color[eid] = color
  boltPts[eid] = Float32Array.from(pts)
  return eid
}

/** 💥 爆裂：缩小随机微转弹出到全尺寸并淡出。它是精灵不是形状——贴图走图集，
 * 由 spriteBatch 画（深度 8 那条带），逐帧的缩放/淡出在 systems/animateBooms */
export function spawnFxBoom(sim: Sim, x: number, y: number, size: number): number {
  const eid = newEntity(sim.world)
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

/** 伤害飘字：命中点上浮淡出的数字，绘制在 render/damageText.ts */
export function spawnDamageNumber(sim: Sim, x: number, y: number, amount: number, crit: boolean): void {
  if (!sim.damageNumbers) return
  pushDamageNumber(sim.damageNumbers, x, y - 14, amount, crit, sim.fxMs) // 起点略高于命中点
}

/** 斩击弧光 */
export function spawnFxSlash(sim: Sim, x: number, y: number, angle: number, radius: number): number {
  const eid = newFx(sim, FxSlash, x, y, SLASH_MS, 9)
  Transform.rot[eid] = angle
  FxSlash.r[eid] = radius
  return eid
}
