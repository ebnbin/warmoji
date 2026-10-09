import { addComponent, hasComponent, query, removeComponent } from 'bitecs'
import { CHARACTERS } from '../../data/characters'
import { slotKept } from '../../run/state'
import { Ability, Act, Anchored, Anim, Borrowed, Cd, Charges, Contact, Elem, EnemyArm, Faction, Form, Granted, Manual, MARK, Motion, MOTION, Owner, Phys, Slot, Span, Sprite, Transform, VisOff } from '../components'
import { setTraits } from '../utils/traits'
import { abilityDef, bodyLook, enemyDef, formEnd } from '../store'
import { hasMark } from '../utils/marks'
import { foldBody, setStatLayer } from '../utils/stats'
import { armIdle } from '../systems/shared/anim'
import { interrupt } from '../systems/shared/ability'
import { attachDrive, detachDrive, npcOutline } from './enemy'
import { STANDARD } from '../utils/pass'
import { hoverPx } from '../utils/ground'
import { equipAbility, unequipAbilities } from './ability'
import { armCarriers } from './loadout'
import type { AbilityDef, Effect } from '../../types/abilityDefs'
import type { DriveDef, FormDef, PhaseDef } from '../../types/enemies'
import type { StatMods } from '../../types/stats'
import type { Sim } from '../sim'
import { elementIndex } from '../../data/elements'

/** 身体可切换的形态：非玩家身体取定义里的，角色取角色表里的 */
function formsOf(sim: Sim, eid: number): readonly FormDef[] | undefined {
  if (hasComponent(sim.world, eid, Slot)) return CHARACTERS[sim.run.roster[Slot.v[eid]!]!]?.forms
  return enemyDef[eid]?.forms
}

/** 本体的外观 */
function baseLook(sim: Sim, eid: number): string {
  if (hasComponent(sim.world, eid, Slot)) return CHARACTERS[sim.run.roster[Slot.v[eid]!]!]!.emoji
  return enemyDef[eid]!.emoji
}

/** 身体现在的形态，-1 是本体 */
export function formOf(sim: Sim, eid: number): number {
  return hasComponent(sim.world, eid, Form) ? Form.idx[eid]! : -1
}

function relook(sim: Sim, eid: number, emoji: string): void {
  bodyLook[eid] = emoji
  if (hasMark(sim, eid, MARK.morph)) return
  const outline = hasComponent(sim.world, eid, Slot) ? 'player' : npcOutline(eid)
  Sprite.frame[eid] = sim.frames.index(emoji, outline)
  armIdle(eid, emoji, outline, Sprite.frame[eid]!, Anim.offset[eid]!)
}

/** 换能力：主动技能与借来的不换；非玩家身体还没装过能力就留给 armEnemies */
function rearm(sim: Sim, eid: number, f: FormDef | undefined): void {
  if (hasComponent(sim.world, eid, Slot)) {
    unequipAbilities(sim, eid, (e) => !hasComponent(sim.world, e, Manual) && !isBorrowed(sim, e))
    armCarriers(sim, Slot.v[eid]!, f?.abilities)
    return
  }
  if (!EnemyArm.armed[eid]) return
  unequipAbilities(sim, eid, (e) => !isBorrowed(sim, e))
  armNpc(sim, eid)
}

/** 角色按当前形态重新装上自动能力：升级换了载体的档位时用 */
export function rearmCharacter(sim: Sim, eid: number): void {
  const idx = formOf(sim, eid)
  rearm(sim, eid, idx >= 0 ? formsOf(sim, eid)?.[idx] : undefined)
}

/** 非玩家身体装上当前形态的能力：各自的首发延迟，没写的按身体的 */
export function armNpc(sim: Sim, eid: number): void {
  EnemyArm.armed[eid] = 1
  for (const w of npcAbilities(sim, eid) ?? []) {
    const delay = ('firstDelayMs' in w ? w.firstDelayMs : undefined) ?? EnemyArm.fireDelayMs[eid]!
    equipAbility(sim, eid, w, Faction.v[eid]!, delay)
  }
}

function isBorrowed(sim: Sim, e: number): boolean {
  return hasComponent(sim.world, e, Borrowed)
}

/** 到当前头目阶段为止，最近写了这一项的那一段的值；没进阶段或都没写是 undefined */
function phaseField<K extends 'abilities' | 'drive' | 'stats' | 'element'>(eid: number, key: K): PhaseDef[K] | undefined {
  const phases = enemyDef[eid]?.phases
  if (!phases) return undefined
  for (let i = Act.phase[eid]!; i >= 0; i--) {
    const v = phases[i]?.[key]
    if (v !== undefined) return v
  }
  return undefined
}

function npcForm(sim: Sim, eid: number): FormDef | undefined {
  const idx = formOf(sim, eid)
  return idx >= 0 ? enemyDef[eid]?.forms?.[idx] : undefined
}

/** 非玩家身体此刻的能力：头目阶段写了的用阶段的，否则用当前形态的，再否则用本体的 */
export function npcAbilities(sim: Sim, eid: number): FormDef['abilities'] {
  return phaseField(eid, 'abilities') ?? npcForm(sim, eid)?.abilities ?? enemyDef[eid]?.abilities
}

