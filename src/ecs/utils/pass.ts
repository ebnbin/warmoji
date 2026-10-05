import { hasComponent, query } from 'bitecs'
import { MATERIALS, OBSTACLES } from '../../data/obstacles'
import { Barrier, Motion, MOTION, Phasing, Proj, Span } from '../components'
import { barrierHit, hostileTo } from '../entities/barrier'
import type { ObstacleId, Span as Layers } from '../../types/obstacles'
import type { Source } from './source'
import type { EcsWorld } from '../world'
import type { Sim } from '../sim'

/** 一次探测：沿线段飞的弹体、看过去的视线或够过去的出手。两端离地多高（米），中间比两端的连线再高出 arc 米（抛物线），一路还能贯穿几次 */
export interface Probe {
  readonly via: 'shot' | 'sight'
  readonly h0: number
  readonly h1: number
  readonly arc: number
  readonly pierce: number
}

/** 线段上的一处实心：从 t0 进、t1 出（按线段从 0 到 1），什么材质 */
export interface Crossing {
  readonly t0: number
  readonly t1: number
  readonly material: ObstacleId
}

/** 挡住探测的地方：线段 t 处的 (x, y)、挡它的材质；挡下它的是技能墙时记着哪一面，否则为 -1 */
export interface Block {
  readonly x: number
  readonly y: number
  readonly t: number
  readonly material: ObstacleId
  readonly barrier: number
}

/** 一段探测的结果：第一处挡住的地方（没有为 null）与一路贯穿掉的次数 */
export interface Passage {
  readonly block: Block | null
  readonly spent: number
}

const B = OBSTACLES.body
/** 一层多高，米 */
export const LAYER_M = B.heightM / B.layers
/** 标准身体占的层：英雄与没写身段的非玩家身体都是它 */
export const STANDARD: Layers = [0, B.layers - 1]
/** 贴着地的一层：掉落物、地上的场 */
export const FLOOR: Layers = [0, 0]
/** 平射在标准身体的顶层飞 */
const CHEST = B.layers - 1
/** 爆炸与落地的冲击从离地多高打出去，米 */
export const BLAST_M = OBSTACLES.blastM

/** 第 k 层正中离地多高，米 */
export function layerZ(k: number): number {
  return (k + 0.5) * LAYER_M
}

/** 离地 z 米落在第几层 */
export function layerAt(z: number): number {
  return Math.floor(z / LAYER_M)
}

/** 高 h 米的障碍从地面往上占几层 */
export function layersOf(h: number): number {
  return Math.ceil(h / LAYER_M - 1e-9)
}

/** 高 h 米的障碍按占满的整层算，顶离地多高 */
export function topOf(h: number): number {
  return h === Infinity ? h : layersOf(h) * LAYER_M
}

/** 弧线里腾空的身体整段往上挪一层 */
function lift(world: EcsWorld, eid: number): number {
  return hasComponent(world, eid, Motion) && Motion.kind[eid] === MOTION.arc ? 1 : 0
}

/** 身体此刻占的最低一层 */
export function loOf(world: EcsWorld, eid: number): number {
  return Span.lo[eid]! + lift(world, eid)
}

/** 身体此刻占的最高一层 */
export function hiOf(world: EcsWorld, eid: number): number {
  return Span.hi[eid]! + lift(world, eid)
}

/** 身体此刻占的层 */
export function spanOf(world: EcsWorld, eid: number): Layers {
  return [loOf(world, eid), hiOf(world, eid)]
}

/** 脚沾着地：占着贴地的一层，没在弧线里腾空，也没在穿行 */
export function grounded(world: EcsWorld, eid: number): boolean {
  if (Span.lo[eid] !== 0) return false
  if (!hasComponent(world, eid, Motion)) return true
  const k = Motion.kind[eid]
  return k !== MOTION.arc && k !== MOTION.transit
}

/** 占 lo 到 hi 层的身体从哪一层出手：标准身体的顶层，矮的取自己的顶层，悬在它上面的取自己的底层 */
export function muzzleOf(lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, CHEST))
}

