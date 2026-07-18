import { UNIT } from '../lib/units'
import { ABILITIES } from './abilities'
import type { AbilityTiers } from './abilities'
import type { CharacterId, CharacterSpec } from '../characters/registry'
import type { WeaponSpec } from '../weapons/spec'

// 道具 = 一组属性修正（可带负面副作用，数值上保证净增益）。
// 只开放少量通用属性轴，不逐武器参数开洞；乘法轴叠乘、加法轴叠加。
// 池归属用 tag：'all' 进所有角色池，武器 kind 进对应角色池（按配装自动推导），
// 'team' 进队长池，'ability' 为角色专属能力卡（只进 forCharacter 的池）。
// 稀有度三档：越稀有越贵（价格档严格递增，金币后期才买得起大件），
// 上架时先按波次权重抽稀有度档、再在档内均匀抽取——前期以普通为主，史诗第 5 波起解锁。
// 能力卡是角色质变的唯一来源：一阶卡要求先给该角色买过几张普通道具
//（ABILITY_GATE），二阶卡要求已持有一阶卡——升阶节奏由此涌现。

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
  /** 存活时每秒回复生命（加法叠加） */
  regenPerSec: number
  /** 敌人接触到本角色时受到的反伤（加法叠加；仅接触，不含敌弹） */
  thorns: number
  /** 本角色击杀敌人时回复生命（加法叠加） */
  killHeal: number
  /** 武器伤害暴击概率（加法叠加，封顶 0.5），暴击 = 伤害 ×CRIT_MUL */
  critChance: number
  /** 武器击退倍率（乘法叠乘） */
  knockbackMul: number
}

export interface TeamEffects {
  moveSpeedMul: number
  magnetMul: number
  /** 敌人掉落双倍金币的概率（加法叠加，封顶 0.9） */
  doubleCoinChance: number
  teamDamageMul: number
  /** 全队经验倍率（乘法叠乘，与队长能力相乘） */
  xpGainMul: number
  /** 全体敌人移速倍率（乘法叠乘，保底 0.6），<1 更慢 */
  enemySlowMul: number
  /** 波末全队回复生命上限的比例（加法叠加，封顶 0.6） */
  waveHealRatio: number
  /** 波末额外金币（加法叠加） */
  waveCoins: number
}

/** 暴击伤害倍率 */
export const CRIT_MUL = 2

export type ItemRarity = 'common' | 'rare' | 'epic'
export const RARITY_ORDER: readonly ItemRarity[] = ['common', 'rare', 'epic']
export const RARITIES: Record<ItemRarity, { label: string; color: string }> = {
  common: { label: '普通', color: '#c8c8d4' },
  rare: { label: '稀有', color: '#4fc3f7' },
  epic: { label: '史诗', color: '#ce93d8' },
}

/** 上架稀有度权重：随波次向稀有倾斜；史诗第 5 波起解锁，两档各有封顶 */
export function rarityWeights(wave: number): Record<ItemRarity, number> {
  const rare = Math.min(0.3, 0.06 + 0.02 * wave)
  const epic = wave < 5 ? 0 : Math.min(0.2, 0.025 * (wave - 4))
  return { common: 1 - rare - epic, rare, epic }
}

export type ItemPool = 'all' | 'team' | 'ability' | WeaponSpec['kind']

export interface ItemSpec {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly rarity: ItemRarity
  readonly price: number
  /** 单一持有者的购买上限；缺省无限堆叠 */
  readonly maxStacks?: number
  readonly pool: ItemPool
  /** 能力卡专属：归属角色 + 档位（0 一阶 / 1 二阶） */
  readonly forCharacter?: CharacterId
  readonly abilityIndex?: 0 | 1
  readonly effects: Partial<CharacterEffects & TeamEffects>
}

/** 能力卡解锁门槛：一阶卡上架前该角色需已购的普通道具数 */
export const ABILITY_GATE = { normalsForFirst: 2 } as const

/** 角色专属能力卡条目（文案/图标复用 core/abilities.ts 的能力定义） */
function abilityCard(cid: CharacterId, index: 0 | 1, price: number): ItemSpec {
  const a = ABILITIES[cid][index]
  return {
    emoji: a.icon,
    name: a.name,
    desc: a.desc,
    rarity: index === 0 ? 'rare' : 'epic',
    price,
    maxStacks: 1,
    pool: 'ability',
    forCharacter: cid,
    abilityIndex: index,
    effects: {},
  }
}

