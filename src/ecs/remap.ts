import { query } from 'bitecs'
import { remapPoint, remapVector, isHorizontal } from '../war/remap'
import { COIN_SET, EDir, ENEMY_SET, EPROJ_SET, Follow, Kv, PROJ_SET, Transform, Vel } from './components'
import { remapFieldEcs } from './field'
import { remapGroundEffectsEcs } from './groundEffects'
import type { Sim } from './sim'
import type { Point } from '../util/vec'

// 视口横竖切换/尺寸变化时的世界重映射(仅单屏图:奔流/工厂——它们的世界尺寸由视口推出)。
// 位置按「长轴进度 + 跨轴偏移」映射,速度/朝向随坐标系旋转;几何在 war/remap,与旧图共用一份。

/** 把整局仿真从旧视口尺寸搬到新视口尺寸(队伍中心/跟随点/敌人/弹体/金币/预告点) */
export function remapSim(sim: Sim, fromW: number, fromH: number, toW: number, toH: number): void {
  const fromH0 = isHorizontal(fromW, fromH)
  const toH0 = isHorizontal(toW, toH)
  const map = (x: number, y: number): Point => remapPoint({ x, y }, fromW, fromH, toW, toH)
  const rot = (x: number, y: number): Point => remapVector({ x, y }, fromH0, toH0)

  const c = map(sim.center.x, sim.center.y)
  sim.center.x = c.x
  sim.center.y = c.y
  const tv = rot(sim.teamVx, sim.teamVy)
  sim.teamVx = tv.x
  sim.teamVy = tv.y

  for (const m of sim.members) {
    const p = map(Follow.x[m]!, Follow.y[m]!)
    const v = rot(Follow.vx[m]!, Follow.vy[m]!)
    Follow.x[m] = p.x
    Follow.y[m] = p.y
    Follow.vx[m] = v.x
    Follow.vy[m] = v.y
    Transform.x[m] = p.x
    Transform.y[m] = p.y
  }

  const movePos = (eid: number): void => {
    const p = map(Transform.x[eid]!, Transform.y[eid]!)
    Transform.x[eid] = p.x
    Transform.y[eid] = p.y
  }
  const moveVel = (eid: number): void => {
    const v = rot(Vel.x[eid]!, Vel.y[eid]!)
    Vel.x[eid] = v.x
    Vel.y[eid] = v.y
  }
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    movePos(eid)
    const d = rot(EDir.x[eid]!, EDir.y[eid]!)
    EDir.x[eid] = d.x
    EDir.y[eid] = d.y
    const k = rot(Kv.x[eid]!, Kv.y[eid]!)
    Kv.x[eid] = k.x
    Kv.y[eid] = k.y
  }
  for (const set of [PROJ_SET, EPROJ_SET, COIN_SET]) {
    for (const eid of query(sim.world, set as unknown as object[])) {
      movePos(eid)
      moveVel(eid)
    }
  }
  // 预告中的落点(标记视觉由场景侧按 pendingSpawns 对帐,自然跟位)
  for (const p of sim.pendingSpawns) {
    const q = map(p.x, p.y)
    p.x = q.x
    p.y = q.y
  }
  // 地面效果区与地面待拾物(模块级列表,连同它们的视觉一起挪)
  remapGroundEffectsEcs(map)
  remapFieldEcs(map)
}