/** 从 lo..hi 层出手打占 tlo..thi 层的身体，弹体在哪一层飞：出手的那一层，打不着它就取它离那一层最近的一层 */
export function aimLayer(lo: number, hi: number, tlo: number, thi: number): number {
  return Math.min(thi, Math.max(tlo, muzzleOf(lo, hi)))
}

/** 身体过得去多少层高的障碍：从脚下往上 ⌊层数·step⌋ 层以内的 */
export function overOf(lo: number, hi: number): number {
  return lo + Math.floor((hi - lo + 1) * B.step)
}

/** 身体过得去多高的障碍，米 */
export function clearM(eid: number): number {
  return overOf(Span.lo[eid]!, Span.hi[eid]!) * LAYER_M
}

/** 眼睛在顶层正中；装置、宠物这些不是身体的出手处按标准身体看 */
export function eyeM(world: EcsWorld, eid: number): number {
  return layerZ(hasComponent(world, eid, Span) ? hiOf(world, eid) : STANDARD[1])
}

/** 占 lo..hi 层的身体挨不挨得到离地 z 米处的东西 */
export function inSpan(lo: number, hi: number, z: number): boolean {
  return z >= lo * LAYER_M && z < (hi + 1) * LAYER_M
}

/** 探测在线段 t 处离地多高，米 */
export function probeZ(p: Probe, t: number): number {
  return p.h0 + (p.h1 - p.h0) * t + 4 * p.arc * t * (1 - t)
}

/** 从 t 起的那一截探测：抛物线截出来仍是抛物线，拱起按截下的长度的平方缩 */
function tail(p: Probe, t: number, pierce: number): Probe {
  const k = 1 - t
  return { via: p.via, h0: probeZ(p, t), h1: p.h1, arc: p.arc * k * k, pierce }
}

/** 穿过一处这种材质的实心要贯穿几次：视线碰上不透光的过不去，弹体与出手按材质 */
export function passCost(p: Probe, material: ObstacleId): number {
  const m = MATERIALS[material]
  if (p.via === 'sight') return m.opaque ? Infinity : 0
  return m.pierce ?? Infinity
}

/**
 * 地图上沿线段 a→b 的探测：地图报出第一处探测在它里面、又要贯穿才过得去的实心，贯穿得过的扣掉次数从它背后接着查。
 * 没写 trace 的地图按 wallHit：碰上就挡，当作岩体
 */
export function terrainPass(sim: Sim, p: Probe, ax: number, ay: number, bx: number, by: number): Passage {
  const h = sim.hooks
  if (!h.trace) {
    const hit = h.wallHit?.(sim, ax, ay, bx, by) ?? null
    if (!hit) return { block: null, spent: 0 }
    const len = Math.hypot(bx - ax, by - ay)
    return { block: { x: hit.x, y: hit.y, t: len > 0 ? Math.hypot(hit.x - ax, hit.y - ay) / len : 0, material: 'rock', barrier: -1 }, spent: 0 }
  }
  let from = 0
  let left = p.pierce
  for (let k = 0; k < 16 && from < 1; k++) {
    const q = from === 0 ? p : tail(p, from, left)
    const c = h.trace(sim, q, ax + (bx - ax) * from, ay + (by - ay) * from, bx, by)
    if (!c) break
    const t0 = from + (1 - from) * c.t0
    const cost = passCost(p, c.material)
    if (cost > left) return { block: { x: ax + (bx - ax) * t0, y: ay + (by - ay) * t0, t: t0, material: c.material, barrier: -1 }, spent: p.pierce - left }
    left -= cost
    from = Math.min(1, from + (1 - from) * c.t1 + 1e-4)
  }
  return { block: null, spent: p.pierce - left }
}

/** 看得见：从 (ax, ay) 眼高 eyeA 看到 (bx, by) 眼高 eyeB，中间没有挡视线的东西；技能墙看得穿 */
export function canSee(sim: Sim, ax: number, ay: number, eyeA: number, bx: number, by: number, eyeB: number): boolean {
  return terrainPass(sim, { via: 'sight', h0: eyeA, h1: eyeB, arc: 0, pierce: 0 }, ax, ay, bx, by).block === null
}

/** 标准身体平射飞的高度，米：近战、爆炸与场按它看够不够得着，画面上抛射按高出它多少抬起 */
export const CHEST_M = layerZ(CHEST)

