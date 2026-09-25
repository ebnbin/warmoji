import type { CombatTuning } from '../src/types/abilities'

export const COMBAT = {
  knockback: { tauMs: 100, maxSpeed: 1300, deathSlideMs: 300 },
  acquire: { range: 12 },
} as const satisfies CombatTuning
