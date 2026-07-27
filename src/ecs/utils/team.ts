import { Transform } from '../components'
import type { Point } from '../../util/vec'
import type { Sim } from '../sim'

// 队伍中心即队长实体的位置。
//
// 从前它是 Sim 上一个独立的 center 字段，而队长实体自己也挂着 Transform——
// spawnCaptain 写过一次，此后再没人更新。于是队长身上带着一个从第 1 帧起就在说谎
// 的位置组件；没出事只是因为没人读它（磁吸半径读 Magnet、移速读 MoveSpeed，位置
// 一律读 sim.center）。同一件事两处存放，其中一处永远是错的。
//
// 现在只留一处真相。将来一局多队长（每队一个中心）时，这几个访问器改成按队长取
// 即可；`sim.center` 那种全局单值是改不动的。

export function centerX(sim: Sim): number {
  return Transform.x[sim.captain]!
}

export function centerY(sim: Sim): number {
  return Transform.y[sim.captain]!
}

/** 队伍中心的一份拷贝（整点传参的地方用；逐帧热路径请直接用 centerX/centerY） */
export function teamCenter(sim: Sim): Point {
  return { x: centerX(sim), y: centerY(sim) }
}

export function setCenter(sim: Sim, x: number, y: number): void {
  Transform.x[sim.captain] = x
  Transform.y[sim.captain] = y
}
