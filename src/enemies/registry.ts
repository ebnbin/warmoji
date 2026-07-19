import { hydrate } from '../lib/hydrate'
import { UNIT } from '../lib/units'
import enemiesJson from './enemies.json'

// 敌人：behavior 决定战斗内行为分支（ArenaScene 按此分派）。
// chase 直追最近队员；wanderFire 游荡+朝移动方向放枪；dash 探测→蓄力→直线突刺；
// fleeFire 见人就逃+朝人冷枪；coinThief 抢地上的金币，击杀吐回+利息。
export interface EnemyBulletSpec {
  readonly emoji: string
  readonly size: number
  readonly radius: number
  readonly speed: number
  readonly damage: number
  readonly lifeMs: number
}

interface EnemyBase {
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
}

export interface ChaseEnemySpec extends EnemyBase {
  readonly kind: 'zombie' | 'ghost' | 'mushroom' | 'blob' | 'blobling'
  readonly behavior: 'chase'
  /** 死亡在原地留毒液池（玩家踩入按 tick 掉血） */
  readonly poison?: {
    readonly radius: number
    readonly durationMs: number
    readonly tickMs: number
    readonly damage: number
  }
  /** 死亡分裂出迷你体 */
  readonly split?: { readonly into: ChaseEnemySpec; readonly count: number }
}

export interface WanderFireEnemySpec extends EnemyBase {
  readonly kind: 'invader'
  readonly behavior: 'wanderFire'
  readonly fireIntervalMs: number
  readonly bullet: EnemyBulletSpec
}

export interface DashEnemySpec extends EnemyBase {
  readonly kind: 'boar'
  readonly behavior: 'dash'
  readonly detectRange: number
  readonly windupMs: number
  readonly dashSpeed: number
  readonly dashDist: number
  readonly cooldownMs: number
}

export interface FleeFireEnemySpec extends EnemyBase {
  readonly kind: 'snake'
  readonly behavior: 'fleeFire'
  readonly fleeRange: number
  readonly fireIntervalMs: number
  readonly bullet: EnemyBulletSpec
}

export interface CoinThiefEnemySpec extends EnemyBase {
  readonly kind: 'rat'
  readonly behavior: 'coinThief'
}

export type EnemySpec =
  | ChaseEnemySpec
  | WanderFireEnemySpec
  | DashEnemySpec
  | FleeFireEnemySpec
  | CoinThiefEnemySpec

// 敌人数据在 enemies.json，按格书写（"Nu"），经 lib/hydrate 唯一边界换算；
// 分裂（泡泡 → 小泡泡）在数据里是 ID 引用，加载时解析成 spec 对象。
export type MixKind = 'zombie' | 'ghost' | 'invader' | 'boar' | 'snake' | 'mushroom' | 'rat' | 'blob'

interface BossRing {
  readonly count: number
  readonly intervalMs: number
  readonly bullet: EnemyBulletSpec
}

// 终局 Boss（末波）：大体型 + 周期环形弹幕 + 蓄力突刺；击退免疫。
// 血量固定不吃时间成长曲线（按满编 18 波队伍粗校准），击败或撑满时长皆通关
export interface BossSpec {
  readonly emoji: string
  readonly name: string
  readonly size: number
  readonly radius: number
  readonly hp: number
  readonly speed: number
  readonly damage: number
  readonly xp: number
  readonly coins: number
  readonly ring: BossRing
  readonly dash: { readonly intervalMs: number; readonly windupMs: number; readonly speed: number; readonly durationMs: number }
  readonly spawnRelief: number
}

type SpecRow = EnemySpec & { split?: { into: unknown; count: number } }
const data = hydrate<{
  specs: Record<string, SpecRow>
  mix: readonly { kind: MixKind; sinceWave: number; base: number; perWave: number; min: number; max: number }[]
  boss: BossSpec
}>(enemiesJson)
for (const s of Object.values(data.specs)) {
  if (s.split && typeof s.split.into === 'string') {
    const target = data.specs[s.split.into]
    if (!target) throw new Error(`未知分裂目标: ${s.split.into}`)
    s.split.into = target
  }
}
const S = data.specs
export const ZOMBIE = S['zombie']! as ChaseEnemySpec
export const GHOST = S['ghost']! as ChaseEnemySpec
export const INVADER = S['invader']! as WanderFireEnemySpec
export const BOAR = S['boar']! as DashEnemySpec
export const SNAKE = S['snake']! as FleeFireEnemySpec
export const MUSHROOM = S['mushroom']! as ChaseEnemySpec
export const RAT = S['rat']! as CoinThiefEnemySpec
export const BLOBLING = S['blobling']! as ChaseEnemySpec
export const BLOB = S['blob']! as ChaseEnemySpec

export const ENEMY_SPECS: readonly EnemySpec[] = [
  ZOMBIE,
  GHOST,
  INVADER,
  BOAR,
  SNAKE,
  MUSHROOM,
  RAT,
  BLOB,
  BLOBLING,
]

// 出场配比：新怪按波次渐入（sinceWave），僵尸/幽灵始终是主体；
// 权重随波次线性微调，zombie 有下限兜底（见本文件 enemyMixAt）
export const ENEMY_MIX = data.mix

export const BOSS = data.boss


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
  markSize: 1.0 * UNIT,
  minPlayerDist: 3 * UNIT,
  edgeInset: 0.5 * UNIT,
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

const BY_KIND: Record<(typeof ENEMY_MIX)[number]['kind'], EnemySpec> = {
  zombie: ZOMBIE,
  ghost: GHOST,
  invader: INVADER,
  boar: BOAR,
  snake: SNAKE,
  mushroom: MUSHROOM,
  rat: RAT,
  blob: BLOB,
}

export interface EnemyMixEntry {
  spec: EnemySpec
  weight: number
}

/** 某一波的出场配比（已按 sinceWave 过滤、权重夹在上下限之间） */
export function enemyMixAt(wave: number): EnemyMixEntry[] {
  return ENEMY_MIX.filter((m) => wave >= m.sinceWave).map((m) => ({
    spec: BY_KIND[m.kind],
    weight: Math.min(m.max, Math.max(m.min, m.base + m.perWave * (wave - m.sinceWave))),
  }))
}

/** 按权重随机抽一种敌人 */
export function pickEnemy(mix: readonly EnemyMixEntry[], rand: () => number): EnemySpec {
  const total = mix.reduce((s, m) => s + m.weight, 0)
  let roll = rand() * total
  for (const m of mix) {
    roll -= m.weight
    if (roll < 0) return m.spec
  }
  return mix[mix.length - 1]!.spec
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
