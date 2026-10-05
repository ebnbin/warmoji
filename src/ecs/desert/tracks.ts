import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { STAMINA } from '../../data/stamina'
import { Alive, CharScale, MARK, Motion, MOTION, Phys, Pickup, Radius, Shard, Slot, Span, Stamina, Stats, Transform, Uid } from '../components'
import { enemyOf } from '../store'
import { hasMark } from '../utils/marks'
import { staminaLeft } from '../systems/shared/stamina'
import { smooth, wrapU } from './terrain'
import type { DesertConfig, DesertGait } from '../../types/maps'
import type { Sim } from '../sim'

/** 印子的样子：步态之外，钻在沙下走的蝎王顶出一道隆起 */
export type PrintGait = DesertGait | 'burrow'

/**
 * 地上新踩出的一个印子：位置（像素）、朝着走的方向（弧度）、样子、左右脚（−1、1，0 是两边一起落）、身体的半径（像素）、
 * 踩下去多深（米）、拖着脚的程度（0–1）、离同一只脚上一个印子多远（像素）；连成一道的拖痕与隆起给出上一点（不连着时为 NaN）
 */
export interface Print {
  readonly x: number
  readonly y: number
  readonly angle: number
  readonly gait: PrintGait
  readonly side: number
  readonly size: number
  readonly depth: number
  readonly drag: number
  readonly stride: number
  readonly fx: number
  readonly fy: number
}

/** 一个身体在沙上走的记录：上一帧在哪、离上一个印子走了多远、下一步落哪只脚、一共走了多远（蛇按它摆出 S 形）、拖痕的上一点 */
interface Walker {
  uid: number
  x: number
  y: number
  carry: number
  side: number
  trail: number
  lx: number
  ly: number
}

/**
 * 沙上的印子：新踩的印子排队等画面画上去；沙被踩实多少按 cell 格的格子记，连同踩实那一下的时刻（秒），之后慢慢被风吹松
 */
export interface Tracks {
  readonly walkers: Map<number, Walker>
  readonly prints: Print[]
  readonly cols: number
  readonly cell: number
  readonly pack: Float32Array
  readonly packT: Float32Array
  /** 开局以来过了多少秒：印子与踩实都按它淡去 */
  now: number
}

/** 踩实按这么大的格子记，格 */
const PACK_CELL_U = 0.25
/** 画面最多攒这么多个印子没画：后台久了不画，旧的就丢掉 */
const MAX_QUEUE = 4096
/** 一帧挪了这么远（格）是被传过去的，不留印子 */
const JUMP_U = 1.5
/** 连成一道的拖痕每隔这么远（格）落一点 */
const TRAIL_STEP_U = 0.12

export function newTracks(sizeU: number): Tracks {
  const cols = Math.round(sizeU / PACK_CELL_U)
  return { walkers: new Map(), prints: [], cols, cell: PACK_CELL_U, pack: new Float32Array(cols * cols), packT: new Float32Array(cols * cols), now: 0 }
}

function packCell(t: Tracks, x: number, y: number): number {
  const n = t.cols
  const i = ((Math.floor(x / UNIT / t.cell) % n) + n) % n
  const j = ((Math.floor(y / UNIT / t.cell) % n) + n) % n
  return j * n + i
}

/** (x, y) 像素处的沙被踩实了几成：踩实的沙过 lifeS 秒就被吹松 */
export function packAt(t: Tracks, cfg: DesertConfig, x: number, y: number): number {
  const k = packCell(t, x, y)
  return Math.max(0, t.pack[k]! - (t.now - t.packT[k]!) / cfg.tracks.lifeS)
}

function trample(t: Tracks, cfg: DesertConfig, x: number, y: number, amount: number): void {
  const k = packCell(t, x, y)
  t.pack[k] = Math.min(1, packAt(t, cfg, x, y) + amount)
  t.packT[k] = t.now
}

/** 身体本来的大小：队长的判定半径里乘了突出队长的倍率，踩多深不算它 */
function bodyRadius(sim: Sim, eid: number): number {
  return hasComponent(sim.world, eid, CharScale) ? Radius.v[eid]! / CharScale.v[eid]! : Radius.v[eid]!
}

/** 这个身体在沙上留什么样的印子：队员穿着靴子，敌人按种类，钻进沙里的蝎王顶出一道隆起，悬空的不留 */
function gaitOf(sim: Sim, cfg: DesertConfig, eid: number): PrintGait | null {
  if (Span.lo[eid]! > 0) return null
  if (hasComponent(sim.world, eid, Slot)) return 'boot'
  const kind = enemyOf[eid]?.kind
  const g = kind ? (cfg.tracks.gaits[kind] ?? 'foot') : 'foot'
  if (g === 'legs' && hasMark(sim, eid, MARK.untargetable)) return 'burrow'
  return g
}

/** 体力还剩几成：不会累的身体当它一直是满的 */
function leftOf(sim: Sim, eid: number): number {
  if (!hasComponent(sim.world, eid, Stamina) || Stats.exertion[eid]! <= 0) return 1
  return staminaLeft(eid)
}

