import type { Point } from '../lib/vec'
import type { SfxId } from '../audio/sfx'

// 能力 = 独立于角色的攻击行为单元；held 缺省时行为主体是角色本体。
// 新增能力类型：在此加 kind 与 Def，src/abilities/ 加对应运行时类并注册 create.ts。

/** 地面效果参数：留在地面的持续区（灼烧/毒液/…）。阵营与伤害归属由
 * 生成方注入（能力经 ctx、死亡效果在引擎侧直调）；跳伤施加语义按目标
 * 阵营分流（battle/groundEffects.ts）。radius 为格值，进战斗经 toPx */
export interface GroundEffectDef {
  readonly radius: number
  readonly durationMs: number
  readonly tickMs: number
  readonly damage: number
  /** 视觉：主色 + 填充/描边透明度 + 入场缩放时长 */
  readonly color: number
  readonly fillAlpha: number
  readonly lineAlpha: number
  readonly enterMs: number
}

/** 持有物视觉：挂在角色身上的能力 emoji */
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

export interface ThrustDef {
  readonly kind: 'thrust'
  readonly name: string
  /** 属性面板等 UI 的展示图标 */
  readonly icon: string
  readonly damage: number
  readonly cooldownMs: number
  /** 命中击退冲量（px/秒，方向从伤害源指向敌人；位移 ≈ 冲量 × KNOCKBACK.tauMs/1000） */
  readonly knockback: number
  /** 判定：从角色中心沿瞄准方向的线段长度 */
  readonly reach: number
  readonly hitRadius: number
  readonly thrustMs: number
  /** 无持有物时角色本体前冲的距离 */
  readonly lungeDist: number
  readonly held?: HeldVisual
  // ── 能力字段（core/abilities.ts 按角色等级注入） ──
  /** 二连突：出手后隔 delayMs 重新索敌再刺一段 */
  readonly combo?: { readonly delayMs: number }
  /** 枪尖震波：突刺终点圆形爆发（ratio × 伤害 + 强击退） */
  readonly tipBurst?: {
    readonly radius: number
    readonly ratio: number
    readonly knockback: number
    readonly color: number
  }
}

export interface ProjectileDef {
  readonly kind: 'projectile'
  readonly name: string
  readonly icon: string
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  /** 瞄准：nearest 最近目标（缺省）/ move 持有者移动方向（无需目标，ctx 供朝向） */
  readonly aim?: 'nearest' | 'move'
  /** 索敌上限覆写（缺省 ACQUIRE.range；敌械行可给大值表达「任意距离开火」） */
  readonly range?: number
  /** 弹药寿命（敌械弹按寿命回收；队伍弹走出屏/TTL 机制，字段不参与） */
  readonly lifeMs?: number
  /** 首发延迟覆写（敌械用；缺省由装配方给错峰值） */
  readonly firstDelayMs?: number
  /** 每次出手的音效（敌械弹幕用；队伍弹的 shoot 音效在引擎发弹处） */
  readonly fireSfx?: SfxId
  readonly held?: HeldVisual
  readonly projectile: {
    readonly emoji: string
    readonly size: number
    readonly radius: number
    readonly speed: number
    readonly rotationOffsetDeg: number
  }
  // ── 能力字段 ──
  /** 齐射：每次出手发射 count 枚，扇形均匀散开 spreadDeg（度）；
   * spreadDeg ≥ 360 为整圈（按 count 均分步进不重叠端点，无需目标），
   * randomRotate 每轮随机整体旋转（经 ctx.random，Boss 环形弹幕） */
  readonly volley?: { readonly count: number; readonly spreadDeg: number; readonly randomRotate?: boolean }
  /** 每第 n 次出手改为一轮特殊齐射 */
  readonly everyN?: { readonly n: number; readonly count: number; readonly spreadDeg: number }
  /** 贯穿：命中后继续飞行，可再命中的额外敌人数 */
  readonly pierce?: number
  /** 溅射：命中点圆形爆裂（ratio × 伤害） */
  readonly splash?: { readonly radius: number; readonly ratio: number }
  /** 魔尘：命中把敌人变形成无害替身（失去一切伤害能力，形象顶替，
   * 到期恢复；Boss 免疫）。vulnMul 为变形期间的受伤倍率（脆弱诅咒） */
  readonly hex?: { readonly durationMs: number; readonly morphEmoji: string; readonly vulnMul?: number }
}

export interface SweepDef {
  readonly kind: 'sweep'
  readonly name: string
  readonly icon: string
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  /** 扇形判定半径与弧宽 */
  readonly radius: number
  /** 扫掠弧宽（度） */
  readonly arcDeg: number
  readonly sweepMs: number
  readonly held: HeldVisual
  // ── 能力字段 ──
  /** 命中减速：被扫中的敌人临时减速 */
  readonly slowOnHit?: { readonly factor: number; readonly durationMs: number }
}

