import itemsJson from '../assets/items.json'
import economyJson from '../assets/economy.json'
import type { CharacterEffects, TeamEffects, Economy, ItemRarity, ItemDef, ItemId } from '../types/items'
import type { AbilityDef } from '../types/abilityDefs'

/** 叠加的单位元 */
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

const ECON = economyJson as unknown as Economy

export const CRIT_MUL = ECON.critMul

export const RARITY_ORDER: readonly ItemRarity[] = ['common', 'rare', 'epic']
export const RARITIES: Record<ItemRarity, { label: string; color: string }> = {
  common: { label: '普通', color: '#c8c8d4' },
  rare: { label: '稀有', color: '#4fc3f7' },
  epic: { label: '史诗', color: '#ce93d8' },
}

export const ITEMS = itemsJson as unknown as Record<ItemId, ItemDef>

export const ITEM_IDS = Object.keys(ITEMS) as readonly ItemId[]

// ── 池推导 ──

// ── 持有与购买 ──

export function characterXp(owned: readonly ItemId[]): number {
  let xp = 0
  for (const id of owned) xp += ITEMS[id].upgradeXp
  return xp
}

/** ITEMS.price 是基准价，展示与扣款都走 itemPrice */
export const PRICE = ECON.price

export function itemPrice(id: ItemId, wave: number): number {
  const inflate = 1 + PRICE.perWave * Math.max(0, wave - 1)
  const disc = 1 - PRICE.earlyDiscount * Math.max(0, 1 - Math.max(0, wave - 1) / PRICE.earlyFadeWaves)
  return Math.max(1, Math.round(ITEMS[id].price * inflate * disc))
}

// ── 效果叠加 ──

/** extra：角色等级形态的基础属性片段，与道具同一条叠加管线 */
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

// ── 能力参数修正 ──

/** 只缩放空间参数与弹速；伤害/冷却由运行时倍率处理，此处不得再乘 */
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
    case 'rally':
    case 'strike':
    case 'dance':
    case 'buff':
    case 'nuke':
    case 'timeStop':
      return w
  }
}

export const SHOP = ECON.shop
