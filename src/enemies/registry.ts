import enemiesJson from '../assets/enemies.json'
import type { AbilityDef, Effect } from '../abilities/defs'

// 敌人 = 基础三围 + 移动方式（locomotion）+ 能力列表 + 死亡效果列表。
// 多样性用数据组合表达：加一种敌人 = 组合现有模块的一行数据；
// 运行时按 locomotion.kind 分发转向（battle/steer.ts）、能力经敌方 ctx
// 逐帧驱动（battle/enemyAbilities.ts）、死亡时跑效果模块（killEnemy）。
export interface EnemyProjectileDef {
  readonly emoji: string
  readonly size: number
  readonly radius: number
  readonly speed: number
  readonly damage: number
  readonly lifeMs: number
}

// ── 移动方式 ────────────────────────────────────────────────
export interface DashLocomotion {
  readonly kind: 'dash'
  readonly windupMs: number
  readonly dashSpeed: number
  /** 触发：探测圈（野猪）或定时循环（Boss），二选一 */
  readonly detectRange?: number
  readonly intervalMs?: number
  /** 冲刺长度：距离制（野猪）或时长制（Boss），二选一 */
  readonly dashDist?: number
  readonly durationMs?: number
  /** 探测型冲刺后的冷却；定时型由 intervalMs 驱动下一轮 */
  readonly cooldownMs?: number
  /** 非冲刺期的移动 */
  readonly idle: 'wander' | 'chase'
  /** 瞄准：最近队员（野猪）或队伍中心（Boss） */
  readonly aim: 'nearest' | 'teamCenter'
  /** 方向锁定时机：进蓄力即锁（可预判横躲）或起跑瞬间锁（追踪到最后一刻） */
  readonly lockAt: 'windup' | 'launch'
  /** 定时型首次触发延迟 */
  readonly firstDelayMs?: number
  /** 起跑音效 */
  readonly sfx?: 'whoosh'
}

export type LocomotionDef =
  | { readonly kind: 'chase' }
  | { readonly kind: 'wander' }
  | { readonly kind: 'static' }
  | { readonly kind: 'flee'; readonly range: number }
  | { readonly kind: 'coinThief' }
  | DashLocomotion

// ── 死亡效果（亡语）─────────────────────────────────────────
// 亡语 = 死亡触发的一串效果，与命中触发 onHit 复用同一套组合式 Effect
//（留毒 = ground、治疗 = heal、冷枪 = spawnProjectile），经敌方 ctx 求值
//（deathEffects.ts）。生成实体类（分裂/诱饵）需引 EnemyDef，为避免与 abilities
// 循环依赖留在本模块，与 Effect 并入同一 onDeath 联合。

/** 分裂：生成 count 个指定敌人（血量吃当前波次成长曲线，随机散开） */
export interface SplitEffect {
  readonly kind: 'split'
  readonly into: EnemyDef
  readonly count: number
}

/** 诱饵尸壳：原地留一具由自身退化的半透明替身（无伤害/无行为，吸火力），到时消失 */
export interface DecoyEffect {
  readonly kind: 'decoy'
  readonly hp: number
  readonly durationMs: number
  readonly alpha: number
}

/** 亡语效果：组合式 Effect（ground/heal/spawnProjectile…）+ 生成实体类（split/decoy） */
export type DeathEffect = Effect | SplitEffect | DecoyEffect

/** 接触触发效果（敌→队员；接触本身掌管无敌帧节流）：伤害 / 攻速减益。
 * 与命中/死亡的组合式 Effect 分开——攻速减益是敌→队员专属，接触的节流语义也不同 */
export type ContactEffect =
  | { readonly kind: 'damage' }
  | { readonly kind: 'attackSlow'; readonly mul: number; readonly durationMs: number }

/** 缺省接触效果：一发接触伤害（未显式配 onContact 的敌人都用它，共享一份不重复分配） */
export const DEFAULT_CONTACT: readonly ContactEffect[] = [{ kind: 'damage' }]

export interface EnemyDef {
  readonly kind:
    | 'zombie'
    | 'ghost'
    | 'mushroom'
    | 'blob'
    | 'blobling'
    | 'invader'
    | 'boar'
    | 'snake'
    | 'rat'
    | 'slime'
    | 'hive'
    | 'larva'
    | 'boss'
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly size: number
  readonly radius: number
  readonly hp: number
  readonly speed: number
  readonly damage: number
  // 经验击杀即得；金币落地需拾取（波次结束未拾取的消失）
  readonly xp: number
  readonly coins: number
  readonly locomotion: LocomotionDef
  /** 持械（阵营中立能力行；battle/enemyAbilities 以敌方 ctx 装配驱动）——
   * 敌人的远程攻击全部经能力表达（原 periodicShot/ringBarrage 积木已并入） */
  readonly abilities?: readonly AbilityDef[]
  readonly onDeath?: readonly DeathEffect[]
  /** 接触触发效果：蹭到队员时逐条施加（缺省 = 一发接触伤害，见 DEFAULT_CONTACT） */
  readonly onContact?: readonly ContactEffect[]
  /** 巢穴：周期性生成子敌（非死亡触发的生成实体；into 随父深度 px 化）——不打掉就一直刷 */
  readonly spawner?: {
    readonly into: EnemyDef
    readonly intervalMs: number
    readonly count: number
    readonly firstDelayMs?: number
  }
  readonly kbImmune?: boolean
}

