import { hasComponent, query } from 'bitecs'
import { lungeT } from '../utils/thrust'
import type { ThrustDef } from '../../types/abilityDefs'
import { Ability, AbilityRef, Aim, Followup, Frozen, Held, Owner, Swing, Tint, Transform, VisOff } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import { abilityDefAt } from '../abilityDefs'
import { KindThrust } from '../registries/abilityKinds'
import type { Sim } from '../sim'

/** 摆位：持有物沿瞄准方向挥出收回；无持有物则改推角色本体的视觉偏移 */
export function placeThrustBody(sim: Sim): void {
  for (const e of query(sim.world, [Ability, KindThrust, Aim, Swing])) {
    const def = abilityDefAt(AbilityRef.def[e]!) as ThrustDef
    const frozen = Frozen.v[e] === 1
    if (frozen) {
      // 阵亡即收势：动画归零、二连突作废（持有视觉不该悬在尸体上）
      Swing.durMs[e] = 0
      Followup.left[e] = 0
    }
    const t = frozen ? 0 : lungeT(sim, e, def.thrustMs)
    if (hasComponent(sim.world, e, Held)) {
      // 有外形：武器刺出去收回来
      const aim = Aim.rad[e]!
      const rest = Held.restOffset[e]!
      const dist = rest + t * (def.reach - rest)
      Transform.x[e] = ownerX(e) + Math.cos(aim) * dist
      Transform.y[e] = ownerY(e) + Math.sin(aim) * dist
      Transform.rot[e] = aim + Held.rotOffset[e]!
      Tint.alpha[e] = frozen ? 0 : 1
      continue
    }
    // 无外形：角色本体前冲（独角兽的独角突刺）
    const m = Owner.eid[e]!
    VisOff.x[m] = Math.cos(Aim.rad[e]!) * t * def.lungeDist
    VisOff.y[m] = Math.sin(Aim.rad[e]!) * t * def.lungeDist
  }
}
