import { UNIT } from '../../util/units.ts'
import type { DeepConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 钟的一段：down 放在谷底上方，warn 吊起前的预兆，hoist 往上吊，move 吊着挪，lower 往下放 */
export type BellPhase = 'down' | 'warn' | 'hoist' | 'move' | 'lower'

/**
 * 潜水钟：此刻在哪一段，钟心在谷底上的位置（像素），钟口离谷底多高（米）；这一段从哪挪到哪（像素），从几时开始、要多久（毫秒）；
 * 下一次挪窝几时开始预兆；挪过几次
 */
export interface Bell {
  phase: BellPhase
  x: number
  y: number
  h: number
  fromX: number
  fromY: number
  toX: number
  toY: number
  at: number
  span: number
  next: number
  moves: number
}

type BellCfg = DeepConfig['bell']

export function newBell(cfg: BellCfg, x: number, y: number): Bell {
  return { phase: 'down', x, y, h: cfg.hangM, fromX: x, fromY: y, toX: x, toY: y, at: 0, span: 1, next: cfg.firstMs, moves: 0 }
}

const ease = (t: number): number => t * t * (3 - 2 * t)

/** 钟底下此刻喘不喘得上气：放着与预兆时喘得上，吊起来就没有了 */
export function breathable(b: Bell): boolean {
  return b.phase === 'down' || b.phase === 'warn'
}

/** 钟口底下那一圈的半径，像素 */
export function airRadius(cfg: DeepConfig): number {
  return (cfg.bell.radiusM / cfg.meterPerU) * UNIT
}

/** 这一段走了多少，0 到 1 */
export function progress(b: Bell, now: number): number {
  return Math.min(1, Math.max(0, (now - b.at) / b.span))
}

/** 吊着挪一段要多久，毫秒：从 a 挪到 b 按挪的速度 */
export function moveMs(cfg: DeepConfig, ax: number, ay: number, bx: number, by: number): number {
  return Math.max(1, ((Math.hypot(bx - ax, by - ay) / UNIT) * cfg.meterPerU * 1000) / cfg.bell.speedMs)
}

/** 推进到 now：到点就进下一段，一帧跨过几段也一段段地走完；预兆结束时按 pick 挑新落点，放下后按 gap 定下一次的间隔 */
export function stepBell(b: Bell, d: DeepConfig, now: number, pick: (from: Point) => Point, gap: () => number): void {
  const cfg = d.bell
  const enter = (phase: BellPhase, span: number, at: number): void => {
    b.phase = phase
    b.at = at
    b.span = span
  }
  for (let guard = 0; guard < 8; guard++) {
    const end = b.at + b.span
    if (b.phase === 'down') {
      b.h = cfg.hangM
      if (now < b.next) break
      enter('warn', cfg.warnMs, b.next)
      continue
    }
    const t = progress(b, now)
    if (b.phase === 'warn') {
      if (t < 1) break
      const to = pick({ x: b.x, y: b.y })
      b.fromX = b.x
      b.fromY = b.y
      b.toX = to.x
      b.toY = to.y
      enter('hoist', cfg.hoistMs, end)
      continue
    }
    if (b.phase === 'hoist') {
      b.h = cfg.hangM + (cfg.liftM - cfg.hangM) * ease(t)
      if (t < 1) break
      enter('move', moveMs(d, b.fromX, b.fromY, b.toX, b.toY), end)
      continue
    }
    if (b.phase === 'move') {
      const k = ease(t)
      b.x = b.fromX + (b.toX - b.fromX) * k
      b.y = b.fromY + (b.toY - b.fromY) * k
      b.h = cfg.liftM
      if (t < 1) break
      enter('lower', cfg.lowerMs, end)
      continue
    }
    const k = 1 - (1 - t) * (1 - t)
    b.h = cfg.liftM + (cfg.hangM - cfg.liftM) * k
    if (t < 1) break
    b.h = cfg.hangM
    b.x = b.toX
    b.y = b.toY
    b.moves++
    b.next = end + gap()
    enter('down', 1, end)
  }
}

/** 钟此刻要落下去、或已经放着的地方，像素：吊着的时候是新落点 */
export function bellTarget(b: Bell): Point {
  return breathable(b) ? { x: b.x, y: b.y } : { x: b.toX, y: b.toY }
}
