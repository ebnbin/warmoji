import { addComponents, addEntity } from 'bitecs'
import { Due, Meteor } from '../components'
import { meteorHit } from '../store'
import { attachDrawable } from './drawable'
import type { Sim } from '../sim'

// 天体横扫实体（深空图）：一次横扫 = 一颗实体。
//
// 从前它是 worldState.meteor 这个对象，视觉靠场景侧 `meteorFx: { of: Meteor, tele, sphere }`
// ——**拿对象引用跟仿真侧对帐**（`fx.of !== m` 即判定「换了一次新的」）。那正是 eid 的用途。
//
// 🪐 球体就是这颗实体自己的贴图（预警期 alpha=0，起划才现身），走 z=60 那条深度带，
// 与旧实现的 setDepth(60) 同层。预警车道仍是场景侧的 Graphics——它是一条粗线段不是贴图，
// 批绘不了；但它的生灭现在由 eid 决定，不再靠对象引用。

/** 排一次横扫：warnMs 之后从 (sx,sy) 起划向 (ex,ey) */
export function spawnMeteor(
  sim: Sim,
  s: { sx: number; sy: number; ex: number; ey: number },
  warnMs: number,
  size: number,
): number {
  const eid = addEntity(sim.world)
  addComponents(sim.world, eid, Meteor, Due)
  Meteor.sx[eid] = s.sx
  Meteor.sy[eid] = s.sy
  Meteor.ex[eid] = s.ex
  Meteor.ey[eid] = s.ey
  Meteor.t[eid] = 0
  Due.at[eid] = sim.elapsedMs + warnMs
  meteorHit[eid] = new Set()
  attachDrawable(sim.world, eid, sim.frames, {
    id: '1fa90',
    outline: 'player',
    x: s.sx,
    y: s.sy,
    size,
    alpha: 0, // 预警期不现身，起划才由 tick 拉到 1
    z: 60,
  })
  return eid
}
