import type { WeaponSpec } from '../weapons/spec'

// 敌人 = 基础三围 + 移动方式（locomotion）+ 武器列表 + 死亡效果列表。
// 多样性用数据组合表达：加一种敌人 = 组合现有模块的一行数据；
// 运行时按 locomotion.kind 分发转向（battle/steer.ts）、武器经敌方 ctx
// 逐帧驱动（battle/enemyWeapons.ts）、死亡时跑效果模块（killEnemy）。
export interface EnemyBulletSpec {
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

export type LocomotionSpec =
  | { readonly kind: 'chase' }
  | { readonly kind: 'wander' }
  | { readonly kind: 'flee'; readonly range: number }
  | { readonly kind: 'coinThief' }
  | DashLocomotion

// ── 死亡效果 ────────────────────────────────────────────────
export interface DeathPoisonSpec {
  readonly kind: 'poison'
  readonly radius: number
  readonly durationMs: number
  readonly tickMs: number
  readonly damage: number
}

export interface DeathSplitSpec {
  readonly kind: 'split'
  readonly into: EnemySpec
  readonly count: number
}

export type DeathEffectSpec = DeathPoisonSpec | DeathSplitSpec

export interface EnemySpec {
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
  readonly locomotion: LocomotionSpec
  /** 持械（阵营中立武器行；battle/enemyWeapons 以敌方 ctx 装配驱动）——
   * 敌人的远程攻击全部经武器表达（原 periodicShot/ringBarrage 积木已并入） */
  readonly weapons?: readonly WeaponSpec[]
  readonly onDeath?: readonly DeathEffectSpec[]
  readonly kbImmune?: boolean
}

export const ZOMBIE: EnemySpec = {
  kind: 'zombie',
  locomotion: { kind: 'chase' },
  emoji: '🧟',
  name: '僵尸',
  desc: '缓慢但成群，最基础的追击者',
  size: 1.35,
  radius: 0.5,
  hp: 60,
  speed: 1.375,
  damage: 8,
  xp: 3,
  coins: 2,
}

export const GHOST: EnemySpec = {
  kind: 'ghost',
  locomotion: { kind: 'chase' },
  emoji: '👻',
  name: '幽灵',
  desc: '飘得很快的追击者，血薄',
  size: 1.2,
  radius: 0.45,
  hp: 25,
  speed: 2.875,
  damage: 5,
  xp: 2,
  coins: 2,
}

/** 游荡射手：不索敌，慢速乱逛，周期性朝自己移动方向放一发慢弹（弹幕污染走位空间） */
export const INVADER: EnemySpec = {
  kind: 'invader',
  locomotion: { kind: 'wander' },
  emoji: '👾',
  name: '外星怪',
  desc: '不追人，游荡途中朝前方吐慢速弹',
  size: 1.25,
  radius: 0.48,
  hp: 40,
  speed: 0.9,
  damage: 6,
  xp: 4,
  coins: 3,
  weapons: [
    {
      kind: 'projectile',
      name: '慢速弹',
      icon: '🔴',
      damage: 6,
      cooldownMs: 2800,
      knockback: 0,
      aim: 'move',
      lifeMs: 4500,
      projectile: { emoji: '🔴', size: 0.4, radius: 0.14, speed: 3, rotationOffsetRad: 0 },
    },
  ],
}

/** 突刺怪：探测圈内锁定蓄力方向 → 短延迟 → 直线冲刺一段距离（横向位移可躲） */
export const BOAR: EnemySpec = {
  kind: 'boar',
  emoji: '🐗',
  name: '野猪',
  desc: '发现猎物后蓄力直线突刺，横向可躲',
  size: 1.4,
  radius: 0.52,
  hp: 80,
  speed: 1.1,
  damage: 10,
  xp: 5,
  coins: 3,
  locomotion: {
    kind: 'dash',
    detectRange: 4,
    windupMs: 550,
    dashSpeed: 8,
    dashDist: 3.5,
    cooldownMs: 1800,
    idle: 'wander',
    aim: 'nearest',
    lockAt: 'windup',
  },
}

/** 逃跑射手：见人就拉开距离，周期性朝人吐慢速毒弹（制造追不追的抉择） */
export const SNAKE: EnemySpec = {
  kind: 'snake',
  emoji: '🐍',
  name: '毒蛇',
  desc: '见人就溜，边逃边回头吐毒弹',
  size: 1.25,
  radius: 0.45,
  hp: 35,
  speed: 2.4,
  damage: 5,
  xp: 4,
  coins: 3,
  locomotion: { kind: 'flee', range: 5 },
  weapons: [
    {
      kind: 'projectile',
      name: '毒弹',
      icon: '🟢',
      damage: 5,
      cooldownMs: 2600,
      knockback: 0,
      // 沿用攻击积木的「任意距离都开火」：覆写索敌上限到远超全图对角
      range: 99,
      lifeMs: 4500,
      projectile: { emoji: '🟢', size: 0.4, radius: 0.14, speed: 3.2, rotationOffsetRad: 0 },
    },
  ],
}

/** 毒爆怪：慢速近战，死亡原地留毒液池（别在自己的风筝路线上打爆它） */
export const MUSHROOM: EnemySpec = {
  kind: 'mushroom',
  locomotion: { kind: 'chase' },
  emoji: '🍄',
  name: '毒蘑菇',
  desc: '死亡时在原地留下一片毒液',
  size: 1.25,
  radius: 0.46,
  hp: 50,
  speed: 1,
  damage: 6,
  xp: 4,
  coins: 3,
  onDeath: [{ kind: 'poison', radius: 1.6, durationMs: 3000, tickMs: 500, damage: 4 }],
}

/** 偷金币鼠：不理玩家，直奔地上最近的金币吃掉；击杀吐回吃掉的 + 1 枚利息 */
export const RAT: EnemySpec = {
  kind: 'rat',
  locomotion: { kind: 'coinThief' },
  emoji: '🐀',
  name: '偷币鼠',
  desc: '专偷地上的金币，击杀可全额讨回并有利息',
  size: 1.05,
  radius: 0.4,
  hp: 30,
  speed: 3.2,
  damage: 3,
  xp: 3,
  coins: 2,
}

export const BLOBLING: EnemySpec = {
  kind: 'blobling',
  locomotion: { kind: 'chase' },
  emoji: '🫧',
  name: '小泡泡',
  desc: '泡泡分裂出的迷你体，快而脆',
  size: 0.75,
  radius: 0.28,
  hp: 18,
  speed: 2.6,
  damage: 4,
  xp: 1,
  coins: 0,
}

/** 分裂怪：死亡分裂成 2 只更小更快的迷你泡泡 */
export const BLOB: EnemySpec = {
  kind: 'blob',
  locomotion: { kind: 'chase' },
  emoji: '🫧',
  name: '泡泡',
  desc: '被击破时分裂成两只小泡泡',
  size: 1.55,
  radius: 0.55,
  hp: 70,
  speed: 1.2,
  damage: 6,
  xp: 4,
  coins: 3,
  onDeath: [{ kind: 'split', into: BLOBLING, count: 2 }],
}

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
// 权重随波次线性微调，zombie 有下限兜底（见 本文件 enemyMixAt）
export const ENEMY_MIX = [
  { kind: 'zombie', sinceWave: 1, base: 80, perWave: -2, min: 40, max: 80 },
  { kind: 'ghost', sinceWave: 1, base: 15, perWave: 1, min: 15, max: 32 },
  { kind: 'invader', sinceWave: 2, base: 8, perWave: 0.3, min: 0, max: 12 },
  { kind: 'boar', sinceWave: 3, base: 8, perWave: 0.4, min: 0, max: 16 },
  { kind: 'snake', sinceWave: 4, base: 7, perWave: 0.3, min: 0, max: 10 },
  { kind: 'mushroom', sinceWave: 4, base: 7, perWave: 0.4, min: 0, max: 14 },
  { kind: 'rat', sinceWave: 5, base: 5, perWave: 0.3, min: 0, max: 10 },
  { kind: 'blob', sinceWave: 5, base: 7, perWave: 0.4, min: 0, max: 14 },
] as const

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
export const BOSS: EnemySpec = {
  kind: 'boss',
  emoji: '👹',
  name: '赤鬼',
  desc: '终波头目：环形弹幕与蓄力突刺，击退免疫',
  size: 3.2,
  radius: 1.05,
  hp: 6000,
  speed: 1.4,
  damage: 20,
  xp: 60,
  coins: 60,
  kbImmune: true,
  locomotion: {
    kind: 'dash',
    intervalMs: 5600,
    windupMs: 750,
    dashSpeed: 8,
    durationMs: 450,
    idle: 'chase',
    aim: 'teamCenter',
    lockAt: 'launch',
    firstDelayMs: 3600,
    sfx: 'whoosh',
  },
  weapons: [
    {
      kind: 'projectile',
      name: '环形弹幕',
      icon: '🟣',
      damage: 8,
      cooldownMs: 2800,
      knockback: 0,
      firstDelayMs: 1800,
      lifeMs: 6000,
      fireSfx: 'boom',
      volley: { count: 12, spreadRad: Math.PI * 2, randomRotate: true },
      projectile: { emoji: '🟣', size: 0.45, radius: 0.16, speed: 2.4, rotationOffsetRad: 0 },
    },
  ],
}

/** 终波常规刷怪减压倍率（间隔 ×N）：把火力焦点留给 Boss */
export const BOSS_SPAWN_RELIEF = 2

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
