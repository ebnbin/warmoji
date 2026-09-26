import type { CombatTuning } from '../src/types/abilities'

export const COMBAT = {
  // 速度趋近驱动的时间常数是 mass/(drag·grip)，也是击退的衰减时间
  enemyBody: { mass: 1, drag: 5, grip: 2 },
  minionBody: { mass: 1, drag: 5, grip: 8 },
  knockback: { maxSpeed: 1300, deathSlideMs: 300 },
  // 须略大于屏幕中心到角落的距离（≈11.5 格）
  acquire: { range: 12 },
} as const satisfies CombatTuning
