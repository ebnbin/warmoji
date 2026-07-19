import abilitiesJson from '../assets/abilities.json'
import type { AbilityDef } from './defs'

// 击退：命中冲量按指数衰减（时间常数 tauMs），实际位移 ≈ 冲量 × tauMs/1000；
// 多次命中冲量叠加但合速度不超过 maxSpeed。
// 衰减的语义 = 敌人自身动力在抵抗；致死一击则失去动力：尸体以不衰减的
// 击退速度匀速飞出 deathSlideMs 后消失（位移 = 冲量 × deathSlideMs/1000）
export const KNOCKBACK = { tauMs: 100, maxSpeed: 1300, deathSlideMs: 300 } as const

// 能力库：数据行在 defs/abilities.ts（创作层），npm run gen 校验并生成
// src/assets/abilities.json 打包进运行时——构建期保证合法，此处一次断言收口
export type AbilityId = keyof typeof abilitiesJson
export const ABILITIES = abilitiesJson as unknown as Record<AbilityId, AbilityDef>

// 能力索敌上限：超出此距离的敌人不作为开火/瞄准目标。12 单位略大于
// 屏幕中心到角落（≈11.5U），可见敌必打、屏外远敌不追——索敌逻辑必须
// 有界（无限地图防御）。激光用自身更短的 range 门槛，不受此值影响
export const ACQUIRE = { range: 12 } as const
