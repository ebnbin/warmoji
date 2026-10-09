import type { Economy } from '../src/types/items'

export const ECONOMY = {
  price: { perWave: 0.06, earlyDiscount: 0.4, earlyFadeWaves: 6 },
  shop: { shelf: 4, reroll: { base: 0.75, step: 0.4 } },
} as const satisfies Economy
