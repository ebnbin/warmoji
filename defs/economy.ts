import type { Economy } from '../src/types/items'

// 经济/暴击（创作层·不进运行时 bundle）：暴击伤害倍率、商店定价曲线、上架位重随价。
// 定价/扣款逻辑（itemPrice）与暴击结算在 src/items 与战斗引擎；这里只放设计数值，
// 经 npm run gen 校验后产出 economy.json。
export const ECONOMY = {
  critMul: 2,
  // 商店价格：基准价随波次通胀上浮 × 前期折扣（前期金币少先把货压便宜，到 earlyFadeWaves 波线性消退）
  price: { perWave: 0.06, earlyDiscount: 0.4, earlyFadeWaves: 6 },
  // 商店上架位付费重随价格
  shop: { refreshPrice: 2 },
} as const satisfies Economy
