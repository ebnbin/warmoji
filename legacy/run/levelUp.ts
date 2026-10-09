import { TEAM } from '../data/characters'
import type { CharacterId } from '../types/characters'
import { levelCap, memberLevel, teamLeveled } from './members'
import { addMember, recruitCandidates, slotKept, swapMember } from './state'
import type { RunState } from './state'

/** 场上一格此刻的样子：站着没有、还剩几成生命 */
export interface FieldMember {
  readonly alive: boolean
  readonly hp: number
}

/**
 * 领一次全队升级：upgrade 给场上这一格的人升一级，不回生命；restore 让这一格的人生命回满，倒下的复活；
 * join 让 id 满生命站到这一格，这一格空着是招募，是别人是替换；skip 只剩替换可选时不换人，这一次作废
 */
export type Claim =
  | { readonly kind: 'upgrade'; readonly slot: number }
  | { readonly kind: 'restore'; readonly slot: number }
  | { readonly kind: 'join'; readonly slot: number; readonly id: CharacterId }
  | { readonly kind: 'skip' }

/** 场上一格这一次能做的：站着又没到他的等级上限能升级，受了伤或倒下能恢复 */
export interface SlotChoice {
  readonly upgrade: boolean
  readonly restore: boolean
}

/** 升上去了还没领的次数：地上的升级道具，加上捡起来还没选的 */
export function pendingLevelUps(run: RunState): number {
  return teamLeveled(run) ? run.xp.level - 1 - run.claimed : 0
}

/** 场上每一格这一次能做的 */
export function slotChoices(run: RunState, field: readonly FieldMember[]): SlotChoice[] {
  return run.roster.map((_, slot) => {
    const f = field[slot]
    return { upgrade: !!f?.alive && memberLevel(run, slot) < levelCap(run, slot), restore: !!f && !(f.alive && f.hp >= 1) }
  })
}

/** 角色池里还有人能上场：场上有空位是招募，满了是替换 */
export function canJoin(run: RunState): boolean {
  return recruitCandidates(run).length > 0
}

/** 场上满了：上场就是替换 */
export function fieldFull(run: RunState): boolean {
  return run.roster.length >= TEAM.maxSize
}

/** 只剩替换可选：允许跳过，不逼着换人 */
export function onlySwap(run: RunState, field: readonly FieldMember[]): boolean {
  return fieldFull(run) && slotChoices(run, field).every((c) => !c.upgrade && !c.restore)
}

/** 这一次有没有能选的：没有就作废 */
export function anyChoice(run: RunState, field: readonly FieldMember[]): boolean {
  return canJoin(run) || slotChoices(run, field).some((c) => c.upgrade || c.restore)
}

/** 领一次升级：等级与名单当场记下，生命交给战斗那边 */
export function claim(run: RunState, c: Claim): void {
  switch (c.kind) {
    case 'upgrade':
      slotKept(run, c.slot).level = memberLevel(run, c.slot) + 1
      break
    case 'join':
      if (c.slot === run.roster.length) addMember(run, c.id)
      else swapMember(run, c.slot, c.id)
      break
    case 'restore':
    case 'skip':
      break
  }
  run.claimed++
}
