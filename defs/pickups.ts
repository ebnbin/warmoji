import type { PickupDef } from '../src/pickups/registry'

// 创作层（不进运行时 bundle）：拾取物数据行。生成 src/gen/pickups.json。

export const PICKUPS = {
  coin: {
    emoji: '1fa99',
    size: 0.6,
    radius: 0.22,
  },
} as const satisfies Record<string, PickupDef>
