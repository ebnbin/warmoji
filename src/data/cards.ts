import cardsJson from '../assets/cards.json'
import { foldTeamEffects, rarityWeights } from './items'
import type { ItemRarity, TeamEffects } from './items'

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

// 卡表：数据行在 defs/cards.ts（创作层），npm run gen 校验并生成 cards.json
export type CardId = keyof typeof cardsJson
export const CARDS = cardsJson as unknown as Record<CardId, CardDef>
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
