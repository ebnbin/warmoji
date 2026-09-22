import type { CombatTuning } from '../src/types/abilities'

export const COMBAT = {
  // tauMs 冲量指数衰减时间常数（位移 ≈ 冲量 × tauMs/1000）；maxSpeed 合速度上限；deathSlideMs 尸体滑行时长
  knockback: { tauMs: 100, maxSpeed: 1300, deathSlideMs: 300 },
  // 须略大于屏幕中心到角落的距离（≈11.5 格）
  acquire: { range: 12 },
} as const satisfies CombatTuning