export const ITEMS = {
  // ── 通用池 · 普通（15~35）──
  gemHeart: {
    emoji: '❤️',
    name: '生命宝石',
    desc: '生命上限 +25',
    rarity: 'common',
    price: 15,
    pool: 'all',
    effects: { hpAdd: 25 },
  },
  shellArmor: {
    emoji: '🛡️',
    name: '硬壳护甲',
    desc: '生命上限 +60 · 攻速 -10%',
    rarity: 'common',
    price: 20,
    maxStacks: 3,
    pool: 'all',
    effects: { hpAdd: 60, cooldownMul: 1.1 },
  },
  stimulant: {
    emoji: '⚡',
    name: '兴奋剂',
    desc: '攻速 +15% · 生命上限 -10',
    rarity: 'common',
    price: 25,
    maxStacks: 5,
    pool: 'all',
    effects: { cooldownMul: 0.87, hpAdd: -10 },
  },
  whetstone: {
    emoji: '🗡️',
    name: '磨刀石',
    desc: '伤害 +12%',
    rarity: 'common',
    price: 25,
    pool: 'all',
    effects: { damageMul: 1.12 },
  },
  rageBracer: {
    emoji: '💪',
    name: '狂暴护腕',
    desc: '伤害 +25% · 生命上限 -20',
    rarity: 'common',
    price: 30,
    maxStacks: 3,
    pool: 'all',
    effects: { damageMul: 1.25, hpAdd: -20 },
  },
  padHelmet: {
    emoji: '⛑️',
    name: '缓冲头盔',
    desc: '受击无敌 +0.15 秒',
    rarity: 'common',
    price: 18,
    maxStacks: 3,
    pool: 'all',
    effects: { iframesAddMs: 150 },
  },
  reviveWatch: {
    emoji: '⏱️',
    name: '复活怀表',
    desc: '复活时间 -2 秒',
    rarity: 'common',
    price: 22,
    maxStacks: 3,
    pool: 'all',
    effects: { reviveAddMs: -2000 },
  },
  // ── 通用池 · 稀有（40~55）──
  regenRing: {
    emoji: '💍',
    name: '再生戒指',
    desc: '每秒回复 2 生命',
    rarity: 'rare',
    price: 45,
    maxStacks: 3,
    pool: 'all',
    effects: { regenPerSec: 2 },
  },
  thornVest: {
    emoji: '🌵',
    name: '荆棘背心',
    desc: '敌人接触时受到 14 反伤',
    rarity: 'rare',
    price: 45,
    maxStacks: 3,
    pool: 'all',
    effects: { thorns: 14 },
  },
  vampFang: {
    emoji: '🧛',
    name: '吸血獠牙',
    desc: '击杀敌人回复 3 生命',
    rarity: 'rare',
    price: 50,
    maxStacks: 2,
    pool: 'all',
    effects: { killHeal: 3 },
  },
  hammerWeight: {
    emoji: '🔨',
    name: '重锤配重',
    desc: '武器击退 +35%',
    rarity: 'rare',
    price: 40,
    maxStacks: 2,
    pool: 'all',
    effects: { knockbackMul: 1.35 },
  },
  // ── 通用池 · 史诗（90~130）──
  fateDice: {
    emoji: '🎲',
    name: '命运骰子',
    desc: '20% 概率暴击，伤害翻倍',
    rarity: 'epic',
    price: 95,
    maxStacks: 2,
    pool: 'all',
    effects: { critChance: 0.2 },
  },
  giantHeart: {
    emoji: '🫀',
    name: '巨人心脏',
    desc: '生命上限 +150',
    rarity: 'epic',
    price: 90,
    maxStacks: 2,
    pool: 'all',
    effects: { hpAdd: 150 },
  },
  phaseCloak: {
    emoji: '🌫️',
    name: '相位披风',
    desc: '受击无敌 +0.4 秒',
    rarity: 'epic',
    price: 100,
    maxStacks: 2,
    pool: 'all',
    effects: { iframesAddMs: 400 },
  },
  // ── 武器形态专属池（普通） ──
  blastPowder: {
    emoji: '💥',
    name: '扩爆火药',
    desc: '轰炸范围 +20%',
    rarity: 'common',
    price: 25,
    maxStacks: 3,
    pool: 'areaBlast',
    effects: { rangeMul: 1.2 },
  },
  scope: {
    emoji: '🎯',
    name: '瞄准镜',
    desc: '弹速 +25%',
    rarity: 'common',
    price: 20,
    maxStacks: 2,
    pool: 'projectile',
    effects: { projSpeedMul: 1.25 },
  },
  powerCell: {
    emoji: '🔋',
    name: '高能电池',
    desc: '激光范围 +20%',
    rarity: 'common',
    price: 22,
    maxStacks: 3,
    pool: 'laser',
    effects: { rangeMul: 1.2 },
  },
  longHaft: {
    emoji: '🌪️',
    name: '长柄套件',
    desc: '横扫范围 +15% · 攻速 -5%',
    rarity: 'common',
    price: 22,
    maxStacks: 3,
    pool: 'sweep',
    effects: { rangeMul: 1.15, cooldownMul: 1.05 },
  },
  lance: {
    emoji: '🦯',
    name: '加长枪杆',
    desc: '突刺范围 +20%',
    rarity: 'common',
    price: 20,
    maxStacks: 3,
    pool: 'thrust',
    effects: { rangeMul: 1.2 },
  },
  returnString: {
    emoji: '🧵',
    name: '回力丝线',
    desc: '回旋镖范围 +20%',
    rarity: 'common',
    price: 20,
    maxStacks: 3,
    pool: 'boomerang',
    effects: { rangeMul: 1.2 },
  },
  frostCore: {
    emoji: '🧊',
    name: '深寒结晶',
    desc: '光环范围 +20%',
    rarity: 'common',
    price: 24,
    maxStacks: 3,
    pool: 'slowAura',
    effects: { rangeMul: 1.2 },
  },
  // ── 队长池 · 普通 ──
  marchFlag: {
    emoji: '👟',
    name: '疾行军旗',
    desc: '全队移速 +8%',
    rarity: 'common',
    price: 30,
    maxStacks: 3,
    pool: 'team',
    effects: { moveSpeedMul: 1.08 },
  },
  magnetCoil: {
    emoji: '🧲',
    name: '磁力线圈',
    desc: '金币拾取范围 +25%',
    rarity: 'common',
    price: 20,
    pool: 'team',
    effects: { magnetMul: 1.25 },
  },
  luckyCoin: {
    emoji: '💰',
    name: '幸运硬币',
    desc: '15% 概率掉落双倍金币',
    rarity: 'common',
    price: 35,
    maxStacks: 5,
    pool: 'team',
    effects: { doubleCoinChance: 0.15 },
  },
  heavyArms: {
    emoji: '🏋️',
    name: '沉重军备',
    desc: '全队伤害 +10% · 移速 -5%',
    rarity: 'common',
    price: 30,
    maxStacks: 2,
    pool: 'team',
    effects: { teamDamageMul: 1.1, moveSpeedMul: 0.95 },
  },
  // ── 队长池 · 稀有 ──
  clover: {
    emoji: '🍀',
    name: '幸运四叶草',
    desc: '全队经验 +15%',
    rarity: 'rare',
    price: 55,
    maxStacks: 2,
    pool: 'team',
    effects: { xpGainMul: 1.15 },
  },
  fieldKitchen: {
    emoji: '🥘',
    name: '战地大锅',
    desc: '每波结束全队回复 25% 生命上限',
    rarity: 'rare',
    price: 50,
    maxStacks: 2,
    pool: 'team',
    effects: { waveHealRatio: 0.25 },
  },
  warBond: {
    emoji: '🏦',
    name: '战争债券',
    desc: '每波结束额外 +10 金币',
    rarity: 'rare',
    price: 45,
    maxStacks: 3,
    pool: 'team',
    effects: { waveCoins: 10 },
  },
  // ── 队长池 · 史诗 ──
  timeSand: {
    emoji: '⏳',
    name: '时之沙',
    desc: '全体敌人移速 -12%',
    rarity: 'epic',
    price: 120,
    maxStacks: 2,
    pool: 'team',
    effects: { enemySlowMul: 0.88 },
  },
  legionBanner: {
    emoji: '🚩',
    name: '军团战旗',
    desc: '全队伤害 +20%',
    rarity: 'epic',
    price: 130,
    maxStacks: 2,
    pool: 'team',
    effects: { teamDamageMul: 1.2 },
  },
  // ── 角色专属能力卡（一阶 稀有 / 二阶 史诗；价格高一档，质变值这个价）──
  abilityJuggler1: abilityCard('juggler', 0, 80),
  abilityJuggler2: abilityCard('juggler', 1, 150),
  abilityUnicorn1: abilityCard('unicorn', 0, 80),
  abilityUnicorn2: abilityCard('unicorn', 1, 150),
  abilityTroll1: abilityCard('troll', 0, 80),
  abilityTroll2: abilityCard('troll', 1, 150),
  abilityCowboy1: abilityCard('cowboy', 0, 80),
  abilityCowboy2: abilityCard('cowboy', 1, 150),
  abilityMage1: abilityCard('mage', 0, 80),
  abilityMage2: abilityCard('mage', 1, 150),
  abilityKangaroo1: abilityCard('kangaroo', 0, 80),
  abilityKangaroo2: abilityCard('kangaroo', 1, 150),
  abilityRobot1: abilityCard('robot', 0, 80),
  abilityRobot2: abilityCard('robot', 1, 150),
  abilitySnowman1: abilityCard('snowman', 0, 80),
  abilitySnowman2: abilityCard('snowman', 1, 150),
  abilityFairy1: abilityCard('fairy', 0, 80),
  abilityFairy2: abilityCard('fairy', 1, 150),
  abilityAssassin1: abilityCard('assassin', 0, 80),
  abilityAssassin2: abilityCard('assassin', 1, 150),
  abilityBeaver1: abilityCard('beaver', 0, 80),
  abilityBeaver2: abilityCard('beaver', 1, 150),
  abilityQueenBee1: abilityCard('queenBee', 0, 80),
  abilityQueenBee2: abilityCard('queenBee', 1, 150),
  abilityMedic1: abilityCard('medic', 0, 80),
  abilityMedic2: abilityCard('medic', 1, 150),
  abilityJellyfish1: abilityCard('jellyfish', 0, 80),
  abilityJellyfish2: abilityCard('jellyfish', 1, 150),
} as const satisfies Record<string, ItemSpec>