/** 身体此刻的元素编号：头目阶段写了的用阶段的，否则当前形态的，再否则本体的 */
export function bodyElement(sim: Sim, eid: number): number {
  const forms = formsOf(sim, eid)
  const idx = formOf(sim, eid)
  const form = idx >= 0 ? forms?.[idx]?.element : undefined
  if (hasComponent(sim.world, eid, Slot)) return elementIndex(form ?? CHARACTERS[sim.run.roster[Slot.v[eid]!]!]?.element)
  return elementIndex(phaseField(eid, 'element') ?? form ?? enemyDef[eid]?.element)
}

/** 头目阶段的属性：到当前阶段为止最近写了的那一段 */
export function phaseStats(eid: number): StatMods | undefined {
  return phaseField(eid, 'stats')
}

/** 非玩家身体此刻的走法：按条件换走法的规则生效时用规则的；否则头目阶段的，再否则形态的，再否则本体的 */
export function npcDrive(sim: Sim, eid: number): DriveDef {
  const r = Act.rule[eid]!
  const rule = r >= 0 ? enemyDef[eid]?.drives?.[r] : undefined
  return rule?.drive ?? phaseField(eid, 'drive') ?? npcForm(sim, eid)?.drive ?? enemyDef[eid]!.drive
}

/** 非玩家身体换一套能力：同一招保留冷却与充能；借来的不动，效果放出的到用时再装 */
export function rearmNpcKeep(sim: Sim, eid: number): void {
  const kept = new Map<AbilityDef, { readonly left: number; readonly charges: number }>()
  for (const e of query(sim.world, [Ability, Owner])) {
    const d = abilityDef[e]
    if (Owner.eid[e] === eid && d && !isBorrowed(sim, e) && !hasComponent(sim.world, e, Granted)) kept.set(d, { left: Cd.left[e]!, charges: Charges.n[e]! })
  }
  unequipAbilities(sim, eid, (e) => !isBorrowed(sim, e))
  armNpc(sim, eid)
  for (const e of query(sim.world, [Ability, Owner])) {
    const k = Owner.eid[e] === eid ? kept.get(abilityDef[e]!) : undefined
    if (!k) continue
    Cd.left[e] = k.left
    if (hasComponent(sim.world, e, Charges)) Charges.n[e] = k.charges
  }
}

/** 切形态：外观、能力、走法、属性、锚定、接触伤害一起换，没写的沿用本体；给了 ms 到时切回本体并施加 onEnd；角色的永久形态记进本局 */
export function applyForm(sim: Sim, eid: number, to: number, ms?: number, onEnd?: readonly Effect[]): void {
  const forms = formsOf(sim, eid)
  if (to >= 0 && !forms?.[to]) return
  if (!hasComponent(sim.world, eid, Form)) addComponent(sim.world, eid, Form)
  Form.until[eid] = ms === undefined ? 0 : sim.elapsedMs + ms
  formEnd[eid] = ms === undefined ? undefined : onEnd
  const char = hasComponent(sim.world, eid, Slot)
  if (char && ms === undefined) slotKept(sim.run, Slot.v[eid]!).form = to
  if (Form.idx[eid] === to) return
  const was = Form.idx[eid]! >= 0 ? forms?.[Form.idx[eid]!] : undefined
  Form.idx[eid] = to
  const f = to >= 0 ? forms![to] : undefined
  relook(sim, eid, f?.emoji ?? baseLook(sim, eid))
  Elem.v[eid] = bodyElement(sim, eid)
  setStatLayer(eid, 'form', f?.stats ? [f.stats] : undefined)
  foldBody(sim.world, sim, eid)
  if (f?.abilities || was?.abilities) rearm(sim, eid, f)
  if (!char) npcBody(sim, eid, f)
  interrupt(sim, eid)
  sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 10, kind: 'puff' })
}

/** 非玩家身体的走法、特质、身段与接触伤害 */
function npcBody(sim: Sim, eid: number, f: FormDef | undefined): void {
  const def = enemyDef[eid]!
  const span = f?.span ?? def.span ?? STANDARD
  Span.lo[eid] = span[0]
  Span.hi[eid] = span[1]
  if (Motion.kind[eid] !== MOTION.arc) VisOff.y[eid] = -hoverPx(eid)
  detachDrive(sim, eid)
  attachDrive(sim, eid, npcDrive(sim, eid))
  setTraits(sim.world, eid, f?.traits ?? def.traits)
  if (hasComponent(sim.world, eid, Anchored)) {
    Phys.vx[eid] = 0
    Phys.vy[eid] = 0
  }
  const dmg = f?.damage ?? def.damage
  if (dmg > 0) {
    if (!hasComponent(sim.world, eid, Contact)) addComponent(sim.world, eid, Contact)
    Contact.damage[eid] = dmg
  } else if (hasComponent(sim.world, eid, Contact)) removeComponent(sim.world, eid, Contact)
}