export interface AreaBlastDef {
  readonly kind: 'areaBlast'
  readonly name: string
  readonly icon: string
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  /** 侦测范围：在此距离内选取爆心（离持有者最近的敌人） */
  readonly detectRange: number
  /** 爆炸判定半径（以爆心为圆心） */
  readonly blastRadius: number
  /** 特效环颜色 */
  readonly color: number
  // ── 能力字段 ──
  /** 灼烧地面：爆心留下持续伤害区域 */
  readonly burn?: GroundEffectDef
  /** 连锁：延迟 delayMs 后向随机敌人追加一次 ratio × 伤害的轰炸 */
  readonly echo?: { readonly delayMs: number; readonly ratio: number }
}

export interface BoomerangDef {
  readonly kind: 'boomerang'
  readonly name: string
  readonly icon: string
  readonly damage: number
  /** 接住后才开始计冷却 */
  readonly cooldownMs: number
  readonly knockback: number
  /** 去程距离在出手瞬间锁定 */
  readonly range: number
  readonly outMs: number
  /** 回程追踪角色实时位置的速度 */
  readonly returnSpeed: number
  readonly hitRadius: number
  /** 飞行自旋角速度（度/秒） */
  readonly spinDegPerSec: number
  readonly held: HeldVisual
  // ── 能力字段 ──
  /** 双镖：同时向反方向掷出第二枚 */
  readonly twin?: boolean
  /** 磁力：飞行途中吸取半径内金币 */
  readonly coinMagnetRadius?: number
}

export interface LaserDef {
  readonly kind: 'laser'
  readonly name: string
  readonly icon: string
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  /** 光束长度；判定为线段胶囊（thrustHitIndices），贯穿直线上所有敌人 */
  readonly range: number
  readonly beamRadius: number
  readonly color: number
  readonly held: HeldVisual
  // ── 能力字段 ──
  /** 双联：向正后方同步射出第二道光束 */
  readonly backBeam?: boolean
  /** 全域扫射：出手变为绕一周的多向序列光束（每束 ratio × 伤害），取代常规单束 */
  readonly radial?: { readonly beams: number; readonly ratio: number; readonly stepMs: number }
}

export interface SlowAuraDef {
  readonly kind: 'slowAura'
  readonly name: string
  readonly icon: string
  /** 光环以队伍中心为圆心持续生效（角色只是来源），无伤害无冷却 */
  readonly radius: number
  /** 敌人移速乘数 */
  readonly slowFactor: number
  readonly color: number
  // ── 能力字段 ──
  /** 冻伤：光环内敌人持续掉血（每秒） */
  readonly dps?: number
  /** 冰冻脉冲：每 intervalMs 冻结（移速归零）光环内敌人 durationMs */
  readonly freeze?: { readonly intervalMs: number; readonly durationMs: number }
}

export interface AssassinateDef {
  readonly kind: 'assassinate'
  readonly name: string
  readonly icon: string
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  /** 索敌半径：范围内血量最高者优先（精英/厚血怪是刺杀目标） */
  readonly range: number
  /** 落点：目标背后（相对队伍中心的反侧）这段距离 */
  readonly behindDist: number
  /** 突袭停留时长；期间本体无敌，结束闪回原位 */
  readonly strikeMs: number
  readonly held?: HeldVisual
  // ── 能力字段 ──
  /** 连环刃：斩击同时命中目标周围小圈（ratio × 伤害） */
  readonly cleave?: { readonly radius: number; readonly ratio: number }
  /** 处决：目标血量低于 hpRatio 时伤害 ×mul */
  readonly execute?: { readonly hpRatio: number; readonly mul: number }
}

export interface TurretDef {
  readonly kind: 'turret'
  readonly name: string
  readonly icon: string
  /** 布置间隔；本体无攻击，输出全部来自弩塔 */
  readonly placeIntervalMs: number
  /** 同时在场上限，超出拆最旧的 */
  readonly maxTurrets: number
  readonly turret: { readonly emoji: string; readonly size: number }
  readonly fireIntervalMs: number
  readonly damage: number
  readonly knockback: number
  /** 弩塔索敌半径 */
  readonly range: number
  readonly projectile: {
    readonly emoji: string
    readonly size: number
    readonly radius: number
    readonly speed: number
    readonly rotationOffsetDeg: number
  }
  // ── 能力字段 ──
  /** 三连弩：每次开火改为扇形连发 */
  readonly burst?: { readonly count: number; readonly spreadDeg: number }
}

export interface SummonDef {
  readonly kind: 'summon'
  readonly name: string
  readonly icon: string
  /** 召唤物数量（独立 AI：追击最近敌人，撞击伤害） */
  readonly count: number
  readonly minion: { readonly emoji: string; readonly size: number; readonly speed: number }
  readonly damage: number
  readonly knockback: number
  /** 单只命中后的再攻间隔（撞完弹开一小段） */
  readonly hitCooldownMs: number
  // ── 能力字段 ──
  /** 麻痹毒素：蜇中的敌人临时减速 */
  readonly sting?: { readonly slowFactor: number; readonly slowMs: number }
}