export type ItemId = keyof typeof ITEMS
export const ITEM_IDS = Object.keys(ITEMS) as readonly ItemId[]

// ── 池推导 ──────────────────────────────────────────────────

/** 角色池 = 通用道具 + 与其武器形态匹配的形态道具 + 自己的两张能力卡 */
export function characterPool(id: CharacterId, spec: CharacterSpec): ItemId[] {
  const kinds = new Set<string>(spec.weapons.map((w) => w.kind))
  return ITEM_IDS.filter((iid) => {
    const item: ItemSpec = ITEMS[iid]
    if (item.pool === 'ability') return item.forCharacter === id
    return item.pool === 'all' || kinds.has(item.pool)
  })
}

/** 已购道具推导的能力档位（一二阶各最多一张，二阶依赖一阶） */
export function abilityTiers(id: CharacterId, owned: readonly ItemId[]): AbilityTiers {
  const has = (index: 0 | 1): boolean =>
    owned.some((iid) => {
      const item: ItemSpec = ITEMS[iid]
      return item.pool === 'ability' && item.forCharacter === id && item.abilityIndex === index
    })
  return { a1: has(0), a2: has(1) }
}

/** 能力卡的上架资格：一阶要求已购普通道具达标，二阶要求已持有一阶 */
export function abilityCardAvailable(id: ItemId, owned: readonly ItemId[]): boolean {
  const item: ItemSpec = ITEMS[id]
  if (item.pool !== 'ability' || item.forCharacter === undefined) return true
  if (item.abilityIndex === 1) return abilityTiers(item.forCharacter, owned).a1
  const normals = owned.filter((iid) => (ITEMS[iid] as ItemSpec).pool !== 'ability').length
  return normals >= ABILITY_GATE.normalsForFirst
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

/** 从池中随机上架一件未达上限的道具；全部达上限返回 null。
 * 两段式抽取：先按波次权重在「有货的稀有度档」间抽签（无货/零权重档的权重
 * 自然归拢到其余档），再在档内均匀抽取 */
export function rollItem(
  pool: readonly ItemId[],
  owned: readonly ItemId[],
  rand: () => number,
  wave = 1,
): ItemId | null {
  const avail = pool.filter((id) => !reachedStackLimit(owned, id) && abilityCardAvailable(id, owned))
  if (avail.length === 0) return null
  const weights = rarityWeights(wave)
  const buckets = RARITY_ORDER.map((r) => ({
    items: avail.filter((id) => ITEMS[id].rarity === r),
    w: weights[r],
  })).filter((b) => b.items.length > 0 && b.w > 0)
  let pickList: readonly ItemId[] = avail
  const totalW = buckets.reduce((s, b) => s + b.w, 0)
  if (totalW > 0) {
    let t = rand() * totalW
    let chosen = buckets[buckets.length - 1]!
    for (const b of buckets) {
      if (t < b.w) {
        chosen = b
        break
      }
      t -= b.w
    }
    pickList = chosen.items
  }
  return pickList[Math.min(pickList.length - 1, Math.floor(rand() * pickList.length))]!
}

/** 商店价格通胀：随波次上浮（金币掉落同步在涨，后期大件才有分量）。
 * 展示与扣款都走 itemPrice，ITEMS.price 是第 1 波基准价 */
export const PRICE = { perWave: 0.06 } as const

export function itemPrice(id: ItemId, wave: number): number {
  return Math.round(ITEMS[id].price * (1 + PRICE.perWave * Math.max(0, wave - 1)))
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
    regenPerSec: 0,
    thorns: 0,
    killHeal: 0,
    critChance: 0,
    knockbackMul: 1,
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
    fx.regenPerSec += e.regenPerSec ?? 0
    fx.thorns += e.thorns ?? 0
    fx.killHeal += e.killHeal ?? 0
    fx.critChance += e.critChance ?? 0
    fx.knockbackMul *= e.knockbackMul ?? 1
  }
  fx.critChance = Math.min(0.5, fx.critChance)
  return fx
}

