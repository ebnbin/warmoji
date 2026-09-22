import type { CombatTuning } from '../src/types/abilities'

export const COMBAT = {
  knockback: { tauMs: 100, maxSpeed: 1300, deathSlideMs: 300 },
  // 须略大于屏幕中心到角落的距离（≈11.5 格）
  acquire: { range: 12 },
} as const satisfies CombatTuning
