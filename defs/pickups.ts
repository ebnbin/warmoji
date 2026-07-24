import type { PickupTable } from '../src/pickups/registry'

// 创作层（不进运行时 bundle）：拾取物内容行 + 拾取管线旋钮。生成 src/assets/pickups.json。
export const PICKUPS = {
  // 拾取物数据行（金币）
  defs: {
    coin: {
      emoji: '1fa99',
      size: 0.6,
      radius: 0.22,
    },
  },
  // 拾取管线旋钮：磁吸飞行速度（格/秒）+ 入账半径（格）。磁吸范围下放到各队长（CaptainDef.coinMagnet）。
  pipeline: {
    magnetSpeed: 8,
    collectRadius: 0.5,
  },
} as const satisfies PickupTable