function emit(t: Tracks, p: Print): void {
  if (t.prints.length >= MAX_QUEUE) t.prints.splice(0, t.prints.length - MAX_QUEUE + 1)
  t.prints.push(p)
}

/**
 * 推进这一帧的印子：每个在地上走的身体按走过的路一步一步落印子。步幅按身体的大小与走得多快，累了步子变小；
 * 印子的深浅按压在脚下的分量（半径乘质量倍率）、沙的松实与累的程度，体力低于 dragFrom 就拖着脚；落下印子的地方沙被踩实一点。
 * 蛇和钻在沙下的蝎王留下连成一道的痕迹
 */
export function stepTracks(sim: Sim, t: Tracks, cfg: DesertConfig, sizeU: number, loose: (x: number, y: number) => number, dt: number): void {
  const tc = cfg.tracks
  const size = sizeU * UNIT
  const seen = new Set<number>()
  for (const eid of query(sim.world, [Phys, Transform, Radius])) {
    if (!Alive.v[eid] || hasComponent(sim.world, eid, Pickup) || hasComponent(sim.world, eid, Shard)) continue
    const uid = Uid.v[eid]!
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    seen.add(eid)
    let w = t.walkers.get(eid)
    if (!w || w.uid !== uid) {
      w = { uid, x, y, carry: 0, side: 1, trail: 0, lx: NaN, ly: NaN }
      t.walkers.set(eid, w)
      continue
    }
    const dx = wrapU(x - w.x, size)
    const dy = wrapU(y - w.y, size)
    w.x = x
    w.y = y
    const kind = Motion.kind[eid]
    const gait = gaitOf(sim, cfg, eid)
    const moved = Math.hypot(dx, dy)
    if (!gait || kind === MOTION.arc || kind === MOTION.transit || moved > JUMP_U * UNIT) {
      w.carry = 0
      w.lx = NaN
      continue
    }
    if (moved < 1e-3) continue
    const ux = dx / moved
    const uy = dy / moved
    const angle = Math.atan2(uy, ux)
    const r = bodyRadius(sim, eid)
    const ref = 0.45 * UNIT
    const load = Math.min(2.5, Math.max(0.4, (r / ref) * Phys.mass[eid]!))
    const left = leftOf(sim, eid)
    const tired = smooth(STAMINA.slowFrom, 0, left)
    const drag = smooth(tc.dragFrom, 0.02, left)
    const dash = kind === MOTION.dash
    const speedU = moved / UNIT / Math.max(dt, 1e-3)
    const deep = (soft: number): number => tc.depthM * load * (tc.firm + (1 - tc.firm) * soft) * (1 + (tc.tired - 1) * tired) * (dash ? 1.15 : 1)
    if (gait === 'slither' || gait === 'burrow') {
      const step = TRAIL_STEP_U * UNIT
      w.carry += moved
      while (w.carry >= step) {
        w.carry -= step
        w.trail += step
        const bx = x - ux * w.carry
        const by = y - uy * w.carry
        const wave = gait === 'slither' ? Math.sin((w.trail / (3.2 * r)) * Math.PI * 2) * r * 0.38 : 0
        const px = bx - uy * wave
        const py = by + ux * wave
        const soft = loose(px, py) * (1 - 0.6 * packAt(t, cfg, px, py))
        // 上一点取离这一点最近的那一份：身体被挪过整圈时，不从旧的那一份拉一道横穿整圈的线
        const fx = px - wrapU(px - w.lx, size)
        const fy = py - wrapU(py - w.ly, size)
        emit(t, { x: px, y: py, angle, gait, side: 0, size: r, depth: deep(soft), drag, stride: step, fx, fy })
        w.lx = px
        w.ly = py
      }
      continue
    }
    const pace = Math.min(1.25, 0.5 + (0.5 * speedU) / 6)
    const stride = Math.max(0.12 * UNIT, r * tc.stride * pace * (dash ? 1.6 : 1) * (gait === 'hop' ? 2.2 : 1))
    w.carry += moved
    while (w.carry >= stride) {
      w.carry -= stride
      const side = gait === 'hop' || gait === 'legs' ? 0 : (w.side = -w.side)
      // 拖着脚时左右摇晃，步子落得不齐
      const sway = drag * r * 0.12 * Math.sin(w.trail * 7.1 + side)
      w.trail += stride
      const px = x - ux * w.carry - uy * sway
      const py = y - uy * w.carry + ux * sway
      const soft = loose(px, py) * (1 - 0.6 * packAt(t, cfg, px, py))
      // 累了脚落得拖沓，印子又深又糊得大一圈
      emit(t, { x: px, y: py, angle: angle + drag * 0.12 * Math.sin(w.trail * 3.3), gait, side, size: r * (1 + 0.18 * tired), depth: deep(soft), drag, stride, fx: NaN, fy: NaN })
      trample(t, cfg, px, py, tc.pack * Math.sqrt(load))
    }
  }
  for (const eid of t.walkers.keys()) if (!seen.has(eid)) t.walkers.delete(eid)
}
