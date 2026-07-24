import itemsJson from '../assets/items.json'
import economyJson from '../assets/economy.json'
import { loadoutFor } from '../characters/registry'
import type { UpgradeTiers, CharacterDef } from '../characters/registry'
import type { AbilityDef } from '../abilities/defs'

// 道具 = 一组属性修正（可带负面副作用，数值上保证净增益）。
// 只开放少量通用属性轴，不逐能力参数开洞；乘法轴叠乘、加法轴叠加。
// 池归属用 tag：'all' 进所有角色池，能力 kind 进对应角色池（按配装自动推导）。
// 稀有度三档：越稀有越贵（价格档严格递增，金币后期才买得起大件）。
// 角色质变不再花钱买升级卡：每张道具自带「角色经验值」（upgradeXp），为某角色
// 购买道具即累加它的专属经验，攒满档位自动免费升级（换整套能力 + 基础属性质变）。
// 每个角色等级是独立形态：拥有各自的道具池（characterPoolFor）与稀有度概率
//（rarityWeights 按等级抬升），越高级越能刷出高端货。

export interface CharacterEffects {
  hpAdd: number
  damageMul: number
  /** 冷却倍率，<1 攻速更快 */
  cooldownMul: number
  /** 能力空间参数（触及/半径/射程/爆炸半径等）统一倍率 */
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
  /** 能力伤害暴击概率（加法叠加，封顶 0.5），暴击 = 伤害 ×CRIT_MUL */
  critChance: number
  /** 能力击退倍率（乘法叠乘） */
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
  /** 全队冷却倍率（乘法叠乘，<1 攻速更快） */
  teamCooldownMul: number
  /** 全队暴击概率加成（加法，最终与角色暴击相加后封顶 0.5） */
  critAdd: number
  /** 全队生命上限倍率（乘法叠乘） */
  teamHpMul: number
  /** 全队复活时间倍率（乘法叠乘，<1 更快，保底 0.3） */
  reviveMul: number
  /** 队长技能冷却倍率（乘法叠乘，<1 更快，保底 0.3） */
  skillCdMul: number
  /** 商店价格倍率（乘法叠乘，<1 更便宜，保底 0.4） */
  shopDiscountMul: number
  /** 每次进店额外免费刷新次数（加法） */
  freeRerolls: number
  /** 升级抽卡每次额外候选数（加法，3 + draftSize 选 1） */
  draftSize: number
}

/** 团队效果的单位元（无卡时的默认值），也是叠加的起点 */
export const TEAM_FX_IDENTITY: TeamEffects = {
  moveSpeedMul: 1,
  magnetMul: 1,
  doubleCoinChance: 0,
  teamDamageMul: 1,
  xpGainMul: 1,
  enemySlowMul: 1,
  waveHealRatio: 0,
  waveCoins: 0,
  teamCooldownMul: 1,
  critAdd: 0,
  teamHpMul: 1,
  reviveMul: 1,
  skillCdMul: 1,
  shopDiscountMul: 1,
  freeRerolls: 0,
  draftSize: 0,
}

// 经济/暴击的「设计数值」形状：数据行在 defs/economy.ts（创作层），gen 校验产出 economy.json；
// 本文件只从中派生惯用导出 CRIT_MUL/PRICE/SHOP，形状与数值不变。
export interface Economy {
  /** 暴击伤害倍率 */
  readonly critMul: number
  /** 商店价格：基准价随波次通胀上浮 × 前期折扣（到 earlyFadeWaves 波线性消退） */
  readonly price: {
    readonly perWave: number
    readonly earlyDiscount: number
    readonly earlyFadeWaves: number
  }
  /** 商店上架位付费重随价格（队长可提供免费次数） */
  readonly shop: { readonly refreshPrice: number }
}

const ECON = economyJson as unknown as Economy

/** 暴击伤害倍率 */
export const CRIT_MUL = ECON.critMul

export type ItemRarity = 'common' | 'rare' | 'epic'
export const RARITY_ORDER: readonly ItemRarity[] = ['common', 'rare', 'epic']
export const RARITIES: Record<ItemRarity, { label: string; color: string }> = {
  common: { label: '普通', color: '#c8c8d4' },
  rare: { label: '稀有', color: '#4fc3f7' },
  epic: { label: '史诗', color: '#ce93d8' },
}

