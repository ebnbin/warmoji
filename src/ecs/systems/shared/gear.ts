import { addComponent, hasComponent } from 'bitecs'
import { ITEMS } from '../../../data/items'
import { toPx } from '../../../data/px'
import { Alive, Gear, Hp, MARK, Stats, TAG, Transform } from '../../components'
import { gearRules } from '../../store'
import { addMark } from '../../utils/marks'
import { selfSource } from '../../utils/source'
import { HIT } from '../../utils/hitTags'
import { isSameEntity } from '../../utils/identity'
import { applyAbilityEffects, casterOf } from './effects'
import type { Point } from '../../../util/vec'
import type { GearEvent, GearTrigger, GearWhen, ItemId } from '../../../types/items'
import type { Source } from '../../utils/source'
import type { EcsWorld } from '../../world'
import type { Sim } from '../../sim'

/** 装好的一条触发：同一件道具有几件，带几率的几率相加（最多必定），不带的施加几次 */
interface Armed {
  readonly t: GearTrigger
  readonly chance: number
  readonly times: number
}

/** 角色身上道具汇总出的规则：条件属性每件一份，触发按时机分好 */
export interface GearRules {
  readonly when: readonly GearWhen[]
  readonly on: { readonly [E in GearEvent]?: readonly Armed[] }
}

function compile(owned: readonly ItemId[]): GearRules | undefined {
  const count = new Map<ItemId, number>()
  for (const id of owned) count.set(id, (count.get(id) ?? 0) + 1)
  const when: GearWhen[] = []
  const on: { [E in GearEvent]?: Armed[] } = {}
  for (const [id, n] of count) {
    const def = ITEMS[id]
    for (const w of toPx(def.when ?? [])) for (let i = 0; i < n; i++) when.push(w)
    for (const t of toPx(def.on ?? [])) {
      const chance = 'chance' in t ? t.chance : undefined
      const list = (on[t.on] ??= [])
      list.push(chance === undefined ? { t, chance: 1, times: n } : { t, chance: Math.min(1, chance * n), times: 1 })
    }
  }
  return when.length > 0 || Object.keys(on).length > 0 ? { when, on } : undefined
}

/** 装上角色的道具规则，每波的护盾此刻给足 */
export function armGear(world: EcsWorld, eid: number, owned: readonly ItemId[]): void {
  addComponent(world, eid, Gear)
  Gear.hurtAt[eid] = 0
  Gear.skillAt[eid] = -Infinity
  gearRules[eid] = compile(owned)
  const blocks = Stats.blocks[eid]!
  if (blocks > 0) addMark(eid, MARK.spellShield, TAG.perk, Infinity, blocks)
}

/** 正在施加道具的效果：这期间的命中、击杀与受伤不再触发道具 */
let busy = false

/** 按几率施加一组触发：self 在持有者身上，foe 在对手身上（对手没了就只落在 at），corpse 落在 at */
function fire(sim: Sim, holder: number, list: readonly Armed[] | undefined, at: Point, foe: number, base: number): void {
  if (!list || busy) return
  busy = true
  const src: Source = { ...selfSource(sim, holder), noCrit: true }
  for (const a of list) {
    if (a.chance < 1 && sim.rng.next() >= a.chance) continue
    const on = a.t.to === 'self' ? holder : a.t.to === 'foe' ? foe : -1
    const spot = on >= 0 ? { x: Transform.x[on]!, y: Transform.y[on]!, targets: [on] } : { x: at.x, y: at.y, targets: [] }
    for (let i = 0; i < a.times; i++) applyAbilityEffects(sim, src, a.t.effects, { ...spot, baseDamage: a.t.damage ?? base })
  }
  busy = false
}

function here(eid: number): Point {
  return { x: Transform.x[eid]!, y: Transform.y[eid]! }
}

/** 持有者亲手命中了目标（命中前记下它的位置与编号）：召唤物的与持续伤害不算 */
export function gearStruck(sim: Sim, src: Source, target: number, uid: number, at: Point, damage: number, tags: number, crit: boolean): void {
  if (tags & (HIT.summon | HIT.dot)) return
  const holder = casterOf(sim, src)
  const on = holder >= 0 ? gearRules[holder]?.on : undefined
  if (!on) return
  const foe = isSameEntity(sim.world, target, uid) && Alive.v[target] ? target : -1
  fire(sim, holder, on.hit, at, foe, damage)
  if (crit) fire(sim, holder, on.crit, at, foe, damage)
}

/** 持有者亲手杀了一个敌人：尸体已移除，at 是它倒下的地方；召唤物的不算 */
export function gearKill(sim: Sim, src: Source, at: Point): void {
  if ((src.tags ?? 0) & HIT.summon) return
  const holder = casterOf(sim, src)
  if (holder >= 0) fire(sim, holder, gearRules[holder]?.on.kill, at, -1, 0)
}

/** 持有者闪开了一下：对手是出手的身体 */
export function gearDodged(sim: Sim, src: Source, holder: number): void {
  fire(sim, holder, gearRules[holder]?.on.dodge, here(holder), casterOf(sim, src), 0)
}

/** 持有者挨了一下：记下时刻；持续伤害不触发，对手是出手的身体 */
export function gearHurt(sim: Sim, src: Source, holder: number, dmg: number, tick: boolean): void {
  if (!hasComponent(sim.world, holder, Gear)) return
  Gear.hurtAt[holder] = sim.elapsedMs
  if (!tick) fire(sim, holder, gearRules[holder]?.on.hurt, here(holder), casterOf(sim, src), dmg)
}

/** 本条命里生命第一次低于比例时各触发一次 */
export function gearLowHp(sim: Sim, holder: number): void {
  const list = gearRules[holder]?.on.lowHp
  list?.forEach((a, i) => {
    const bit = 1 << i
    if (a.t.on !== 'lowHp' || Gear.low[holder]! & bit || Hp.v[holder]! >= Hp.max[holder]! * a.t.ratio) return
    Gear.low[holder] = Gear.low[holder]! | bit
    fire(sim, holder, [a], here(holder), -1, 0)
  })
}

/** 本条命第一次受到致命伤害：留 1 生命并触发，返回是否救下 */
export function gearLethal(sim: Sim, holder: number): boolean {
  const list = gearRules[holder]?.on.lethal
  if (!list || Gear.lethal[holder]) return false
  Gear.lethal[holder] = 1
  Hp.v[holder] = 1
  fire(sim, holder, list, here(holder), -1, 0)
  return true
}

/** 新的一波开始了 */
export function gearWave(sim: Sim, holder: number): void {
  fire(sim, holder, gearRules[holder]?.on.wave, here(holder), -1, 0)
}

/** 持有者放了一次主动技能 */
export function gearSkill(sim: Sim, holder: number): void {
  if (!hasComponent(sim.world, holder, Gear)) return
  Gear.skillAt[holder] = sim.elapsedMs
  fire(sim, holder, gearRules[holder]?.on.skill, here(holder), -1, 0)
}
