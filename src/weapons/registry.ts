import { hydrate } from '../lib/hydrate'
import { UNIT } from '../lib/units'
import type { WeaponSpec } from './spec'
import weaponsJson from './weapons.json'

// 武器库数据在 weapons.json，按设计单位书写（"Nu" 格 / "Ndeg" 角度 / "0x…" 颜色），
// 经 lib/hydrate 唯一边界换算成运行时数值——下游拿到的与手写 px 完全等值。
// rotationOffsetRad 的角度值是 twemoji 素材朝向修正（🔫 枪口朝左 180deg、
// 🗡️/🔦/💉 朝左下 135deg、💧 尖端朝上 90deg）。左右手枪是两行独立数据
//（数据行允许重复，不做展开复用）。held 缺省 = 行为主体是角色本体。

export type WeaponId = keyof typeof weaponsJson

export const WEAPONS = hydrate<Record<WeaponId, WeaponSpec>>(weaponsJson)

// 击退：命中冲量按指数衰减（时间常数 tauMs），实际位移 ≈ 冲量 × tauMs/1000；
// 多次命中冲量叠加但合速度不超过 maxSpeed。
// 衰减的语义 = 敌人自身动力在抵抗；致死一击则失去动力：尸体以不衰减的
// 击退速度匀速飞出 deathSlideMs 后消失（位移 = 冲量 × deathSlideMs/1000）
export const KNOCKBACK = { tauMs: 100, maxSpeed: 1300, deathSlideMs: 300 } as const

// 武器索敌上限：超出此距离的敌人不作为开火/瞄准目标。12 单位略大于
// 屏幕中心到角落（≈11.5U），可见敌必打、屏外远敌不追——索敌逻辑必须
// 有界（无限地图防御）。激光用自身更短的 range 门槛，不受此值影响
export const ACQUIRE = { range: 12 * UNIT } as const
