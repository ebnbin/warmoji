import enemiesJson from '../assets/enemies.json'
import difficultyJson from '../assets/difficulty.json'
import aiJson from '../assets/ai.json'
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
/** 冲刺触发：探测圈（进圈即冲、冲后冷却）或定时循环（按节拍冲）——各带专属参数，互斥由类型强制 */
export type DashTrigger =
  | { readonly kind: 'detect'; readonly range: number; readonly cooldownMs: number }
  | { readonly kind: 'timer'; readonly intervalMs: number; readonly firstDelayMs?: number }

/** 冲刺长度：距离制（冲固定格数）或时长制（冲固定时长）——互斥由类型强制 */
export type DashLength =
  | { readonly kind: 'dist'; readonly dist: number }
  | { readonly kind: 'time'; readonly durationMs: number }

export interface DashLocomotion {
  readonly kind: 'dash'
  readonly windupMs: number
  readonly dashSpeed: number
  /** 触发方式（探测/定时）与其专属参数 */
  readonly trigger: DashTrigger
  /** 冲刺长度（距离/时长）与其专属参数 */
  readonly length: DashLength
  /** 非冲刺期的移动 */
  readonly idle: 'wander' | 'chase'
  /** 瞄准：最近队员或队伍中心 */
  readonly aim: 'nearest' | 'teamCenter'
  /** 方向锁定时机：进蓄力即锁（可预判横躲）或起跑瞬间锁（追踪到最后一刻） */
  readonly lockAt: 'windup' | 'launch'
  /** 起跑音效 */
  readonly sfx?: 'whoosh'
}

/** 定距风筝：在玩家外维持一个固定距离环——detectRange 内才咬人，贴到 standoffDist
 * 就停手站定吐弹，太近则边逃边打。几百只会在玩家四周围成一圈。 */
export interface StandoffLocomotion {
  readonly kind: 'standoff'
  /** 咬住玩家的探测半径（此外只游荡） */
  readonly detectRange: number
  /** 站位距离：贴到此距离即停止靠近，更近则后退 */
  readonly standoffDist: number
}

/** 自爆冲锋：追玩家，进 triggerRange 就定身蓄力，蓄力完必定原地引爆（AoE 伤玩家后自毁）。
 * 引爆走 scene.detonate（非亡语）——蓄力前被打死则不炸。 */
export interface DetonateLocomotion {
  readonly kind: 'detonate'
  /** 进入此距离即开始拆弹（定身蓄力） */
  readonly triggerRange: number
  readonly windupMs: number
  readonly blastRadius: number
  readonly blastDamage: number
  readonly knockback: number
}

/** 护巢环绕：绕生成自己的巢（owner）盘旋；玩家逼近巢即扑向玩家。巢被拆后失去锚点，
 * 按 orphan 倍率强化速度/攻击并转为直扑玩家（双属性档位切换）。 */
export interface BaseOrbitLocomotion {
  readonly kind: 'baseOrbit'
  /** 绕巢半径 */
  readonly orbitRadius: number
  /** 玩家逼近巢多近即触发护巢扑击（判定基准是巢，不是本体） */
  readonly aggroRange: number
  /** 巢被拆后的暴走速度倍率 */
  readonly orphanSpeedMul: number
  /** 巢被拆后的暴走攻击倍率 */
  readonly orphanDamageMul: number
}

export type LocomotionDef =
  | { readonly kind: 'chase' }
  | { readonly kind: 'wander' }
  | { readonly kind: 'static' }
  | { readonly kind: 'flee'; readonly range: number }
  | { readonly kind: 'coinThief' }
  | StandoffLocomotion
  | DetonateLocomotion
  | BaseOrbitLocomotion
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

/** 缺省接触效果：一发接触伤害（未显式配 onContact 的敌人都用它，共享一份不重复分配） */
export const DEFAULT_CONTACT: readonly Effect[] = [{ kind: 'damage' }]

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
    | 'creeper'
    | 'rhino'
    | 'treant'
    | 'scorpion'
    | 'croc'
    | 'mecha'
    | 'elf'
    | 'turtle'
    | 'locust'
    | 'gargoyle'
    | 'puffer'
    | 'eclipse'
    | 'ufo'
    | 'alien'
    | 'comet'
    | 'blackhole'
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
  readonly onContact?: readonly Effect[]
  /** 巢穴：周期性生成子敌（非死亡触发的生成实体；into 随父深度 px 化）——不打掉就一直刷 */
  readonly spawner?: {
    readonly into: EnemyDef
    readonly intervalMs: number
    readonly count: number
    /** 本巢在场子敌上限：达上限即停生，被清掉一部分后续生（见 spawnFromNest） */
    readonly maxAlive: number
    readonly firstDelayMs?: number
  }
  readonly kbImmune?: boolean
  /** 穿墙移动（残垣图）：无视断壁直线穿行、不吃墙体碰撞（幽灵）——「墙挡不住它」 */
  readonly phasesWalls?: boolean
  /** 冲刺破墙（残垣图）：冲刺途中碾碎沿途断壁（拆迁 Boss）；非冲刺期照常绕墙 */
  readonly breaksWalls?: boolean
  /** 角色：缺省 enemy；boss 由引擎侧特判（通关判定 + HUD 血条），并由 map.boss 引用 */
  readonly role?: 'enemy' | 'boss'
}

