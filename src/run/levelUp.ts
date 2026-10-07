import { TEAM } from '../data/characters'
import type { CharacterId } from '../types/characters'
import { levelCap, memberLevel, teamLeveled } from './members'
import { addMember, recruitCandidates } from './state'
import type { RunState } from './state'

/** 一次全队升级能选的一项：招一名新队员，或给一名队员升一级 */
export type LevelUpOption = { readonly kind: 'recruit' } | { readonly kind: 'upgrade'; readonly slot: number }

/** 升上去了还没领的次数：地上的升级道具，加上捡起来还没选的 */
export function pendingLevelUps(run: RunState): number {
  return teamLeveled(run) ? run.xp.level - 1 - run.claimed : 0
}

/** 这一次升级能选的：队伍没满又有人可招就能招人，回得来又没到等级上限的队员都能升一级 */
export function levelUpOptions(run: RunState): LevelUpOption[] {
  const out: LevelUpOption[] = []
  if (run.roster.length < TEAM.maxSize && recruitCandidates(run).length > 0) out.push({ kind: 'recruit' })
  run.roster.forEach((_, slot) => {
    if (!run.fallen[slot] && memberLevel(run, slot) < levelCap(run)) out.push({ kind: 'upgrade', slot })
  })
  return out
}

/** 领一次升级：给这名队员升一级 */
export function claimUpgrade(run: RunState, slot: number): void {
  run.memberLevels[slot] = memberLevel(run, slot) + 1
  run.claimed++
}

/** 领一次升级：招这名角色入队，返回他的名单位置；招不了是 -1 */
export function claimRecruit(run: RunState, id: CharacterId): number {
  if (run.roster.length >= TEAM.maxSize || !recruitCandidates(run).includes(id)) return -1
  const slot = addMember(run, id)
  run.claimed++
  return slot
}

/** 领一次升级：已经没有能选的，这一次作废 */
export function claimNothing(run: RunState): void {
  run.claimed++
}
