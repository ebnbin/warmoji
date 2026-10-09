import { addComponent, hasComponent } from 'bitecs'
import { ITEMS } from '../../../data/items'
import { toPx } from '../../../data/px'
import { Gear, MARK, Stats, TAG } from '../../components'
import { gearRules } from '../../store'
import { addMark } from '../../utils/marks'
import type { GearWhen, ItemId } from '../../../types/items'
import type { EcsWorld } from '../../world'
import type { Sim } from '../../sim'

/** 队伍道具落到一名队员身上的规则：条件属性每件一份 */
export interface GearRules {
  readonly when: readonly GearWhen[]
}

function compile(owned: readonly ItemId[]): GearRules | undefined {
  const when = owned.flatMap((id) => toPx(ITEMS[id].when ?? []))
  return when.length > 0 ? { when } : undefined
}

/** 装上队伍道具的条件属性，每波的护盾此刻给足 */
export function armGear(world: EcsWorld, eid: number, owned: readonly ItemId[]): void {
  addComponent(world, eid, Gear)
  Gear.hurtAt[eid] = 0
  Gear.skillAt[eid] = -Infinity
  gearRules[eid] = compile(owned)
  const blocks = Stats.blocks[eid]!
  if (blocks > 0) addMark(eid, MARK.spellShield, TAG.perk, Infinity, blocks)
}

/** 队员挨了一下：记下时刻 */
export function gearHurt(sim: Sim, holder: number): void {
  if (hasComponent(sim.world, holder, Gear)) Gear.hurtAt[holder] = sim.elapsedMs
}

/** 队员放了一次主动技能：记下时刻 */
export function gearSkill(sim: Sim, holder: number): void {
  if (hasComponent(sim.world, holder, Gear)) Gear.skillAt[holder] = sim.elapsedMs
}
