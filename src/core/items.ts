import type { CharacterSpec } from './config'
import type { WeaponSpec } from './weapons'

// 道具 = 一组属性修正（可带负面副作用，数值上保证净增益）。
// 只开放少量通用属性轴，不逐武器参数开洞；乘法轴叠乘、加法轴叠加。
// 池归属用 tag：'all' 进所有角色池，武器 kind 进对应角色池（按配装自动推导），'team' 进队长池。

export interface CharacterEffects {
  hpAdd: number
  damageMul: number
  /** 冷却倍率，<1 攻速更快 */
  cooldownMul: number
  /** 武器空间参数（触及/半径/射程/爆炸半径等）统一倍率 */
  rangeMul: number
  projSpeedMul: number
  iframesAddMs: number
  reviveAddMs: number
}

export interface TeamEffects {
  moveSpeedMul: number
  magnetMul: number
  /** 敌人掉落双倍金币的概率（加法叠加，封顶 0.9） */
  doubleCoinChance: number
  teamDamageMul: number
}

export type ItemPool = 'all' | 'team' | WeaponSpec['kind']

export interface ItemSpec {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly price: number
  /** 单一持有者的购买上限；缺省无限堆叠 */
  readonly maxStacks?: number
  readonly pool: ItemPool
  readonly effects: Partial<CharacterEffects & TeamEffects>
}

export const ITEMS = {
  // ── 通用池 ──
  gemHeart: {
    emoji: '❤️',
    name: '生命宝石',
    desc: '生命上限 +25',
    price: 15,
    pool: 'all',
    effects: { hpAdd: 25 },
  },
  shellArmor: {
    emoji: '🛡️',
    name: '硬壳护甲',
    desc: '生命上限 +60 · 攻速 -10%',
    price: 20,
    maxStacks: 3,
    pool: 'all',
    effects: { hpAdd: 60, cooldownMul: 1.1 },
  },
  stimulant: {
    emoji: '⚡',
    name: '兴奋剂',
    desc: '攻速 +15% · 生命上限 -10',
    price: 25,
    maxStacks: 5,
    pool: 'all',
    effects: { cooldownMul: 0.87, hpAdd: -10 },
  },
  whetstone: {
    emoji: '🗡️',
    name: '磨刀石',
    desc: '伤害 +12%',
    price: 25,
    pool: 'all',
    effects: { damageMul: 1.12 },
  },
  rageBracer: {
    emoji: '💪',
    name: '狂暴护腕',
    desc: '伤害 +25% · 生命上限 -20',
    price: 30,
    maxStacks: 3,
    pool: 'all',
    effects: { damageMul: 1.25, hpAdd: -20 },
  },
  padHelmet: {
    emoji: '⛑️',
    name: '缓冲头盔',
    desc: '受击无敌 +0.15 秒',
    price: 18,
    maxStacks: 3,
    pool: 'all',
    effects: { iframesAddMs: 150 },
  },
  reviveWatch: {
    emoji: '⏱️',
    name: '复活怀表',
    desc: '复活时间 -2 秒',
    price: 22,
    maxStacks: 3,
    pool: 'all',
    effects: { reviveAddMs: -2000 },
  },
  // ── 武器形态专属池 ──
  blastPowder: {
    emoji: '💥',
    name: '扩爆火药',
    desc: '轰炸范围 +20%',
    price: 25,
    maxStacks: 3,
    pool: 'areaBlast',
    effects: { rangeMul: 1.2 },
  },
  scope: {
    emoji: '🎯',
    name: '瞄准镜',
    desc: '弹速 +25%',
    price: 20,
    maxStacks: 2,
    pool: 'projectile',
    effects: { projSpeedMul: 1.25 },
  },
  powerCell: {
    emoji: '🔋',
    name: '高能电池',
    desc: '激光范围 +20%',
    price: 22,
    maxStacks: 3,
    pool: 'laser',
    effects: { rangeMul: 1.2 },
  },
  longHaft: {
    emoji: '🌪️',
    name: '长柄套件',
    desc: '横扫范围 +15% · 攻速 -5%',
    price: 22,
    maxStacks: 3,
    pool: 'sweep',
    effects: { rangeMul: 1.15, cooldownMul: 1.05 },
  },
  lance: {
    emoji: '🦯',
    name: '加长枪杆',
    desc: '突刺范围 +20%',
    price: 20,
    maxStacks: 3,
    pool: 'thrust',
    effects: { rangeMul: 1.2 },
  },
  returnString: {
    emoji: '🧵',
    name: '回力丝线',
    desc: '回旋镖范围 +20%',
    price: 20,
    maxStacks: 3,
    pool: 'boomerang',
    effects: { rangeMul: 1.2 },
  },
  frostCore: {
    emoji: '🧊',
    name: '深寒结晶',
    desc: '光环范围 +20%',
    price: 24,
    maxStacks: 3,
    pool: 'slowAura',
    effects: { rangeMul: 1.2 },
  },
  // ── 队长池（团队道具） ──
  marchFlag: {
    emoji: '👟',
    name: '疾行军旗',
    desc: '全队移速 +8%',
    price: 30,
    maxStacks: 3,
    pool: 'team',
    effects: { moveSpeedMul: 1.08 },
  },
  magnetCoil: {
    emoji: '🧲',
    name: '磁力线圈',
    desc: '金币拾取范围 +25%',
    price: 20,
    pool: 'team',
    effects: { magnetMul: 1.25 },
  },
  luckyCoin: {
    emoji: '💰',
    name: '幸运硬币',
    desc: '15% 概率掉落双倍金币',
    price: 35,
    maxStacks: 5,
    pool: 'team',
    effects: { doubleCoinChance: 0.15 },
  },
  heavyArms: {
    emoji: '🏋️',
    name: '沉重军备',
    desc: '全队伤害 +10% · 移速 -5%',
    price: 30,
    maxStacks: 2,
    pool: 'team',
    effects: { teamDamageMul: 1.1, moveSpeedMul: 0.95 },
  },
} as const satisfies Record<string, ItemSpec>

