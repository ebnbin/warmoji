import { query } from 'bitecs'
import { remapPoint, remapVector, isHorizontal } from '../../utils/remap'
import { Bob, EDir, ENEMY_SET, Follow, Kv, PICKUP_SET, PROJ_SET, Telegraph, Transform, Vel, ZONE_SET } from '../../components'
import type { Sim } from '../../sim'
import type { Point } from '../../../util/vec'
import { centerX, centerY, setCenter } from '../../utils/team'

// 视口横竖切换/尺寸变化时的世界重映射(仅单屏图:奔流/工厂——它们的世界尺寸由视口推出)。
// 位置按「长轴进度 + 跨轴偏移」映射,速度/朝向随坐标系旋转;几何在 utils/remap（纯函数,不碰实体）。

/** 把整局仿真从旧视口尺寸搬到新视口尺寸(队伍中心/跟随点/敌人/弹体/金币/预告点) */
export function remapSim(sim: Sim, fromW: number, fromH: number, toW: number, toH: number): void {
  const fromH0 = isHorizontal(fromW, fromH)
  const toH0 = isHorizontal(toW, toH)
  const map = (x: number, y: number): Point => remapPoint({ x, y }, fromW, fromH, toW, toH)
  const rot = (x: number, y: number): Point => remapVector({ x, y }, fromH0, toH0)

  const c = map(centerX(sim), centerY(sim))
  setCenter(sim, c.x, c.y)
  const tv = rot(sim.worldState.vx, sim.worldState.vy)
  sim.worldState.vx = tv.x
  sim.worldState.vy = tv.y

  for (const m of sim.characters) {
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
  for (const set of [PROJ_SET, PICKUP_SET]) {
    for (const eid of query(sim.world, set as unknown as object[])) {
      movePos(eid)
      moveVel(eid)
    }
  }
  // 待拾物的缓浮基线跟着挪(下一帧重算偏移;≤6px 的相位跳变看不出)
  for (const eid of query(sim.world, PICKUP_SET as unknown as object[])) Bob.y0[eid] = Transform.y[eid]!
  // 预告中的落点(⚠ 标记就是该实体自己的贴图,挪位姿即挪标记)
  for (const eid of query(sim.world, [Telegraph, Transform])) movePos(eid)
  // 区域(地面毒圈等;跟随型下一帧自会抄回锚点位置,这里一并挪只为不闪那一帧)
  for (const eid of query(sim.world, ZONE_SET as unknown as object[])) movePos(eid)
}
