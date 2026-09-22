import type { Economy } from '../src/types/items'

export const ECONOMY = {
  critMul: 2,
  price: { perWave: 0.06, earlyDiscount: 0.4, earlyFadeWaves: 6 },
  shop: { refreshPrice: 2 },
} as const satisfies Economy
