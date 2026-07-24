import { addComponent, addEntity, query } from 'bitecs'
import { norm } from '../core/vec'
import { ELITE } from '../enemies/registry'
import type { EnemyDef } from '../enemies/registry'
import {
  Alive,
  Boss,
  Depth,
  Elite,
  Enemy,
  ENEMY_SET,
  EState,
  Hp,
  Speed,
  Sprite,
  Tint,
  Transform,
} from './components'
import { enemyDef } from './store'
import type { Sim } from './sim'
import type { EcsWorld } from './world'
import type { EcsAtlas } from './render/atlas'
import type { Point } from '../core/vec'

// 敌人(P3):装配 + 转向。P3a 先做 chase(直奔最近活着的队员)+ 有界钳制;
// 全部 locomotion/状态机/战斗/死亡效果在后续增量追加。

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

/** 装配一个敌人实体(px 化 def),返回 eid */
export function spawnEnemy(
  world: EcsWorld,
  atlas: EcsAtlas,
  def: EnemyDef,
  x: number,
  y: number,
  hp: number,
  elite: boolean,
  boss: boolean,
): number {
  const outline = elite || boss ? 'elite' : 'enemy'
  const size = def.size * (elite ? ELITE.sizeMul : 1)
  const eid = addEntity(world)
  addComponent(world, eid, Enemy)
  addComponent(world, eid, Transform)
  addComponent(world, eid, Speed)
  addComponent(world, eid, Hp)
  addComponent(world, eid, EState)
  addComponent(world, eid, Elite)
  addComponent(world, eid, Boss)
  addComponent(world, eid, Sprite)
  addComponent(world, eid, Tint)
  addComponent(world, eid, Depth)
  Transform.x[eid] = x
  Transform.y[eid] = y
  Transform.rot[eid] = 0
  Transform.w[eid] = size
  Transform.h[eid] = size
  Speed.v[eid] = def.speed
  Hp.v[eid] = hp
  Hp.max[eid] = hp
  const lm = def.locomotion
  EState.v[eid] = lm.kind === 'dash' && lm.idle === 'chase' ? 1 : 0
  Elite.v[eid] = elite ? 1 : 0
  Boss.v[eid] = boss ? 1 : 0
  Sprite.frame[eid] = atlas.index(def.emoji, outline)
  Sprite.flipX[eid] = 0
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = 1
  Depth.z[eid] = boss ? 7 : 5
  enemyDef[eid] = def
  return eid
}

/** 最近活着的队员位置(镜像 nearestAlive) */
function nearestAlive(sim: Sim, x: number, y: number): Point | null {
  let best = -1
  let bestD = Infinity
  for (const eid of sim.members) {
    if (!Alive.v[eid]) continue
    const dx = Transform.x[eid]! - x
    const dy = Transform.y[eid]! - y
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      best = eid
    }
  }
  return best >= 0 ? { x: Transform.x[best]!, y: Transform.y[best]! } : null
}

/** 把敌人位置汇入 frameTargets(供队伍 orbit/游移门控) */
export function updateFrameTargets(sim: Sim): void {
  const eids = query(sim.world, ENEMY_SET as unknown as object[])
  const out: Point[] = []
  for (const eid of eids) out.push({ x: Transform.x[eid]!, y: Transform.y[eid]! })
  sim.frameTargets = out
}

/** 敌人转向(P3a:chase)——直奔最近活着的队员,有界钳制。delta 为真实帧长(ms) */
export function steerEnemies(sim: Sim, delta: number): void {
  const eids = query(sim.world, ENEMY_SET as unknown as object[])
  if (eids.length === 0) return
  const dt = delta / 1000
  for (const eid of eids) {
    const target = nearestAlive(sim, Transform.x[eid]!, Transform.y[eid]!)
    if (!target) continue
    const dir = norm(target.x - Transform.x[eid]!, target.y - Transform.y[eid]!)
    const step = Speed.v[eid]! * dt
    Transform.x[eid] = clamp(Transform.x[eid]! + dir.x * step, 0, sim.mapW)
    Transform.y[eid] = clamp(Transform.y[eid]! + dir.y * step, 0, sim.mapH)
  }
}
