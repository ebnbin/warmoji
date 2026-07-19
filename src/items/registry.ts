import itemsJson from '../assets/items.json'
import type { UpgradeTiers } from '../characters/registry'
import type { CharacterId, CharacterDef } from '../characters/registry'
import type { AbilityDef } from '../abilities/defs'

// 道具 = 一组属性修正（可带负面副作用，数值上保证净增益）。
// 只开放少量通用属性轴，不逐能力参数开洞；乘法轴叠乘、加法轴叠加。
// 池归属用 tag：'all' 进所有角色池，能力 kind 进对应角色池（按配装自动推导），
// 'team' 进队长池，'upgrade' 为角色专属升级卡（只进 forCharacter 的池）。
// 稀有度三档：越稀有越贵（价格档严格递增，金币后期才买得起大件），
// 上架时先按波次权重抽稀有度档、再在档内均匀抽取——前期以普通为主，史诗第 5 波起解锁。
// 升级卡是角色质变的唯一来源：一阶卡要求先给该角色买过几张普通道具
//（UPGRADE_GATE），二阶卡要求已持有一阶卡——升阶节奏由此涌现。

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

export type ItemPool = 'all' | 'team' | 'upgrade' | AbilityDef['kind']

export interface ItemDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly rarity: ItemRarity
  readonly price: number
  /** 单一持有者的购买上限；缺省无限堆叠 */
  readonly maxStacks?: number
  readonly pool: ItemPool
  /** 升级卡专属：归属角色 + 档位（0 一阶 / 1 二阶） */
  readonly forCharacter?: CharacterId
  readonly abilityIndex?: 0 | 1
  readonly effects: Partial<CharacterEffects & TeamEffects>
}

/** 升级卡解锁门槛：一阶卡上架前该角色需已购的普通道具数 */
export const UPGRADE_GATE = { normalsForFirst: 2 } as const

// 道具表：数据行在 defs/items.ts（创作层），npm run gen 生成 items.json
export type ItemId = keyof typeof itemsJson
export const ITEMS = itemsJson as unknown as Record<ItemId, ItemDef>


export const ITEM_IDS = Object.keys(ITEMS) as readonly ItemId[]

// ── 池推导 ──────────────────────────────────────────────────

/** 角色池 = 通用道具 + 与其能力形态匹配的形态道具 + 自己的两张升级卡 */
export function characterPool(id: CharacterId, def: CharacterDef): ItemId[] {
  const kinds = new Set<string>(def.abilities.map((w) => w.kind))
  return ITEM_IDS.filter((iid) => {
    const item: ItemDef = ITEMS[iid]
    if (item.pool === 'upgrade') return item.forCharacter === id
    return item.pool === 'all' || kinds.has(item.pool)
  })
}

/** 已购道具推导的能力档位（一二阶各最多一张，二阶依赖一阶） */
export function upgradeTiers(id: CharacterId, owned: readonly ItemId[]): UpgradeTiers {
  const has = (index: 0 | 1): boolean =>
    owned.some((iid) => {
      const item: ItemDef = ITEMS[iid]
      return item.pool === 'upgrade' && item.forCharacter === id && item.abilityIndex === index
    })
  return { u1: has(0), u2: has(1) }
}

/** 升级卡的上架资格：一阶要求已购普通道具达标，二阶要求已持有一阶 */
export function upgradeCardAvailable(id: ItemId, owned: readonly ItemId[]): boolean {
  const item: ItemDef = ITEMS[id]
  if (item.pool !== 'upgrade' || item.forCharacter === undefined) return true
  if (item.abilityIndex === 1) return upgradeTiers(item.forCharacter, owned).u1
  const normals = owned.filter((iid) => (ITEMS[iid] as ItemDef).pool !== 'upgrade').length
  return normals >= UPGRADE_GATE.normalsForFirst
}

export function captainPool(): ItemId[] {
  return ITEM_IDS.filter((id) => ITEMS[id].pool === 'team')
}

// ── 持有与购买 ──────────────────────────────────────────────

export function stackCount(owned: readonly ItemId[], id: ItemId): number {
  return owned.filter((x) => x === id).length
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
): ItemId | null {
  const avail = pool.filter((id) => !reachedStackLimit(owned, id) && upgradeCardAvailable(id, owned))
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
      return w
  }
}

// 商店：每个上架位可付费重新随机（队长可提供免费次数）
export const SHOP = { refreshPrice: 2 } as const