// 数据行在 defs/enemies.ts（创作层），npm run gen 生成 enemies.json；
// split.into 已内联为自包含数据。构建期已校验，此处一次断言收口。
// Boss 就是 role:'boss' 的普通条目：ENEMIES 全量按 kind 反查、ENEMY_DEFS 只含常规怪、BOSSES 只含 Boss
export const ENEMIES = enemiesJson.enemies as unknown as Record<string, EnemyDef>
const ALL_ENEMIES = Object.values(ENEMIES)
export const ENEMY_DEFS = ALL_ENEMIES.filter((e) => e.role !== 'boss')
export const BOSSES = ALL_ENEMIES.filter((e) => e.role === 'boss')

/** 出怪表的一行（数据归各 Map；kind + 波次权重曲线） */
export interface EnemyMixRow {
  readonly kind: string
  readonly sinceWave: number
  readonly base: number
  readonly perWave: number
  readonly min: number
  readonly max: number
}

// 难度/敌潮/精英/终波减压的「设计数值」形状：数据行在 defs/difficulty.ts（创作层），
// npm run gen 校验后产出 difficulty.json；本文件只从中派生出以下惯用导出，形状与数值不变。
export interface Difficulty {
  /** 刷怪节奏（波次制）：随跨波累计战斗时长持续加压 */
  readonly spawn: {
    readonly startIntervalMs: number
    readonly minIntervalMs: number
    readonly rampSeconds: number
    readonly hpGrowthPerMin: number
    readonly maxAlive: number
    /** 刷怪供给随在场人数缩放：factor = base + perMember×人数 */
    readonly teamFactorBase: number
    readonly teamFactorPerMember: number
    /** 地图内随机刷怪：先显示预告标记再落地 */
    readonly telegraphMs: number
    readonly markEmoji: string
    readonly markSize: number
    readonly minPlayerDist: number
    readonly edgeInset: number
  }
  /** 精英怪：第 fromWave 波起按概率出现——金色描边 + 三围强化乘数 */
  readonly elite: {
    readonly fromWave: number
    readonly chance: number
    readonly hpMul: number
    readonly speedMul: number
    readonly damageMul: number
    readonly sizeMul: number
    readonly xpMul: number
    readonly coinsMul: number
  }
  /** 敌人潮：精英波开局一波密集冲锋（含保底精英） */
  readonly surge: {
    readonly count: number
    readonly elites: number
    /** 潮水在这段时间内陆续落地 */
    readonly spreadMs: number
  }
  /** 终波常规刷怪减压倍率（间隔 ×N）：把火力焦点留给 Boss */
  readonly bossSpawnRelief: number
}

const DIFF = difficultyJson as unknown as Difficulty

export const SPAWN = DIFF.spawn
export const ELITE = DIFF.elite
export const SURGE = DIFF.surge
export const BOSS_SPAWN_RELIEF = DIFF.bossSpawnRelief

// 敌人 AI 手感（与难度正交）：游荡换向节奏、风筝滞回带、偷币冷却、逃兵脱战限速。
// 数据行在 defs/ai.ts（创作层），gen 校验产出 ai.json；本文件只派生同名导出。
export interface AiTuning {
  /** 游荡换向节奏：每次换向后随机等 [min, min+jitter) ms 再换；spawn* 为出生后首次换向的更短区间 */
  readonly wander: {
    readonly turnMinMs: number
    readonly turnJitterMs: number
    readonly spawnTurnMinMs: number
    readonly spawnTurnJitterMs: number
  }
  /** 定距风筝的站位滞回带（单位）：避免恰好卡在 standoffDist 上抖动 */
  readonly standoffBandU: number
  /** 偷币鼠吞币冷却（ms）：一枚一枚地偷，不会一帧扫光一堆 */
  readonly coinThiefEatCdMs: number
  /** 逃兵脱战时的游荡限速倍率（贴脸才全速逃，远离时慢速晃） */
  readonly fleeIdleSpeedMul: number
}

const AITUNE = aiJson as unknown as AiTuning
export const AI = AITUNE

export interface EnemyMixEntry {
  def: EnemyDef
  weight: number
}

/** 某一波的出场配比（已按 sinceWave 过滤、权重夹在上下限之间） */
export function enemyMixAt(mix: readonly EnemyMixRow[], wave: number): EnemyMixEntry[] {
  return mix.filter((m) => wave >= m.sinceWave).map((m) => ({
    def: ENEMIES[m.kind]!,
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
