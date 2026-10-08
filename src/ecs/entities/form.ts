import { addComponent, hasComponent, removeComponent } from 'bitecs'
import { CHARACTERS } from '../../data/characters'
import { Anchored, Anim, Borrowed, Contact, EnemyArm, Faction, Form, Manual, MARK, Motion, MOTION, Phys, Slot, Span, Sprite, Transform, VisOff } from '../components'
import { setTraits } from '../utils/traits'
import { bodyLook, enemyDef, formEnd } from '../store'
import { hasMark } from '../utils/marks'
import { foldBody, setStatLayer } from '../utils/stats'
import { armIdle } from '../systems/shared/anim'
import { interrupt } from '../systems/shared/ability'
import { attachDrive, detachDrive, npcOutline } from './enemy'
import { STANDARD } from '../utils/pass'
import { hoverPx } from '../utils/ground'
import { equipAbility, unequipAbilities } from './ability'
import { armCarriers } from './loadout'
import type { Effect } from '../../types/abilityDefs'
import type { FormDef } from '../../types/enemies'
import type { Sim } from '../sim'

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

/** 非玩家身体当前形态的能力 */
export function npcAbilities(sim: Sim, eid: number): FormDef['abilities'] {
  const idx = formOf(sim, eid)
  const f = idx >= 0 ? enemyDef[eid]?.forms?.[idx] : undefined
  return f?.abilities ?? enemyDef[eid]?.abilities
}

/** 切形态：外观、能力、走法、属性、锚定、接触伤害一起换，没写的沿用本体；给了 ms 到时切回本体并施加 onEnd；角色的永久形态记进本局 */
export function applyForm(sim: Sim, eid: number, to: number, ms?: number, onEnd?: readonly Effect[]): void {
  const forms = formsOf(sim, eid)
  if (to >= 0 && !forms?.[to]) return
  if (!hasComponent(sim.world, eid, Form)) addComponent(sim.world, eid, Form)
  Form.until[eid] = ms === undefined ? 0 : sim.elapsedMs + ms
  formEnd[eid] = ms === undefined ? undefined : onEnd
  const char = hasComponent(sim.world, eid, Slot)
  if (char && ms === undefined) sim.run.memberForm[Slot.v[eid]!] = to
  if (Form.idx[eid] === to) return
  const was = Form.idx[eid]! >= 0 ? forms?.[Form.idx[eid]!] : undefined
  Form.idx[eid] = to
  const f = to >= 0 ? forms![to] : undefined
  relook(sim, eid, f?.emoji ?? baseLook(sim, eid))
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
  attachDrive(sim, eid, f?.drive ?? def.drive)
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
