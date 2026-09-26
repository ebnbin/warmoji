import type { CombatTuning } from '../src/types/abilities'

export const COMBAT = {
  // 速度趋近驱动的时间常数是 mass/(drag·grip)，也是击退的衰减时间；拾取物几乎立刻跟上磁吸，碎片没有驱动、靠地面阻力刹住
  enemyBody: { mass: 1, drag: 5, grip: 2 },
  minionBody: { mass: 1, drag: 5, grip: 8 },
  pickupBody: { mass: 1, drag: 5, grip: 8 },
  shardBody: { mass: 1, drag: 5, grip: 0.2 },
  knockback: { maxSpeed: 1300, deathSlideMs: 300 },
  // 须略大于屏幕中心到角落的距离（≈11.5 格）
  acquire: { range: 12 },
  // 变形结束后多久内免疫再次变形、能力顺延多久
  morph: { recastMs: 5000, recoverMs: 700 },
  // 瞬袭落地后的无敌帧比打击时间多出的部分
  blinkIframePadMs: 200,
  // 装置架好后多久打第一发
  minionFirstShotMs: 200,
} as const satisfies CombatTuning
