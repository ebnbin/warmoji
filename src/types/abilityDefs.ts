import type { SfxId } from './sfx'
import type { GroundEffectDef } from './groundEffects'

export interface ProjectileSpec {
  readonly emoji: string
  readonly size: number
  readonly radius: number
  readonly speed: number
  readonly rotationOffsetDeg: number
}
export interface HeldVisual {
  readonly emoji: string
  readonly size: number
  /** 静止时距角色中心的距离 */
  readonly restOffset: number
  /** emoji 素材的原始朝向补偿（度） */
  readonly rotationOffsetDeg: number
  /** 左/右手横向挂载（垂直于瞄准方向偏移 mountGap） */
  readonly mountSide?: -1 | 1
  readonly mountGap?: number
}
export interface BlastRing {
  readonly color: number
  readonly fillAlpha: number
  readonly lineWidth: number
  readonly lineAlpha: number
  readonly durMs: number
}
/** ratio × 基准伤害；ring 缺省无环 */
export interface BlastEffect {
  readonly kind: 'blast'
  readonly radius: number
  readonly ratio: number
  /** 击退冲量（px/秒，方向从锚点指向目标） */
  readonly knockback: number
  readonly ring?: BlastRing
}
/** factor = 0 即冻结 */
export interface SlowEffect {
  readonly kind: 'slow'
  readonly factor: number
  readonly durationMs: number
}
/** 每 tickMs 造成 damage，持续 durationMs；刷新不叠加 */
export interface PoisonEffect {
  readonly kind: 'poison'
  readonly damage: number
  readonly tickMs: number
  readonly durationMs: number
}
export interface GroundZone {
  readonly kind: 'ground'
  readonly def: GroundEffectDef
}
/** Boss 免疫；vulnMul 为变形期间的受伤倍率 */
export interface MorphEffect {
  readonly kind: 'morph'
  readonly durationMs: number
  readonly morphEmoji: string
  readonly vulnMul?: number
}
export interface SpawnProjectileEffect {
  readonly kind: 'spawnProjectile'
  readonly projectile: ProjectileSpec
  readonly damage: number
  readonly lifeMs: number
  readonly aim: 'nearest'
}
/** all 缺省 true；死亡触发时排除自己 */
export interface HealEffect {
  readonly kind: 'heal'
  readonly range: number
  readonly amount: number
  readonly all?: boolean
}
/** ratio × 基准伤害，缺省 1 */
export interface DamageEffect {
  readonly kind: 'damage'
  readonly ratio?: number
}
/** 敌→队员专属 */
export interface AttackSlowEffect {
  readonly kind: 'attackSlow'
  readonly mul: number
  readonly durationMs: number
}
export type Effect =
  | BlastEffect
  | SlowEffect
  | PoisonEffect
  | GroundZone
  | MorphEffect
  | SpawnProjectileEffect
  | HealEffect
  | DamageEffect
  | AttackSlowEffect
