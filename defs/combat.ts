import type { CombatTuning } from '../src/types/abilities'

export const COMBAT = {
  // 敌人身体：质量 1、阻力 5、抓地 2，速度趋近驱动的时间常数 mass/(drag·grip) = 0.1 秒，也是击退的衰减时间
  enemyBody: { mass: 1, drag: 5, grip: 2 },
  // 召唤物身体：时间常数 25 毫秒，几乎立刻跟上驱动
  minionBody: { mass: 1, drag: 5, grip: 8 },
  knockback: { maxSpeed: 1300, deathSlideMs: 300 },
  // 须略大于屏幕中心到角落的距离（≈11.5 格）
  acquire: { range: 12 },
} as const satisfies CombatTuning
