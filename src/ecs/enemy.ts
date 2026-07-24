import { addComponent, addEntity, query } from 'bitecs'
import { norm } from '../core/vec'
import { AI, ELITE } from '../enemies/registry'
import type { EnemyDef } from '../enemies/registry'
import { KNOCKBACK } from '../abilities/registry'
import { UNIT } from '../core/units'
import {
  Alive,
  Boss,
  Depth,
  DmgMul,
  EDir,
  Elite,
  Enemy,
  ENEMY_SET,
  EState,
  ETurn,
  Flash,
  Hp,
  Kv,
  Radius,
  Speed,
  Sprite,
  Tint,
  Transform,
} from './components'
import { enemyDef } from './store'
import type { Sim } from './sim'
import type { EcsAtlas } from './render/atlas'
import type { Point } from '../core/vec'

// 敌人(P3):装配 + 转向。P3a 先做 chase(直奔最近活着的队员)+ 有界钳制;
// 全部 locomotion/状态机/战斗/死亡效果在后续增量追加。

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

/** 装配一个敌人实体(px 化 def),返回 eid */
export function spawnEnemy(
  sim: Sim,
  atlas: EcsAtlas,
  def: EnemyDef,
  x: number,
  y: number,
  hp: number,
  elite: boolean,
  boss: boolean,
): number {
  const world = sim.world
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
  addComponent(world, eid, Radius)
  addComponent(world, eid, DmgMul)
  addComponent(world, eid, Kv)
  addComponent(world, eid, Flash)
  addComponent(world, eid, EDir)
  addComponent(world, eid, ETurn)
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
  Radius.v[eid] = def.radius
  DmgMul.v[eid] = elite ? ELITE.damageMul : 1
  Kv.x[eid] = 0
  Kv.y[eid] = 0
  Flash.until[eid] = 0
  // 游荡初始方向 + 首次换向(镜像 materializeEnemy 的随机相/换向计时)
  const ang = sim.rng.next() * Math.PI * 2
  EDir.x[eid] = Math.cos(ang)
  EDir.y[eid] = Math.sin(ang)
  ETurn.at[eid] = sim.elapsedMs + AI.wander.spawnTurnMinMs + sim.rng.next() * AI.wander.spawnTurnJitterMs
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

/** 游荡方向(镜像 ArenaScene.wanderDir:换向计时 + 撞边折返;断壁在 P5) */
function wanderDir(sim: Sim, eid: number): Point {
  if (sim.elapsedMs >= ETurn.at[eid]!) {
    const ang = sim.rng.next() * Math.PI * 2
    EDir.x[eid] = Math.cos(ang)
    EDir.y[eid] = Math.sin(ang)
    ETurn.at[eid] = sim.elapsedMs + AI.wander.turnMinMs + sim.rng.next() * AI.wander.turnJitterMs
  }
  let dx = EDir.x[eid]!
  let dy = EDir.y[eid]!
  const margin = 0.6 * UNIT
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  if ((x < margin && dx < 0) || (x > sim.mapW - margin && dx > 0)) dx = -dx
  if ((y < margin && dy < 0) || (y > sim.mapH - margin && dy > 0)) dy = -dy
  EDir.x[eid] = dx
  EDir.y[eid] = dy
  return { x: dx, y: dy }
}

/** 敌人转向:按 locomotion 分发(chase/wander/static;dash/detonate/standoff/coinThief/baseOrbit
 * 暂回落 chase,P3e 补)+ 击退衰减 + 受击白闪恢复。delta 为真实帧长(ms) */
export function steerEnemies(sim: Sim, delta: number): void {
  const eids = query(sim.world, ENEMY_SET as unknown as object[])
  if (eids.length === 0) return
  const dt = delta / 1000
  const now = sim.elapsedMs
  const decay = Math.exp(-delta / KNOCKBACK.tauMs) // forest knockbackTauMul=1
  for (const eid of eids) {
    // 受击白闪到时恢复
    if (Flash.until[eid] !== 0 && now >= Flash.until[eid]!) {
      Flash.until[eid] = 0
      Tint.effect[eid] = 0
      Tint.color[eid] = 0xffffff
    }
    let tx = Transform.x[eid]!
    let ty = Transform.y[eid]!
    const kind = enemyDef[eid]?.locomotion.kind ?? 'chase'
    const speed = Speed.v[eid]!
    if (kind === 'static') {
      // 原地不动
    } else if (kind === 'wander') {
      const d = wanderDir(sim, eid)
      tx += d.x * speed * dt
      ty += d.y * speed * dt
    } else {
      // chase + 回落:直奔最近活着队员
      const target = nearestAlive(sim, tx, ty)
      if (target) {
        const dir = norm(target.x - tx, target.y - ty)
        tx += dir.x * speed * dt
        ty += dir.y * speed * dt
      }
    }
    // 击退冲量:叠进位移后指数衰减(镜像 decayKnockback)
    const kvx = Kv.x[eid]!
    const kvy = Kv.y[eid]!
    if (kvx !== 0 || kvy !== 0) {
      tx += kvx * dt
      ty += kvy * dt
      if ((kvx * kvx + kvy * kvy) * decay * decay < 100) {
        Kv.x[eid] = 0
        Kv.y[eid] = 0
      } else {
        Kv.x[eid] = kvx * decay
        Kv.y[eid] = kvy * decay
      }
    }
    Transform.x[eid] = clamp(tx, 0, sim.mapW)
    Transform.y[eid] = clamp(ty, 0, sim.mapH)
  }
}