/** 上架稀有度权重：随波次向稀有倾斜 + 随「角色等级」独立抬升——每个等级形态一套
 * 独立概率，越高级越常刷出稀有/史诗（史诗常规第 5 波起解锁，但 2 级起角色即便早波
 * 也能刷出）。返回的是相对权重（rollItem 内部归一），无需严格和为 1 */
export function rarityWeights(wave: number, level = 1): Record<ItemRarity, number> {
  const lv = Math.max(0, level - 1)
  const rare = Math.min(0.5, 0.06 + 0.02 * wave + 0.14 * lv)
  const epicBase = wave < 5 ? 0 : Math.min(0.2, 0.025 * (wave - 4))
  const epic = Math.min(0.42, epicBase + 0.13 * lv + (lv > 0 ? 0.05 : 0))
  const common = Math.max(0.05, 1 - rare - epic)
  return { common, rare, epic }
}

export type ItemPool = 'all' | AbilityDef['kind']

export interface ItemDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly rarity: ItemRarity
  readonly price: number
  /** 单一持有者的购买上限；缺省无限堆叠 */
  readonly maxStacks?: number
  readonly pool: ItemPool
  /** 购买本卡给该角色累加的专属经验点（攒满档位自动质变升级） */
  readonly upgradeXp: number
  /** 最低可上架的角色等级（1/2/3，缺省 1）：高等级形态才解锁的高端货 */
  readonly minLevel?: 1 | 2 | 3
  readonly effects: Partial<CharacterEffects>
}

// 道具表：数据行在 defs/items.ts（创作层），npm run gen 生成 items.json
export type ItemId = keyof typeof itemsJson
export const ITEMS = itemsJson as unknown as Record<ItemId, ItemDef>

export const ITEM_IDS = Object.keys(ITEMS) as readonly ItemId[]

// ── 池推导（每个角色等级一套独立的池 + 概率）──────────────────

/** 某等级角色的道具池 = 通用道具 + 匹配该等级能力形态的形态道具，且满足最低等级门槛。
 * 升级 = 换了整套能力形态 + 解锁更高端的货架，故池随等级独立变化。 */
export function characterPoolFor(def: CharacterDef, level: number): ItemId[] {
  const tiers: UpgradeTiers = { u1: level >= 2, u2: level >= 3 }
  const kinds = new Set<string>(loadoutFor(def, tiers).map((w) => w.kind))
  return ITEM_IDS.filter((iid) => {
    const item: ItemDef = ITEMS[iid]
    if ((item.minLevel ?? 1) > level) return false
    return item.pool === 'all' || kinds.has(item.pool)
  })
}

// ── 持有与购买 ──────────────────────────────────────────────

export function stackCount(owned: readonly ItemId[], id: ItemId): number {
  return owned.filter((x) => x === id).length
}

/** 角色专属经验 = 该角色当前装备的全部道具的 upgradeXp 之和（与获得来源无关：
 * 商店购买 / 未来任何途径塞进 memberItems 的道具都计入）。等级由此纯函数推导 */
export function characterXp(owned: readonly ItemId[]): number {
  let xp = 0
  for (const id of owned) xp += ITEMS[id].upgradeXp
  return xp
}

export function reachedStackLimit(owned: readonly ItemId[], id: ItemId): boolean {
  const def: ItemDef = ITEMS[id]
  return def.maxStacks !== undefined && stackCount(owned, id) >= def.maxStacks
}

/** 从池中随机上架一件未达上限的道具；全部达上限返回 null。
 * 两段式抽取：先按波次权重在「有货的稀有度档」间抽签（无货/零权重档的权重
 * 自然归拢到其余档），再在档内均匀抽取 */