export interface ThrustDef {
  readonly kind: 'thrust'
  readonly damage: number
  readonly cooldownMs: number
  /** 击退冲量（px/秒），位移 ≈ 冲量 × KNOCKBACK.tauMs/1000 */
  readonly knockback: number
  /** 判定线段长度，从角色中心起 */
  readonly reach: number
  readonly hitRadius: number
  readonly thrustMs: number
  /** 无持有物时角色本体前冲的距离 */
  readonly lungeDist: number
  readonly held?: HeldVisual
  // ── 能力字段 ──
  /** 隔 delayMs 重新索敌再刺一段 */
  readonly combo?: { readonly delayMs: number }
  /** 施加于突刺终点 */
  readonly onHit?: readonly Effect[]
}
export interface ProjectileDef {
  readonly kind: 'projectile'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  /** 缺省 nearest；move = 持有者移动方向，无需目标 */
  readonly aim?: 'nearest' | 'move'
  /** 缺省 ACQUIRE.range */
  readonly range?: number
  /** 仅敌方弹按寿命回收 */
  readonly lifeMs?: number
  /** 缺省由装配方给错峰值 */
  readonly firstDelayMs?: number
  /** 仅敌方弹生效 */
  readonly fireSfx?: SfxId
  readonly held?: HeldVisual
  readonly projectile: ProjectileSpec
  // ── 能力字段 ──
  /** spreadDeg ≥ 360 为整圈且无需目标；randomRotate 每轮随机整体旋转 */
  readonly volley?: { readonly count: number; readonly spreadDeg: number; readonly randomRotate?: boolean }
  /** 每第 n 次出手改为此齐射 */
  readonly everyN?: { readonly n: number; readonly count: number; readonly spreadDeg: number }
  /** 可再命中的额外敌人数 */
  readonly pierce?: number
  /** 不吃暴击 */
  readonly onHit?: readonly Effect[]
}
export interface SweepDef {
  readonly kind: 'sweep'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  /** 扇形判定半径 */
  readonly radius: number
  /** 扫掠弧宽（度） */
  readonly arcDeg: number
  readonly sweepMs: number
  readonly held: HeldVisual
  // ── 能力字段 ──
  readonly onHit?: readonly Effect[]
}
export interface AreaBlastDef {
  readonly kind: 'areaBlast'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  /** 爆心选取范围：离持有者最近的敌人 */
  readonly detectRange: number
  /** 以爆心为圆心 */
  readonly blastRadius: number
  readonly color: number
  // ── 能力字段 ──
  /** 施加于爆心 */
  readonly onHit?: readonly Effect[]
  /** 延迟 delayMs 后对随机敌人追加 ratio × 伤害 */
  readonly echo?: { readonly delayMs: number; readonly ratio: number }
}
export interface BoomerangDef {
  readonly kind: 'boomerang'
  readonly damage: number
  /** 接住后才开始计冷却 */
  readonly cooldownMs: number
  readonly knockback: number
  /** 去程距离在出手瞬间锁定 */
  readonly range: number
  readonly outMs: number
  /** 回程速度，追踪角色实时位置 */
  readonly returnSpeed: number
  readonly hitRadius: number
  /** 飞行自旋角速度（度/秒） */
  readonly spinDegPerSec: number
  readonly held: HeldVisual
  // ── 能力字段 ──
  /** 反方向同掷第二枚 */
  readonly twin?: boolean
  /** 飞行途中吸金币的半径 */
  readonly coinMagnetRadius?: number
}
export interface LaserDef {
  readonly kind: 'laser'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  /** 光束长度；贯穿直线上所有敌人 */
  readonly range: number
  readonly beamRadius: number
  readonly color: number
  readonly held: HeldVisual
  // ── 能力字段 ──
  /** 正后方同步第二道 */
  readonly backBeam?: boolean
  /** 取代单束：绕一周的 beams 束序列，每束 ratio × 伤害 */
  readonly radial?: { readonly beams: number; readonly ratio: number; readonly stepMs: number }
  /** 索敌无视断壁 */
  readonly piercesWalls?: boolean
}
export interface SlowAuraDef {
  readonly kind: 'slowAura'
  /** 圆心为队伍中心 */
  readonly radius: number
  /** 敌人移速乘数 */
  readonly slowFactor: number
  readonly color: number
  // ── 能力字段 ──
  /** 光环内每秒掉血 */
  readonly dps?: number
  /** 每 intervalMs 冻结光环内敌人 durationMs */
  readonly freeze?: { readonly intervalMs: number; readonly durationMs: number }
}
export interface AssassinateDef {
  readonly kind: 'assassinate'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  /** 索敌半径：血量最高者优先 */
  readonly range: number
  /** 落点在目标背后（相对队伍中心的反侧）的距离 */
  readonly behindDist: number
  /** 突袭停留时长；期间本体无敌，结束闪回原位 */
  readonly strikeMs: number
  readonly held?: HeldVisual
  // ── 能力字段 ──
  /** 排除主目标 */
  readonly onHit?: readonly Effect[]
  /** 目标血量比例低于 hpRatio 时伤害 × mul */
  readonly execute?: { readonly hpRatio: number; readonly mul: number }
}
export interface TurretDef {
  readonly kind: 'turret'
  /** 布置间隔；本体无攻击，输出全部来自弩塔 */
  readonly placeIntervalMs: number
  /** 同时在场上限，超出拆最旧的 */
  readonly maxTurrets: number
  readonly turret: { readonly emoji: string; readonly size: number }
  readonly fireIntervalMs: number
  readonly damage: number
  readonly knockback: number
  readonly range: number
  readonly projectile: ProjectileSpec
  // ── 能力字段 ──
  /** 每次开火改为扇形连发 */
  readonly burst?: { readonly count: number; readonly spreadDeg: number }
}
export interface SummonDef {
  readonly kind: 'summon'
  /** 每波放出的数量 */
  readonly count: number
  readonly minion: { readonly emoji: string; readonly size: number; readonly speed: number }
  readonly damage: number
  readonly knockback: number
  readonly intervalMs: number
  /** 撞到敌人即自毁，否则到寿命消散 */
  readonly lifeMs: number
  // ── 能力字段 ──
  readonly onHit?: readonly Effect[]
}
export interface HealDef {
  readonly kind: 'heal'
  /** 目标为范围内血量比例最低者 */
  readonly amount: number
  readonly cooldownMs: number
  readonly range: number
  // ── 能力字段 ──
  /** 改为范围内全体各回 ratio × amount */
  readonly aoe?: { readonly ratio: number }
  /** 范围内有阵亡者时优先减其复活倒计时 */
  readonly defib?: { readonly reviveCutMs: number }
}
export interface ChainArcDef {
  readonly kind: 'chainArc'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  /** 首跳索敌半径 */
  readonly range: number
  /** 相邻弹跳的传导距离 */
  readonly arcRange: number
  /** 额外弹跳数（首跳之外） */
  readonly bounces: number
  /** 每跳伤害衰减乘数 */
  readonly decay: number
  readonly color: number
  // ── 能力字段 ──
  /** 施加于末跳落点，排除已弹跳目标 */
  readonly onHit?: readonly Effect[]
}
export interface RallyDef {
  readonly kind: 'rally'
  readonly cooldownMs: number
  /** 存活者按上限比例回复；阵亡者满血复活 */
  readonly healRatio: number
  readonly invulnMs: number
  /** 纯视觉 */
  readonly ringRadius: number
  readonly color: number
}
export interface StrikeDef {
  readonly kind: 'strike'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  /** 离锚点最近的 N 个 */
  readonly targets: number
  /** 每次命中掉落的金币数 */
  readonly coinsPerHit?: number
  /** 坠物视觉：从目标上方 fromAbove 处砸落，逐个错峰 staggerMs */
  readonly drop: {
    readonly emoji: string
    readonly size: number
    readonly fromAbove: number
    readonly dropMs: number
    readonly staggerMs: number
  }
}
export interface DanceDef {
  readonly kind: 'dance'
  readonly cooldownMs: number
  /** 含休眠者与窗口内新登场者 */
  readonly durationMs: number
}
export interface BuffDef {
  readonly kind: 'buff'
  readonly cooldownMs: number
  readonly damageMul: number
  readonly durationMs: number
}
export interface NukeDef {
  readonly kind: 'nuke'
  /** 基准伤害，实际 × 波次威胁倍率 */
  readonly damage: number
  readonly cooldownMs: number
  /** Boss 承伤比例 */
  readonly bossRatio: number
}
export interface TimeStopDef {
  readonly kind: 'timeStop'
  readonly cooldownMs: number
  /** 敌方时间近乎凝固，队伍照常 */
  readonly durationMs: number
}
export type AbilityDef =
  | ThrustDef
  | ProjectileDef
  | SweepDef
  | AreaBlastDef
  | BoomerangDef
  | LaserDef
  | SlowAuraDef
  | AssassinateDef
  | TurretDef
  | SummonDef
  | HealDef
  | ChainArcDef
  | RallyDef
  | StrikeDef
  | DanceDef
  | BuffDef
  | NukeDef
  | TimeStopDef
