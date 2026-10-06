import { segDist } from './layout.ts'
import type { OutpostPlan, Segment } from './layout'
import type { OutpostConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 给画面的事件最多攒这么多条 */
const EVENT_CAP = 96

/**
 * 给画面与声音的一件事：toggle 有人在控制台上切了一组，warn 一组快复位了，reset 一组复位了；
 * overload 一段被打得过载熄了，restore 它重新亮起，ripple 有东西撞在亮着的一段上（x、y 是撞上的地方，像素；power 是撞得多狠，0 到 1）
 */
export type FenceEvent =
  | { readonly kind: 'toggle'; readonly group: number; readonly at: number }
  | { readonly kind: 'warn'; readonly group: number; readonly at: number }
  | { readonly kind: 'reset'; readonly group: number; readonly at: number }
  | { readonly kind: 'overload'; readonly seg: number; readonly at: number }
  | { readonly kind: 'restore'; readonly seg: number; readonly at: number }
  | { readonly kind: 'ripple'; readonly seg: number; readonly x: number; readonly y: number; readonly power: number; readonly at: number }

/**
 * 围栏此刻：各组开着没有、到几时复位（在默认状态为 Infinity）、预警过没有；各台控制台能不能切、台面从几时起空着（有人站着为 -1）；
 * 各段过载到几时（没过载为 0）；亮着的段变过几次；给画面的事件与一共发过几条
 */
export interface Fences {
  readonly on: boolean[]
  readonly until: number[]
  readonly warned: boolean[]
  readonly armed: boolean[]
  readonly emptyAt: number[]
  readonly down: number[]
  version: number
  readonly events: FenceEvent[]
  sent: number
}

export function makeFences(plan: OutpostPlan): Fences {
  return {
    on: plan.defaults.slice(),
    until: plan.defaults.map(() => Infinity),
    warned: plan.defaults.map(() => false),
    armed: plan.consoles.map(() => true),
    emptyAt: plan.consoles.map(() => 0),
    down: plan.segments.map(() => 0),
    version: 0,
    events: [],
    sent: 0,
  }
}

export function emit(f: Fences, e: FenceEvent): void {
  f.events.push(e)
  f.sent++
  if (f.events.length > EVENT_CAP) f.events.splice(0, f.events.length - EVENT_CAP)
}

/** 这一段此刻亮着：它那组开着，也没在过载 */
export function live(f: Fences, plan: OutpostPlan, seg: number, now: number): boolean {
  return f.on[plan.segments[seg]!.group]! && now >= f.down[seg]!
}

/**
 * 推进一帧：台面上有队伍里的人、又可以切的控制台把它那组切一下（切回默认就不再计时，切离默认就从现在起计 holdS 秒）；
 * 走空 rearmS 秒的台子才能再切。计时到了最后 warnS 秒先预警，到点复位；过载的段到点重新亮起
 */
export function stepFences(f: Fences, plan: OutpostPlan, cfg: OutpostConfig, now: number, occupied: (c: number) => boolean): void {
  const C = cfg.console
  plan.consoles.forEach((c, i) => {
    if (occupied(i)) {
      f.emptyAt[i] = -1
      if (!f.armed[i]) return
      f.armed[i] = false
      const g = c.group
      f.on[g] = !f.on[g]
      f.until[g] = f.on[g] === plan.defaults[g] ? Infinity : now + C.holdS * 1000
      f.warned[g] = false
      f.version++
      emit(f, { kind: 'toggle', group: g, at: now })
      return
    }
    if (f.emptyAt[i]! < 0) f.emptyAt[i] = now
    if (!f.armed[i] && now - f.emptyAt[i]! >= C.rearmS * 1000) f.armed[i] = true
  })
  for (let g = 0; g < f.on.length; g++) {
    const until = f.until[g]!
    if (!Number.isFinite(until)) continue
    if (!f.warned[g] && now >= until - C.warnS * 1000) {
      f.warned[g] = true
      emit(f, { kind: 'warn', group: g, at: now })
    }
    if (now < until) continue
    f.on[g] = plan.defaults[g]!
    f.until[g] = Infinity
    f.warned[g] = false
    f.version++
    emit(f, { kind: 'reset', group: g, at: now })
  }
  f.down.forEach((d, s) => {
    if (d === 0 || now < d) return
    f.down[s] = 0
    if (f.on[plan.segments[s]!.group]) f.version++
    emit(f, { kind: 'restore', seg: s, at: now })
  })
}

/** 一段过载：熄 s 秒；已经熄着的不算 */
export function overload(f: Fences, plan: OutpostPlan, cfg: OutpostConfig, seg: number, now: number): boolean {
  if (!live(f, plan, seg, now)) return false
  f.down[seg] = now + cfg.overload.s * 1000
  f.version++
  emit(f, { kind: 'overload', seg, at: now })
  return true
}

/** 一组此刻：在默认状态、切过了在计时、快复位了；left 是还有几毫秒复位 */
export function groupPhase(f: Fences, cfg: OutpostConfig, g: number, now: number): { readonly phase: 'idle' | 'held' | 'warn'; readonly left: number } {
  const until = f.until[g]!
  if (!Number.isFinite(until)) return { phase: 'idle', left: 0 }
  const left = Math.max(0, until - now)
  return { phase: left <= cfg.console.warnS * 1000 ? 'warn' : 'held', left }
}

/** p 在线段 s 的哪一侧，带符号的距离（格）：按 a→b 的左手法线 */
function side(s: Segment, x: number, y: number): number {
  const dx = s.bx - s.ax
  const dy = s.by - s.ay
  const len = Math.hypot(dx, dy) || 1
  return ((x - s.ax) * -dy + (y - s.ay) * dx) / len
}

/**
 * 半径 rad 格的身体从 from 走到 next（都是格）碰上亮着的段：先不许它整个穿过去（这一步跨过了段线、又落在段的两头之间，就退回出发的那一侧），
 * 再把陷进光墙的部分沿法线推出来。返回推完的位置与撞得最狠的那一段与撞上的地方，没碰上为 -1
 */
export function fenceOut(f: Fences, plan: OutpostPlan, cfg: OutpostConfig, now: number, from: Point, next: Point, rad: number): { x: number; y: number; seg: number; hx: number; hy: number; depth: number } {
  const half = cfg.fence.thickU / 2
  const reach = rad + half
  let px = next.x
  let py = next.y
  let hit = -1
  let hx = 0
  let hy = 0
  let deepest = 0
  const segs = plan.segments
  for (let s = 0; s < segs.length; s++) {
    if (!live(f, plan, s, now)) continue
    const g = segs[s]!
    const minX = Math.min(g.ax, g.bx) - reach
    const maxX = Math.max(g.ax, g.bx) + reach
    const minY = Math.min(g.ay, g.by) - reach
    const maxY = Math.max(g.ay, g.by) + reach
    if (Math.max(px, from.x) < minX || Math.min(px, from.x) > maxX || Math.max(py, from.y) < minY || Math.min(py, from.y) > maxY) continue
    const dx = g.bx - g.ax
    const dy = g.by - g.ay
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const s0 = side(g, from.x, from.y)
    const s1 = side(g, px, py)
    if (s0 !== 0 && Math.sign(s0) !== Math.sign(s1)) {
      const t = s0 / (s0 - s1)
      const cx = from.x + (px - from.x) * t
      const cy = from.y + (py - from.y) * t
      const u = ((cx - g.ax) * dx + (cy - g.ay) * dy) / (len * len)
      if (u >= -rad / len && u <= 1 + rad / len) {
        const back = Math.sign(s0) * reach - s1
        px += nx * back
        py += ny * back
      }
    }
    const d = segDist(g.ax, g.ay, g.bx, g.by, px, py)
    if (d >= reach) continue
    const u = Math.min(1, Math.max(0, ((px - g.ax) * dx + (py - g.ay) * dy) / (len * len)))
    const qx = g.ax + dx * u
    const qy = g.ay + dy * u
    let ox = px - qx
    let oy = py - qy
    const ol = Math.hypot(ox, oy)
    if (ol > 1e-6) {
      ox /= ol
      oy /= ol
    } else {
      const sg = Math.sign(side(g, from.x, from.y)) || 1
      ox = nx * sg
      oy = ny * sg
    }
    const depth = reach - d
    px += ox * depth
    py += oy * depth
    if (depth > deepest || hit < 0) {
      deepest = depth
      hit = s
      hx = qx
      hy = qy
    }
  }
  return { x: px, y: py, seg: hit, hx, hy, depth: deepest }
}

/** 线段 a→b（格）最先碰上的亮着的段：碰上处按线段从 0 到 1 的 t 与段号，碰不上为 null */
export function fenceHit(f: Fences, plan: OutpostPlan, now: number, ax: number, ay: number, bx: number, by: number): { readonly t: number; readonly seg: number } | null {
  const rx = bx - ax
  const ry = by - ay
  let best: { t: number; seg: number } | null = null
  const segs = plan.segments
  for (let s = 0; s < segs.length; s++) {
    if (!live(f, plan, s, now)) continue
    const g = segs[s]!
    const ex = g.bx - g.ax
    const ey = g.by - g.ay
    const den = rx * ey - ry * ex
    if (Math.abs(den) < 1e-12) continue
    const wx = g.ax - ax
    const wy = g.ay - ay
    const t = (wx * ey - wy * ex) / den
    const u = (wx * ry - wy * rx) / den
    if (t < 0 || t > 1 || u < 0 || u > 1) continue
    if (!best || t < best.t) best = { t, seg: s }
  }
  return best
}
