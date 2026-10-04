import { at, heightAt, project } from '../river/channel'
import { solveGrid, WATER_CELL_U } from '../river/water'
import { ROCK_FACE_U, rocksLocal, SINK_M, weirLocal } from './layout'
import type { Along } from '../river/channel'
import type { Water } from '../river/water'
import type { SakuraPlan } from './layout'
import type { SakuraConfig } from '../../types/maps'

/** 石组那一溜按挡水算的格子垫这么高（米）：石头连同石缝一起堵死，水只从石组下游冒出来 */
const ROCK_Z = 6
/** 石组那条线往上游这么远（格）以内都按挡水算 */
const ROCK_BAND_U = 1.4
/** 水从石组下游冒出来，带着流速往溪里冲开这么长一段，格 */
const SPOUT_U = 1
/** 设计水位以外这么远（格）的岸上不铺起算的水 */
const WET_BAND_U = 0.5

/**
 * 樱庭的水流：河床取地形；石组那一溜垫高挡死，水按流量从石组下游带着设计流速冒出来；石槛下比槛顶低过 SINK_M 的格子是汇；
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
  const rk = plan.rocks
  const wr = plan.weir
  const r = plan.stream
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
      const rl = rocksLocal(rk, x, y)
      if (rl.side < rk.span && rl.along > -ROCK_BAND_U && rl.along < ROCK_FACE_U) {
        z[i] = ROCK_Z
        continue
      }
      if (rl.along >= ROCK_FACE_U && rl.along < ROCK_FACE_U + SPOUT_U && rl.side < rk.half) {
        src[i] = 1
        spout++
      }
      project(r, x, y, tmp)
      if (tmp.s <= 0 || tmp.s >= wr.s || Math.abs(tmp.n) > at(r.half, tmp) + WET_BAND_U) continue
      const depth = at(r.level, tmp) - z[i]!
      if (depth > 1e-4) h[i] = depth
    }
  }
  if (spout === 0) throw new Error('石组下游没有出水的格子')
  for (let i = 0; i < n; i++) src[i] = (src[i]! * q) / (spout * dx * dx)
  return solveGrid({ cols, rows, cell: WATER_CELL_U, meterPerU: mpu, manning: cfg.flow.manning, z, h, src, jet: r.speed, dir: { x: rk.tx, y: rk.ty }, sink, q })
}