export function aggregateTeamEffects(owned: readonly ItemId[]): TeamEffects {
  const fx: TeamEffects = {
    moveSpeedMul: 1,
    magnetMul: 1,
    doubleCoinChance: 0,
    teamDamageMul: 1,
    xpGainMul: 1,
    enemySlowMul: 1,
    waveHealRatio: 0,
    waveCoins: 0,
  }
  for (const id of owned) {
    const e = ITEMS[id].effects as Partial<TeamEffects>
    fx.moveSpeedMul *= e.moveSpeedMul ?? 1
    fx.magnetMul *= e.magnetMul ?? 1
    fx.doubleCoinChance += e.doubleCoinChance ?? 0
    fx.teamDamageMul *= e.teamDamageMul ?? 1
    fx.xpGainMul *= e.xpGainMul ?? 1
    fx.enemySlowMul *= e.enemySlowMul ?? 1
    fx.waveHealRatio += e.waveHealRatio ?? 0
    fx.waveCoins += e.waveCoins ?? 0
  }
  fx.doubleCoinChance = Math.min(0.9, fx.doubleCoinChance)
  fx.enemySlowMul = Math.max(0.6, fx.enemySlowMul)
  fx.waveHealRatio = Math.min(0.6, fx.waveHealRatio)
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
    case 'assassinate':
      return { ...w, range: w.range * r }
    case 'turret':
      return {
        ...w,
        range: w.range * r,
        projectile: { ...w.projectile, speed: w.projectile.speed * fx.projSpeedMul },
      }
    case 'summon':
      return { ...w, minion: { ...w.minion, speed: w.minion.speed * fx.projSpeedMul } }
    case 'heal':
      return { ...w, range: w.range * r }
    case 'chainArc':
      return { ...w, range: w.range * r, arcRange: w.arcRange * r }
  }
}

// 金币拾取是团队能力：磁吸与入账都以队伍中心为基点（拾取范围类道具挂队长）
export const COIN = {
  emoji: '🪙',
  size: 0.6 * UNIT,
  radius: 0.22 * UNIT,
  magnetRadius: 2.25 * UNIT,
  magnetSpeed: 8 * UNIT,
  collectRadius: 0.5 * UNIT,
} as const

// 商店：每个上架位可付费重新随机（队长可提供免费次数）
export const SHOP = { refreshPrice: 2 } as const
