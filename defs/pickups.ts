import type { PickupTable } from '../src/types/pickups'

export const PICKUPS = {
  defs: {
    coin: {
      emoji: '1fa99',
      size: 0.6,
      radius: 0.22,
    },
  },
  pipeline: {
    magnetSpeed: 8,
    collectRadius: 0.5,
  },
} as const satisfies PickupTable
