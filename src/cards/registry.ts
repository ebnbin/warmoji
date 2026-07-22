import { foldTeamEffects, rarityWeights } from '../items/registry'
import type { ItemRarity, TeamEffects } from '../items/registry'

// 团队升级卡：经验升级的战利品，构成「小队层」（原队长道具那套的替代）。
// 每张卡是一组团队效果片段（作用于 TeamEffects → teamFx），可升级（maxLevel）。
// 抽卡在战斗后按本波升的级数发放，玩家每次三选一。卡按标签成 build 路线；
// 权衡靠「打包卡(trade)」「诅咒卡(curse,大正大负)」表达——不做纯负卡。
// 战术权衡（脆而猛/慢而肉）交给角色定位与站位,团队层只管战略乘区。

export type CardTag =
  | 'economy'
  | 'tempo'
  | 'offense'
  | 'defense'
  | 'meta'
  | 'skill'
  | 'loot'
  | 'trade'
  | 'curse'

export interface CardDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly rarity: ItemRarity
  readonly tags: readonly CardTag[]
  /** 可叠加/升级的上限（1 = 唯一）；每一级把 effects 再叠加一次 */
  readonly maxLevel: number
  readonly effects: Partial<TeamEffects>
}

export const CARDS = {
  // ── 进攻 ──────────────────────────────────────────────
  sharpen: {
    emoji: '1f5e1', name: '磨砺', desc: '全队伤害 +10%',
    rarity: 'common', tags: ['offense'], maxLevel: 5, effects: { teamDamageMul: 1.1 },
  },
  haste: {
    emoji: '26a1', name: '疾攻', desc: '全队攻速 +8%',
    rarity: 'common', tags: ['offense', 'tempo'], maxLevel: 5, effects: { teamCooldownMul: 0.92 },
  },
  focus: {
    emoji: '1f3af', name: '专注', desc: '全队暴击率 +6%',
    rarity: 'rare', tags: ['offense'], maxLevel: 5, effects: { critAdd: 0.06 },
  },
  // ── 防御 ──────────────────────────────────────────────
  vigor: {
    emoji: '1f49a', name: '体魄', desc: '全队生命上限 +12%',
    rarity: 'common', tags: ['defense'], maxLevel: 5, effects: { teamHpMul: 1.12 },
  },
  mend: {
    emoji: '1f372', name: '野炊', desc: '波末回复全队 12% 生命上限',
    rarity: 'rare', tags: ['defense'], maxLevel: 3, effects: { waveHealRatio: 0.12 },
  },
  phoenix: {
    emoji: '1f54a', name: '归队号', desc: '倒地复活速度 +20%',
    rarity: 'rare', tags: ['defense'], maxLevel: 3, effects: { reviveMul: 0.8 },
  },
  // ── 节奏 / 走位 ────────────────────────────────────────
  swift: {
    emoji: '1f45f', name: '疾行', desc: '队伍移速 +8%',
    rarity: 'common', tags: ['tempo'], maxLevel: 5, effects: { moveSpeedMul: 1.08 },
  },
  frost: {
    emoji: '1f40c', name: '滞敌', desc: '全体敌人移速 -8%',
    rarity: 'rare', tags: ['tempo'], maxLevel: 3, effects: { enemySlowMul: 0.92 },
  },
  // ── 经济 ──────────────────────────────────────────────
  goldRush: {
    emoji: '1f4b0', name: '军饷', desc: '波末额外 +18 金币',
    rarity: 'common', tags: ['economy'], maxLevel: 3, effects: { waveCoins: 18 },
  },
  bargain: {
    emoji: '1f3f7', name: '砍价', desc: '商店价格 -12%',
    rarity: 'rare', tags: ['economy'], maxLevel: 3, effects: { shopDiscountMul: 0.88 },
  },
  jackpot: {
    emoji: '1fa99', name: '横财', desc: '敌人掉双倍金币概率 +12%',
    rarity: 'common', tags: ['economy'], maxLevel: 3, effects: { doubleCoinChance: 0.12 },
  },
  magnet: {
    emoji: '1f9f2', name: '磁场', desc: '金币磁吸范围 +25%',
    rarity: 'common', tags: ['economy'], maxLevel: 3, effects: { magnetMul: 1.25 },
  },
  reroll: {
    emoji: '1f504', name: '调货', desc: '每次进店额外 +1 次免费刷新',
    rarity: 'rare', tags: ['economy', 'meta'], maxLevel: 2, effects: { freeRerolls: 1 },
  },
  // ── 进程 / 元 ─────────────────────────────────────────
  scholar: {
    emoji: '1f4da', name: '操典', desc: '全队经验 +12%',
    rarity: 'common', tags: ['meta'], maxLevel: 5, effects: { xpGainMul: 1.12 },
  },
  wideDraft: {
    emoji: '1f0cf', name: '广纳', desc: '每次升级抽卡多 1 张候选',
    rarity: 'epic', tags: ['meta'], maxLevel: 2, effects: { draftSize: 1 },
  },
  fortune: {
    emoji: '1f381', name: '福运', desc: '宝箱掉落概率 +50%',
    rarity: 'rare', tags: ['loot'], maxLevel: 2, effects: { chestChanceMul: 1.5 },
  },
  // ── 队长技能专属 ──────────────────────────────────────
  overclock: {
    emoji: '23f1', name: '超频', desc: '队长技能冷却 -15%',
    rarity: 'rare', tags: ['skill'], maxLevel: 3, effects: { skillCdMul: 0.85 },
  },
  warhorn: {
    emoji: '1f4ef', name: '冲锋号', desc: '队长技能冷却 -10% · 全队伤害 +8%',
    rarity: 'epic', tags: ['skill', 'offense'], maxLevel: 2, effects: { skillCdMul: 0.9, teamDamageMul: 1.08 },
  },
  // ── 打包权衡（正+负，偏 build） ────────────────────────
  artillery: {
    emoji: '1f4a5', name: '炮阵', desc: '全队伤害 +30% · 移速 -12%',
    rarity: 'rare', tags: ['trade', 'offense'], maxLevel: 3, effects: { teamDamageMul: 1.3, moveSpeedMul: 0.88 },
  },
  skirmish: {
    emoji: '1f3c3', name: '游击', desc: '移速 +18% · 攻速 +10% · 伤害 -12%',
    rarity: 'rare', tags: ['trade', 'tempo'], maxLevel: 3,
    effects: { moveSpeedMul: 1.18, teamCooldownMul: 0.9, teamDamageMul: 0.88 },
  },
  bulwark: {
    emoji: '1f3f0', name: '壁垒', desc: '生命上限 +30% · 移速 -10%',
    rarity: 'rare', tags: ['trade', 'defense'], maxLevel: 3, effects: { teamHpMul: 1.3, moveSpeedMul: 0.9 },
  },
  // ── 诅咒 / 魔鬼交易（大正大负，唯一） ─────────────────
  bloodPact: {
    emoji: '1fa78', name: '血契', desc: '全队伤害 +50% · 生命上限 -20%',
    rarity: 'epic', tags: ['curse', 'offense'], maxLevel: 1, effects: { teamDamageMul: 1.5, teamHpMul: 0.8 },
  },
  greedPact: {
    emoji: '1f911', name: '贪欲', desc: '双倍金币概率 +40% · 波末 +25 金币 · 移速 -15%',
    rarity: 'epic', tags: ['curse', 'economy'], maxLevel: 1,
    effects: { doubleCoinChance: 0.4, waveCoins: 25, moveSpeedMul: 0.85 },
  },
  glassStorm: {
    emoji: '1f329', name: '玻璃风暴', desc: '攻速 +25% · 暴击 +12% · 生命上限 -25%',
    rarity: 'epic', tags: ['curse', 'offense'], maxLevel: 1,
    effects: { teamCooldownMul: 0.75, critAdd: 0.12, teamHpMul: 0.75 },
  },
} satisfies Record<string, CardDef>

