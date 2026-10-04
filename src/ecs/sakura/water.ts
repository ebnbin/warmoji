import { at, heightAt, project } from '../river/channel'
import { solveGrid, WATER_CELL_U } from '../river/water'
import { insideDepth, SINK_M, weirLocal } from './layout'
import type { Along } from '../river/channel'
import type { Water } from '../river/water'
import type { SakuraPlan } from './layout'
import type { SakuraConfig } from '../../types/maps'

/** 墙身底下的格子垫这么高（米）：水只从水门进出，不从墙下漫出院外 */
const WALL_Z = 6
/** 水从墙下的水门往院里冲开这么长一段，格 */
const SPOUT_U = 1
/** 设计水位以外这么远（格）的岸上不铺起算的水 */
const WET_BAND_U = 0.5

/**
 * 樱庭的水流：河床取地形，墙身底下垫高；堰下比堰顶低过 DROP 的格子是汇；水按流量从进水的水门冲进院子，带着设计流速；
 * 从按设计水位铺好的静水起算，解到稳态（解法沿用河流）
 */
export function solveSakura(cfg: SakuraConfig, plan: SakuraPlan): Water {
  const mpu = cfg.meterPerU
  const cols = Math.ceil(plan.w / WATER_CELL_U)
  const rows = Math.ceil(plan.h / WATER_CELL_U)
  const n = cols * rows
  const dx = WATER_CELL_U * mpu
  const z = new Float64Array(n)
  const h = new Float64Array(n)
  const sink = new Int8Array(n).fill(-1)
  const src = new Float64Array(n)
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  const inl = plan.inlet
  const wr = plan.weir
  const r = plan.stream
  const th = cfg.wall.thickU / 2
  const q = cfg.flow.discharge
  let spout = 0
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      const x = (cx + 0.5) * WATER_CELL_U
      const y = (cy + 0.5) * WATER_CELL_U
      z[i] = heightAt(plan.terrain, x, y)
      const wl = weirLocal(wr, x, y)
      if (wl.along > 0 && wl.side < wr.half + 0.5 && z[i]! < wr.crest - SINK_M) {
        sink[i] = 0
        continue
      }
      const inside = insideDepth(plan.walls, x, y)
      if (inside < th + 0.05) {
        z[i] = WALL_Z
        continue
      }
      const ax = x - inl.x
      const ay = y - inl.y
      const into = ax * inl.dx + ay * inl.dy
      if (into > th && into < th + SPOUT_U && Math.abs(ax * -inl.dy + ay * inl.dx) < inl.half) {
        src[i] = 1
        spout++
      }
      project(r, x, y, tmp)
      if (tmp.s >= wr.s || Math.abs(tmp.n) > at(r.half, tmp) + WET_BAND_U) continue
      const depth = at(r.level, tmp) - z[i]!
      if (depth > 1e-4) h[i] = depth
    }
  }
  if (spout === 0) throw new Error('水门没开在溪上')
  for (let i = 0; i < n; i++) src[i] = (src[i]! * q) / (spout * dx * dx)
  return solveGrid({ cols, rows, cell: WATER_CELL_U, meterPerU: mpu, manning: cfg.flow.manning, z, h, src, jet: r.speed, dir: { x: inl.dx, y: inl.dy }, sink, q })
}