export type ItemId = keyof typeof ITEMS
export const ITEM_IDS = Object.keys(ITEMS) as readonly ItemId[]

// ── 池推导 ──────────────────────────────────────────────────

/** 角色池 = 通用道具 + 与其武器形态匹配的专属道具（从配装自动推导） */
export function characterPool(spec: CharacterSpec): ItemId[] {
  const kinds = new Set<string>(spec.weapons.map((w) => w.kind))
  return ITEM_IDS.filter((id) => {
    const pool = ITEMS[id].pool
    return pool === 'all' || kinds.has(pool)
  })
}

export function captainPool(): ItemId[] {
  return ITEM_IDS.filter((id) => ITEMS[id].pool === 'team')
}

// ── 持有与购买 ──────────────────────────────────────────────

export function stackCount(owned: readonly ItemId[], id: ItemId): number {
  return owned.filter((x) => x === id).length
}

export function reachedStackLimit(owned: readonly ItemId[], id: ItemId): boolean {
  const spec: ItemSpec = ITEMS[id]
  return spec.maxStacks !== undefined && stackCount(owned, id) >= spec.maxStacks
}

/** 从池中随机上架一件未达上限的道具；全部达上限返回 null */
export function rollItem(
  pool: readonly ItemId[],
  owned: readonly ItemId[],
  rand: () => number,
): ItemId | null {
  const avail = pool.filter((id) => !reachedStackLimit(owned, id))
  if (avail.length === 0) return null
  return avail[Math.min(avail.length - 1, Math.floor(rand() * avail.length))]!
}

// ── 效果叠加 ────────────────────────────────────────────────

export function aggregateCharacterEffects(owned: readonly ItemId[]): CharacterEffects {
  const fx: CharacterEffects = {
    hpAdd: 0,
    damageMul: 1,
    cooldownMul: 1,
    rangeMul: 1,
    projSpeedMul: 1,
    iframesAddMs: 0,
    reviveAddMs: 0,
  }
  for (const id of owned) {
    const e = ITEMS[id].effects as Partial<CharacterEffects>
    fx.hpAdd += e.hpAdd ?? 0
    fx.damageMul *= e.damageMul ?? 1
    fx.cooldownMul *= e.cooldownMul ?? 1
    fx.rangeMul *= e.rangeMul ?? 1
    fx.projSpeedMul *= e.projSpeedMul ?? 1
    fx.iframesAddMs += e.iframesAddMs ?? 0
    fx.reviveAddMs += e.reviveAddMs ?? 0
  }
  return fx
}

export function aggregateTeamEffects(owned: readonly ItemId[]): TeamEffects {
  const fx: TeamEffects = { moveSpeedMul: 1, magnetMul: 1, doubleCoinChance: 0, teamDamageMul: 1 }
  for (const id of owned) {
    const e = ITEMS[id].effects as Partial<TeamEffects>
    fx.moveSpeedMul *= e.moveSpeedMul ?? 1
    fx.magnetMul *= e.magnetMul ?? 1
    fx.doubleCoinChance += e.doubleCoinChance ?? 0
    fx.teamDamageMul *= e.teamDamageMul ?? 1
  }
  fx.doubleCoinChance = Math.min(0.9, fx.doubleCoinChance)
  return fx
}

// ── 武器参数修正 ────────────────────────────────────────────

/** 按修正预算出「生效 spec」：只缩放空间参数与弹速；
 * 伤害/冷却由运行时 ctx 倍率处理（避免双重生效） */
export function resolveWeaponSpec(w: WeaponSpec, fx: CharacterEffects): WeaponSpec {
  const r = fx.rangeMul
  switch (w.kind) {
    case 'thrust':
      return { ...w, reach: w.reach * r, hitRadius: w.hitRadius * r, lungeDist: w.lungeDist * r }
    case 'projectile':
      return { ...w, projectile: { ...w.projectile, speed: w.projectile.speed * fx.projSpeedMul } }
    case 'sweep':
      return { ...w, radius: w.radius * r }
    case 'areaBlast':
      return { ...w, detectRange: w.detectRange * r, blastRadius: w.blastRadius * r }
    case 'boomerang':
      return { ...w, range: w.range * r, hitRadius: w.hitRadius * r, returnSpeed: w.returnSpeed * r }
    case 'laser':
      return { ...w, range: w.range * r, beamRadius: w.beamRadius * r }
    case 'slowAura':
      return { ...w, radius: w.radius * r }
  }
}