export function rollItem(
  pool: readonly ItemId[],
  owned: readonly ItemId[],
  rand: () => number,
  wave = 1,
  level = 1,
): ItemId | null {
  const avail = pool.filter((id) => !reachedStackLimit(owned, id))
  if (avail.length === 0) return null
  const weights = rarityWeights(wave, level)
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

/** 商店价格：基准价随波次通胀上浮 × 前期折扣（前期金币少，先把货压便宜，
 * 到 earlyFadeWaves 波线性消退）。展示与扣款都走 itemPrice，ITEMS.price 是基准价。设计值见 defs/economy.ts */
export const PRICE = ECON.price

export function itemPrice(id: ItemId, wave: number): number {
  const inflate = 1 + PRICE.perWave * Math.max(0, wave - 1)
  // 第 1 波打 (1-earlyDiscount)，之后线性消退到 earlyFadeWaves 波归零折扣
  const disc = 1 - PRICE.earlyDiscount * Math.max(0, 1 - Math.max(0, wave - 1) / PRICE.earlyFadeWaves)
  return Math.max(1, Math.round(ITEMS[id].price * inflate * disc))
}

// ── 效果叠加 ────────────────────────────────────────────────

/** 聚合角色有效属性：已购道具 effects + 额外片段（如「角色等级形态」的基础属性质变）。
 * 乘区相乘、加区相加，暴击封顶。extra 让升级的基础属性质变与道具走同一条叠加管线 */
export function aggregateCharacterEffects(
  owned: readonly ItemId[],
  extra: readonly Partial<CharacterEffects>[] = [],
): CharacterEffects {
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
  const apply = (e: Partial<CharacterEffects>): void => {
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
  for (const id of owned) apply(ITEMS[id].effects)
  for (const e of extra) apply(e)
  fx.critChance = Math.min(0.5, fx.critChance)
  return fx
}

/** 把一列团队效果片段叠加成整份 TeamEffects（乘区相乘、加区相加，末尾统一封顶）。
 * 供升级卡系统聚合（team card → teamFx）；起点为 TEAM_FX_IDENTITY */
export function foldTeamEffects(parts: readonly Partial<TeamEffects>[]): TeamEffects {
  const fx: TeamEffects = { ...TEAM_FX_IDENTITY }
  for (const e of parts) {
    fx.moveSpeedMul *= e.moveSpeedMul ?? 1
    fx.magnetMul *= e.magnetMul ?? 1
    fx.doubleCoinChance += e.doubleCoinChance ?? 0
    fx.teamDamageMul *= e.teamDamageMul ?? 1
    fx.xpGainMul *= e.xpGainMul ?? 1
    fx.enemySlowMul *= e.enemySlowMul ?? 1
    fx.waveHealRatio += e.waveHealRatio ?? 0
    fx.waveCoins += e.waveCoins ?? 0
    fx.teamCooldownMul *= e.teamCooldownMul ?? 1
    fx.critAdd += e.critAdd ?? 0
    fx.teamHpMul *= e.teamHpMul ?? 1
    fx.reviveMul *= e.reviveMul ?? 1
    fx.skillCdMul *= e.skillCdMul ?? 1
    fx.shopDiscountMul *= e.shopDiscountMul ?? 1
    fx.freeRerolls += e.freeRerolls ?? 0
    fx.draftSize += e.draftSize ?? 0
  }
  // 封顶/保底：极端叠加也不失控
  fx.doubleCoinChance = Math.min(0.9, fx.doubleCoinChance)
  fx.enemySlowMul = Math.max(0.6, fx.enemySlowMul)
  fx.waveHealRatio = Math.min(0.6, Math.max(0, fx.waveHealRatio))
  fx.critAdd = Math.min(0.5, Math.max(0, fx.critAdd))
  fx.reviveMul = Math.max(0.3, fx.reviveMul)
  fx.skillCdMul = Math.max(0.3, fx.skillCdMul)
  fx.shopDiscountMul = Math.max(0.4, fx.shopDiscountMul)
  fx.teamHpMul = Math.max(0.3, fx.teamHpMul)
  fx.teamCooldownMul = Math.max(0.4, fx.teamCooldownMul)
  return fx
}

// ── 能力参数修正 ────────────────────────────────────────────

/** 按修正预算出「生效 def」：只缩放空间参数与弹速；
 * 伤害/冷却由运行时 ctx 倍率处理（避免双重生效） */
export function resolveAbilityDef(w: AbilityDef, fx: CharacterEffects): AbilityDef {
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
    // 单发型载荷无空间索敌参数（点名全场/全域生效），rangeMul 不适用
    case 'rally':
    case 'strike':
    case 'dance':
    case 'buff':
    case 'nuke':
    case 'timeStop':
      return w
  }
}

// 商店：每个上架位可付费重新随机（队长可提供免费次数）。设计值见 defs/economy.ts
export const SHOP = ECON.shop
