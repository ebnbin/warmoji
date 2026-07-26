import type { CombatTuning } from '../src/types/abilities'

// 战斗手感常量（创作层·不进运行时 bundle）：击退衰减/上限、能力索敌上限。
// 击退与索敌的逻辑在 src/abilities 与战斗引擎；这里只放设计数值，经 gen 校验产出 combat.json。
export const COMBAT = {
  // 击退：命中冲量按指数衰减（时间常数 tauMs），实际位移 ≈ 冲量 × tauMs/1000；多次命中冲量
  // 叠加但合速度不超过 maxSpeed。致死一击尸体以不衰减的击退速度匀速飞出 deathSlideMs 后消失。
  knockback: { tauMs: 100, maxSpeed: 1300, deathSlideMs: 300 },
  // 能力索敌上限：12 单位略大于屏幕中心到角落（≈11.5U），可见敌必打、屏外远敌不追（无限地图防御）。
  acquire: { range: 12 },
} as const satisfies CombatTuning