// 数据行在 defs/enemies.ts（创作层），npm run gen 生成 enemies.json；
// split.into 已内联为自包含数据。构建期已校验，此处一次断言收口
export const ENEMY_DEFS = Object.values(enemiesJson.enemies) as unknown as readonly EnemyDef[]
export const BOSS = enemiesJson.boss as unknown as EnemyDef
interface EnemyMixRow {
  readonly kind: string
  readonly sinceWave: number
  readonly base: number
  readonly perWave: number
  readonly min: number
  readonly max: number
}
const ENEMY_MIX = enemiesJson.mix as unknown as readonly EnemyMixRow[]

// 刷怪节奏（波次制）：第 1 波基础火力可稳过，随跨波累计战斗时长持续加压，
// 后期压力超出基础火力，由商店成长补差
export const SPAWN = {
  startIntervalMs: 450,
  minIntervalMs: 80,
  rampSeconds: 300,
  hpGrowthPerMin: 0.5,
  maxAlive: 400,
  // 刷怪供给随在场人数缩放：factor = base + perMember×人数（5 人 = 1.0），
  // 让单人首发的第 1 波与满编后期压力手感一致
  teamFactorBase: 0.35,
  teamFactorPerMember: 0.13,
  // 地图内随机刷怪：先显示预告标记再落地
  telegraphMs: 900,
  markEmoji: '⚠️',
  markSize: 1.0,
  minPlayerDist: 3,
  edgeInset: 0.5,
} as const

// 精英怪：第 fromWave 波起按概率出现——金色描边 + 三围强化，掉更多经验金币。
// 强化走乘数（血量在刷怪时算入，移速/伤害在运行时按敌身上的标记生效）
export const ELITE = {
  fromWave: 10,
  chance: 0.15,
  hpMul: 4,
  speedMul: 1.25,
  damageMul: 2,
  sizeMul: 1.2,
  xpMul: 4,
  coinsMul: 3,
} as const

// 敌人潮：精英波（WAVE.eliteWaves）开局的一波密集冲锋（含保底精英），配警示横幅
export const SURGE = {
  count: 14,
  elites: 3,
  /** 潮水在这段时间内陆续落地 */
  spreadMs: 2600,
} as const

// 终局 Boss（末波）：与普通敌人同一套组合数据——定时突刺移动 + 环形弹幕
// 攻击模块 + 击退免疫；血量固定不吃时间成长曲线（按满编 18 波队伍粗校准），
// 击败或撑满时长皆通关。特殊性只剩引擎侧的通关判定与 HUD 血条（boss 标记）。
/** 终波常规刷怪减压倍率（间隔 ×N）：把火力焦点留给 Boss */
export const BOSS_SPAWN_RELIEF = 2

const BY_KIND = enemiesJson.enemies as unknown as Record<string, EnemyDef>

export interface EnemyMixEntry {
  def: EnemyDef
  weight: number
}

/** 某一波的出场配比（已按 sinceWave 过滤、权重夹在上下限之间） */
export function enemyMixAt(wave: number): EnemyMixEntry[] {
  return ENEMY_MIX.filter((m) => wave >= m.sinceWave).map((m) => ({
    def: BY_KIND[m.kind]!,
    weight: Math.min(m.max, Math.max(m.min, m.base + m.perWave * (wave - m.sinceWave))),
  }))
}

/** 按权重随机抽一种敌人 */
export function pickEnemy(mix: readonly EnemyMixEntry[], rand: () => number): EnemyDef {
  const total = mix.reduce((s, m) => s + m.weight, 0)
  let roll = rand() * total
  for (const m of mix) {
    roll -= m.weight
    if (roll < 0) return m.def
  }
  return mix[mix.length - 1]!.def
}

/** 逃离转向：贴近地图边缘时叠加向内分量，沿墙滑行绕开而不是顶着边界冲 */
export function fleeSteer(
  x: number,
  y: number,
  awayX: number,
  awayY: number,
  mapW: number,
  mapH: number,
  margin: number,
): { x: number; y: number } {
  let fx = awayX
  let fy = awayY
  if (x < margin) fx += ((margin - x) / margin) * 2
  if (x > mapW - margin) fx -= ((x - (mapW - margin)) / margin) * 2
  if (y < margin) fy += ((margin - y) / margin) * 2
  if (y > mapH - margin) fy -= ((y - (mapH - margin)) / margin) * 2
  const len = Math.hypot(fx, fy)
  if (len < 1e-6) {
    // 完全抵消（顶死在边上）时沿切线走
    const t = Math.hypot(awayX, awayY) || 1
    return { x: -awayY / t, y: awayX / t }
  }
  return { x: fx / len, y: fy / len }
}