export type CardId = keyof typeof CARDS
export const CARD_IDS = Object.keys(CARDS) as readonly CardId[]
const CARD_MAP = CARDS as Record<string, CardDef>

/** 已持卡（cardId → 等级）→ 团队效果：每张卡按其等级叠加对应次数 */
export function aggregateTeamCards(owned: Readonly<Record<string, number>>): TeamEffects {
  const parts: Partial<TeamEffects>[] = []
  for (const [id, level] of Object.entries(owned)) {
    const card = CARD_MAP[id]
    if (!card) continue
    const lv = Math.min(level ?? 0, card.maxLevel)
    for (let i = 0; i < lv; i++) parts.push(card.effects)
  }
  return foldTeamEffects(parts)
}

/** 某卡是否还能再抽（未达上限） */
export function cardAtMax(owned: Readonly<Record<string, number>>, id: CardId): boolean {
  return (owned[id] ?? 0) >= CARDS[id].maxLevel
}

/** 一次抽卡的候选：count 张互不相同、未满级的卡，按波次稀有度权重抽取。
 * 池不够时返回更少。epic 第 5 波起才有正权重（早期自然只出普通/稀有）。 */
export function rollCardChoices(
  owned: Readonly<Record<string, number>>,
  rand: () => number,
  count: number,
  wave = 1,
): CardId[] {
  const pool = CARD_IDS.filter((id) => !cardAtMax(owned, id))
  const weights = rarityWeights(wave)
  const w = (id: CardId): number => Math.max(0.0001, weights[CARDS[id].rarity])
  const chosen: CardId[] = []
  while (chosen.length < count && pool.length > 0) {
    let total = 0
    for (const id of pool) total += w(id)
    let t = rand() * total
    let idx = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      if (t < w(pool[i]!)) {
        idx = i
        break
      }
      t -= w(pool[i]!)
    }
    chosen.push(pool[idx]!)
    pool.splice(idx, 1)
  }
  return chosen
}
