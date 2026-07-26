import cardsJson from '../assets/cards.json'
import { foldTeamEffects } from './items'
import type { TeamEffects } from '../types/items'
import type { CardDef, CardId } from '../types/cards'

// 团队升级卡：经验升级的战利品，构成「小队层」（原队长道具那套的替代）。
// 每张卡是一组团队效果片段（作用于 TeamEffects → teamFx），可升级（maxLevel）。
// 抽卡在战斗后按本波升的级数发放，玩家每次三选一。卡按标签成 build 路线；
// 权衡靠「打包卡(trade)」「诅咒卡(curse,大正大负)」表达——不做纯负卡。
// 战术权衡（脆而猛/慢而肉）交给角色定位与站位,团队层只管战略乘区。

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

