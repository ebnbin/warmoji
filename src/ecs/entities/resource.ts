import { addComponent } from 'bitecs'
import { Res } from '../components'
import { resDef } from '../store'
import type { ResourceDef } from '../../types/enemies'
import type { EcsWorld } from '../world'

/** 给身体挂上资源：角色与敌人同一条；kept 是上一波留下来的值，-1 是没有 */
export function attachResource(world: EcsWorld, eid: number, def: ResourceDef | undefined, kept = -1): void {
  if (!def) return
  addComponent(world, eid, Res)
  Res.max[eid] = def.max
  Res.v[eid] = def.keep && kept >= 0 ? kept : (def.start ?? 0)
  Res.lock[eid] = 0
  Res.lastGain[eid] = 0
  resDef[eid] = def
}
