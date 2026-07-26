import itemsJson from '../assets/items.json'
import type { AbilityDef } from './abilityDefs'

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
export type ItemRarity = 'common' | 'rare' | 'epic'
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