export interface HealDef {
  readonly kind: 'heal'
  readonly name: string
  readonly icon: string
  /** 周期治疗范围内血量比例最低的队友 */
  readonly amount: number
  readonly cooldownMs: number
  readonly range: number
  // ── 能力字段 ──
  /** 群体处方：改为范围内全体回复 ratio × amount */
  readonly aoe?: { readonly ratio: number }
  /** 电击起搏：范围内有阵亡队友时优先为其减少复活倒计时 */
  readonly defib?: { readonly reviveCutMs: number }
}

export interface ChainArcDef {
  readonly kind: 'chainArc'
  readonly name: string
  readonly icon: string
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
  /** 过载：末跳落点爆出小范围电击（ratio × 伤害） */
  readonly burstEnd?: { readonly radius: number; readonly ratio: number }
}

// ── 单发型能力（castNow）：队长主动技能的效果载荷，也可作角色自动能力 ──

export interface RallyDef {
  readonly kind: 'rally'
  readonly name: string
  readonly icon: string
  readonly cooldownMs: number
  /** 存活我方按生命上限比例回复；阵亡者满血复活（rallyTeam 语义） */
  readonly healRatio: number
  /** 全队短暂无敌时长 */
  readonly invulnMs: number
  /** 冲击环视觉半径 */
  readonly ringRadius: number
  readonly color: number
}

export interface StrikeDef {
  readonly kind: 'strike'
  readonly name: string
  readonly icon: string
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  /** 点名打击离锚点最近的 N 个目标 */
  readonly targets: number
  /** 每次命中落地掉落的金币数 */
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
  readonly name: string
  readonly icon: string
  readonly cooldownMs: number
  /** 敌对方全体跳舞定身时长（含休眠者与窗口内新登场者） */
  readonly durationMs: number
}

export interface BuffDef {
  readonly kind: 'buff'
  readonly name: string
  readonly icon: string
  readonly cooldownMs: number
  /** 限时全队伤害倍率（到期自动复原） */
  readonly damageMul: number
  readonly durationMs: number
}

export interface NukeDef {
  readonly kind: 'nuke'
  readonly name: string
  readonly icon: string
  /** 基准伤害 × 当前波次威胁倍率（ctx.waveScale，与敌人成长同步） */
  readonly damage: number
  readonly cooldownMs: number
  /** Boss 承伤比例 */
  readonly bossRatio: number
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

export interface HitTarget {
  x: number
  y: number
  radius: number
}

/** 归一化到 (-π, π] */
export function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI)
  if (r <= -Math.PI) r += 2 * Math.PI
  if (r > Math.PI) r -= 2 * Math.PI
  return r
}

/** 突刺命中：目标圆与线段 [origin, origin + dir·reach] 的距离 ≤ hitRadius + 目标半径 */
export function thrustHitIndices(
  origin: Point,
  angle: number,
  reach: number,
  hitRadius: number,
  targets: readonly HitTarget[],
): number[] {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const out: number[] = []
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!
    const px = t.x - origin.x
    const py = t.y - origin.y
    const proj = Math.max(0, Math.min(reach, px * dx + py * dy))
    const cx = px - dx * proj
    const cy = py - dy * proj
    const rr = hitRadius + t.radius
    if (cx * cx + cy * cy <= rr * rr) out.push(i)
  }
  return out
}

/** 线段扫掠命中：沿 a→b 最先进入命中范围的目标下标，无命中返回 -1。
 * 子弹按帧步进，低帧率下单帧位移可远超目标直径（穿模），必须用扫掠而非点重叠判定 */
export function sweepFirstHitIndex(
  a: Point,
  b: Point,
  radius: number,
  targets: readonly HitTarget[],
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let best = -1
  let bestT = Infinity
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!
    const px = t.x - a.x
    const py = t.y - a.y
    const proj = len2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0
    const cx = px - dx * proj
    const cy = py - dy * proj
    const rr = radius + t.radius
    if (cx * cx + cy * cy <= rr * rr && proj < bestT) {
      bestT = proj
      best = i
    }
  }
  return best
}

/** 圆形命中：与圆心距离 ≤ radius + 目标半径 */
export function circleHitIndices(
  center: Point,
  radius: number,
  targets: readonly HitTarget[],
): number[] {
  const out: number[] = []
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!
    const dx = t.x - center.x
    const dy = t.y - center.y
    const rr = radius + t.radius
    if (dx * dx + dy * dy <= rr * rr) out.push(i)
  }
  return out
}

/** 扇形命中：距离在半径内且方位角在弧宽内（贴身目标直接命中） */
export function sectorHitIndices(
  origin: Point,
  aimAngle: number,
  arcRad: number,
  radius: number,
  targets: readonly HitTarget[],
): number[] {
  const out: number[] = []
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!
    const dx = t.x - origin.x
    const dy = t.y - origin.y
    const rr = radius + t.radius
    const d2 = dx * dx + dy * dy
    if (d2 > rr * rr) continue
    if (d2 <= t.radius * t.radius) {
      out.push(i)
      continue
    }
    if (Math.abs(wrapAngle(Math.atan2(dy, dx) - aimAngle)) <= arcRad / 2) out.push(i)
  }
  return out
}
