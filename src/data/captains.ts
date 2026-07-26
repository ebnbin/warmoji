import captainsJson from '../assets/captains.json'
import { ABILITIES } from './abilities'
import type { AbilityId } from '../types/abilities'
import type { AbilityDef } from '../types/abilityDefs'
import type { CaptainDef, CaptainId, CaptainSource } from '../types/captains'

// 队长：不登场、无实体的团队增益提供者（emotion 表情形象）。
// 被动增益先直接建模为字段（编制上限/经验倍率等），主动技能的效果走能力系统。
// 磁盘形态（captains.json）里技能载荷以能力 id 引用，加载时解析成 def 一次。

const resolveAbilities = (ids: readonly AbilityId[]): AbilityDef[] => ids.map((id) => ABILITIES[id]!)

/** id 引用 → def：加载时一次性解析（能力表由 gen 校验，此处断言收口） */
function hydrateCaptain(src: CaptainSource): CaptainDef {
  return { ...src, skill: { ...src.skill, abilities: resolveAbilities(src.skill.abilities) } }
}

export const CAPTAINS = Object.fromEntries(
  Object.entries(captainsJson as unknown as Record<CaptainId, CaptainSource>).map(
    ([id, src]) => [id, hydrateCaptain(src)],
  ),
) as Record<CaptainId, CaptainDef>
export const CAPTAIN_IDS = Object.keys(CAPTAINS) as readonly CaptainId[]

/** 测试专用队长：不进正常队长选择页，测试模式固定用它（编制 8、无限金币、永远满豆、无增益） */
export const TEST_CAPTAIN: CaptainId = 'tester'

/** 正常可选队长（排除测试专用队长）：队长选择页用 */
export const PICKABLE_CAPTAIN_IDS = CAPTAIN_IDS.filter((id) => id !== TEST_CAPTAIN)
