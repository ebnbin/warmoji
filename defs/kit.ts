import type { Effect } from '../src/types/abilityDefs'

/** 单位共用的小写法：弹体、炸开的一圈、场与地上的一片的样子 */

/** 一发弹体：emoji、弹速（格/秒）、大小（格），rot 是图里尖头的朝向与出手方向差几度 */
export const shot = (emoji: string, speed: number, size = 0.45, rot = 0) => ({ look: { emoji, size, rotationOffsetDeg: rot }, radius: +(size * 0.34).toFixed(2), speed })

/** 炸开时闪的一圈 */
export const ring = (color: number) => ({ color, fillAlpha: 0.3, lineWidth: 4, lineAlpha: 0.9, durMs: 260 })

/** 场（zone 形状）的样子 */
export const zoneLook = (color: number) => ({ color, fillAlpha: 0.22, lineAlpha: 0.75, lineWidth: 3, enterMs: 180 })

/** 地上的一片（ground 效果）：半径与持续，每 tickMs 先扣 damage 再施加 effects */
export const patch = (radius: number, durationMs: number, color: number, effects?: readonly Effect[], damage = 0, tickMs = 400) => ({
  radius,
  durationMs,
  tickMs,
  damage,
  color,
  fillAlpha: 0.3,
  lineAlpha: 0.6,
  enterMs: 150,
  effects,
})