const REACH: Probe = { via: 'shot', h0: CHEST_M, h1: CHEST_M, arc: 0, pierce: 0 }

/** 齐胸高从出手处往目标够，第一处挡住的地方：近战、爆炸与场都按它，贯穿不了 */
export function reachBlock(sim: Sim, ax: number, ay: number, bx: number, by: number): Block | null {
  return terrainPass(sim, REACH, ax, ay, bx, by).block
}

export function reaches(sim: Sim, ax: number, ay: number, bx: number, by: number): boolean {
  return reachBlock(sim, ax, ay, bx, by) === null
}

/** 范围与近战打到的身体里够得着的：出手被障碍挡的才查，从出手处 (ox, oy) 看 */
export function covered<T extends { readonly x: number; readonly y: number }>(sim: Sim, src: Source, ox: number, oy: number, list: readonly T[]): T[] {
  return src.blocked ? list.filter((t) => reaches(sim, ox, oy, t.x, t.y)) : [...list]
}

/** 弹体这一步第一处被挡的地方：地图的实心按高度与贯穿，敌方挡弹的技能墙一律挡下 */
export function shotPass(sim: Sim, faction: number, p: Probe, ax: number, ay: number, bx: number, by: number): Passage {
  const r = terrainPass(sim, p, ax, ay, bx, by)
  let best = r.block
  for (const b of query(sim.world, [Barrier])) {
    if (!Barrier.shots[b] || !hostileTo(b, faction)) continue
    const t = barrierHit(sim, b, ax, ay, bx, by)
    if (t === null || (best && t >= best.t)) continue
    best = { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, t, material: 'barrier', barrier: b }
  }
  return { block: best, spent: best && best.barrier >= 0 ? 0 : r.spent }
}

/** 抛射从离地 z0 米出手，飞到全程 s（0 到 1）处离地多高：落到地上，中间拱起 arc 米 */
export function lobZ(z0: number, arc: number, s: number): number {
  return z0 * (1 - s) + 4 * arc * s * (1 - s)
}

/** 弹体从离地 z0 米出手、飞完全程的探测：平射一路在这个高度，抛射落到全程尽头的地上 */
export function flightProbe(z0: number, arc: number, pierce: number): Probe {
  return { via: 'shot', h0: z0, h1: arc > 0 ? 0 : z0, arc, pierce }
}

/** 弹体此刻离地多高，米 */
export function boltZ(eid: number): number {
  const arc = Proj.arc[eid]!
  return arc > 0 ? lobZ(Proj.z[eid]!, arc, Math.min(1, Proj.flown[eid]! / Proj.reach[eid]!)) : Proj.z[eid]!
}

/** 弹体这一步（飞出 step 像素）的探测 */
export function boltProbe(eid: number, step: number): Probe {
  const pierce = Math.max(0, Proj.pierce[eid]!)
  const arc = Proj.arc[eid]!
  const z0 = Proj.z[eid]!
  if (arc <= 0) return flightProbe(z0, 0, pierce)
  const reach = Proj.reach[eid]!
  const s0 = Math.min(1, Proj.flown[eid]! / reach)
  const s1 = Math.min(1, (Proj.flown[eid]! + step) / reach)
  return { via: 'shot', h0: lobZ(z0, arc, s0), h1: lobZ(z0, arc, s1), arc: arc * (s1 - s0) ** 2, pierce }
}

/** 穿墙的身体穿得过这种材质 */
export function phases(world: EcsWorld, eid: number, material: ObstacleId): boolean {
  return MATERIALS[material].phase && hasComponent(world, eid, Phasing)
}

/** 破坏力打在 (x, y) 离地 z 米处、半径 r 像素的范围里：地图按材质的强度折算能打掉多少，返回实际用掉的破坏力 */
export function breachAt(sim: Sim, x: number, y: number, z: number, r: number, amount: number): number {
  if (amount <= 0) return 0
  return sim.hooks.breach?.(sim, x, y, z, r, amount) ?? 0
}

/** 弹体或出手撞上了障碍：地图在那里崩点碎屑 */
export function impactAt(sim: Sim, b: Block): void {
  sim.hooks.impact?.(sim, b.x, b.y, b.material)
}
