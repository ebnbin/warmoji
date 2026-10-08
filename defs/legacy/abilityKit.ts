/** 几名角色的能力共用的小写法 */

export const RING = (color: number) => ({ color, fillAlpha: 0.3, lineWidth: 4, lineAlpha: 0.9, durMs: 260 })

export const shot = (emoji: string, speed: number, rotationOffsetDeg = 0) => ({ look: { emoji, size: 0.48, rotationOffsetDeg }, radius: 0.16, speed })
