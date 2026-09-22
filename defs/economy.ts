import type { Economy } from '../src/types/items'

export const ECONOMY = {
  critMul: 2,
  // perWave 每波通胀；earlyDiscount 前期折扣，至 earlyFadeWaves 波线性消退
  price: { perWave: 0.06, earlyDiscount: 0.4, earlyFadeWaves: 6 },
  shop: { refreshPrice: 2 },
} as const satisfies Economy
