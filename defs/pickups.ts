import type { PickupDef } from '../src/pickups/registry'

// 创作层（不进运行时 bundle）：拾取物数据行。生成 src/gen/pickups.json。

export const PICKUPS = {
  coin: {
    emoji: '🪙',
    size: 0.6,
    radius: 0.22,
  },
  chest: {
    emoji: '🎁',
    size: 0.8,
    radius: 0.3,
    fallbackCoins: 10,
  },
} as const satisfies Record<string, PickupDef>
