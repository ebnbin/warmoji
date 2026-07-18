import { UNIT } from '../lib/units'
import { isHorizontal } from '../screen/remap'
import type { Point } from '../lib/vec'

// 河流地图的世界模型（纯逻辑，禁 phaser/DOM）。
// 世界 = 逻辑视口（相机静止）；河道沿长轴、跨短轴居中、宽度恒定。
// 横屏：水流从右往左（右上游、左下游）；竖屏：从上往下（上上游、下下游）。
// 横竖屏是同一条河：朝向切换时的坐标/矢量重映射是通用几何，见 ./remap.ts。

export interface RiverRect {
  x: number
  y: number
  w: number
  h: number
  /** 水流是否沿水平轴（横屏 true / 竖屏 false） */
  horizontal: boolean
}

/** 河道矩形：长轴贯穿全屏，跨轴居中、宽 riverWidth；两侧余量即河岸 */
export function riverRect(viewW: number, viewH: number, riverWidth: number): RiverRect {
  const horizontal = isHorizontal(viewW, viewH)
  if (horizontal) {
    return { x: 0, y: (viewH - riverWidth) / 2, w: viewW, h: riverWidth, horizontal }
  }
  return { x: (viewW - riverWidth) / 2, y: 0, w: riverWidth, h: viewH, horizontal }
}

/** 水流速度矢量：横屏右→左（-x），竖屏上→下（+y） */
export function flowVector(horizontal: boolean, speed: number): Point {
  return horizontal ? { x: -speed, y: 0 } : { x: 0, y: speed }
}

/** 是否已漂出下游边界外 pad 距离（金币清理判定） */
export function pastDownstream(p: Point, viewW: number, viewH: number, pad: number): boolean {
  return isHorizontal(viewW, viewH) ? p.x < -pad : p.y > viewH + pad
}

/** 钳入河道（玩家/Boss 专用；其余实体自由出界） */
export function clampToRiver(p: Point, rect: RiverRect, pad: number): Point {
  return {
    x: Math.min(Math.max(p.x, rect.x + pad), rect.x + rect.w - pad),
    y: Math.min(Math.max(p.y, rect.y + pad), rect.y + rect.h - pad),
  }
}

/** 漂浮物速度剖面：河心最快、近岸放缓（真实河流的流速分布，仅视觉层用）。
 * crossFrac = |跨向偏移| / (河宽/2)，超出河道按岸边速度 */
export function driftProfile(crossFrac: number): number {
  const f = Math.min(1, Math.abs(crossFrac))
  return 0.6 + 0.4 * (1 - f * f)
}

// 河流地图（kind='river'）：单屏固定竞技场 + 恒定水流。
// 相机静止，世界 = 逻辑视口；河道沿长轴居中（横屏水平、竖屏垂直），
// 宽恒 10 格，短边余量为两岸暗带。水流 = 全员恒定漂移（子弹除外），
// 顺流快/逆流慢/挂机漂向下游都由这一个矢量自然涌现。
// 只有玩家与 Boss 被钳在河道内；敌人/金币自由出界——敌人沿用无限图
// 休眠机制（32 格）并会逆流游回，金币漂出下游即冲走
export const RIVER = {
  /** 视野倍率：单屏固定相机下 20 格视野太挤，放大到 1280 逻辑宽 → 24 格
   * （世界尺寸 = 逻辑视口 × viewScale，实体相应显小） */
  viewScale: 1.2,
  /** 河道宽度（跨流向恒定）：最小屏短边 13.5 格，留出两岸各 0.75 格 */
  width: 12 * UNIT,
  /** 流速：恒定漂移速度（队伍移速 5.5 格/秒 → 顺流 6.5、逆流 4.5，
   * 挂机 20 秒漂完整条河，站位压力明显但可对抗） */
  flow: 1 * UNIT,
  /** 金币漂出下游边界这一距离后清理（玩家钳在屏内，永远追不回） */
  coinCullPad: 2 * UNIT,
  /** 水面漂浮物数量（🍃🌸🫧 顺流循环，流向的直白提示） */
  driftCount: 18,
  /** 漂浮物个体速度倍率区间（再乘河心快近岸慢的剖面） */
  driftSpeedMul: [0.75, 1.3],
  /** 双层水纹滚动速度（视差；只是贴图偏移，与实体漂移无关，约为流速的 0.6/1.2 倍） */
  waveSlow: 0.6 * UNIT,
  waveFast: 1.2 * UNIT,
} as const
