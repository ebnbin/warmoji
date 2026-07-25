import { addComponent, addEntity, query, removeEntity } from 'bitecs'
import { UNIT } from '../core/units'
import { norm } from '../core/vec'
import { playSfx } from '../audio/sfx'
import { PICKUP, PICKUPS } from '../data/pickups'
import {
  Alive,
  Coin,
  COIN_SET,
  Depth,
  Hurt,
  Pop,
  Quad,
  Sprite,
  Tint,
  Transform,
  Vel,
} from './components'
import { backEaseOut } from './ease'
import type { Sim } from './sim'
import type { EcsAtlas } from './render/atlas'

// 拾取经济(镜像 pickups.ts):金币生成 / 磁吸 / 入账。金币是 emoji 精灵,天然走统一批绘。
// 磁吸与入账以队伍中心为基点(队员碰到也捡);闲置漂移/世界回收交由世界钩子(奔流随波逐流)。

/** 掉落弹出时长(镜像 spawnCoins 的 tween duration) */
const COIN_POP_MS = 160

/** 生成 count 枚金币(镜像 spawnCoins:多枚散开 + 入场 Back.easeOut 弹出) */
export function spawnCoinsEcs(sim: Sim, atlas: EcsAtlas, x: number, y: number, count: number): void {
  const size = PICKUPS.coin.size * UNIT
  const frame = atlas.index(PICKUPS.coin.emoji, 'player')
  for (let i = 0; i < count; i++) {
    const jx = count > 1 ? (sim.rng.next() - 0.5) * 0.6 * UNIT : 0
    const jy = count > 1 ? (sim.rng.next() - 0.5) * 0.6 * UNIT : 0
    // 落点交给世界钩子(浮冰:钳进冰面,免得漂进水里隔着掉血区捡不回)
    const p = sim.hooks.constrainCoin(sim, x + jx, y + jy)
    const eid = addEntity(sim.world)
    addComponent(sim.world, eid, Coin)
    addComponent(sim.world, eid, Transform)
    addComponent(sim.world, eid, Vel)
    addComponent(sim.world, eid, Sprite)
    addComponent(sim.world, eid, Tint)
    addComponent(sim.world, eid, Depth)
    Transform.x[eid] = p.x
    Transform.y[eid] = p.y
    Transform.rot[eid] = 0
    Transform.w[eid] = size
    Transform.h[eid] = size
    Vel.x[eid] = 0
    Vel.y[eid] = 0
    Sprite.frame[eid] = frame
    Sprite.flipX[eid] = 0
    Tint.color[eid] = 0xffffff
    Tint.effect[eid] = 0
    Tint.alpha[eid] = 1
    Depth.z[eid] = 3
    Quad.v[eid] = 0
    Pop.until[eid] = sim.fxMs + COIN_POP_MS // 掉落弹出(镜像 spawnCoins 的 Back.easeOut 缩放,走视觉时钟)
  }
}

/** 场景侧排空本帧待落地金币(需 atlas) */
export function drainPendingCoins(sim: Sim, atlas: EcsAtlas): void {
  if (sim.pendingCoins.length === 0) return
  for (const c of sim.pendingCoins) spawnCoinsEcs(sim, atlas, c.x, c.y, c.count)
  sim.pendingCoins.length = 0
}

/** 逐帧磁吸 + 入账(镜像 magnetCoins:中心磁吸;入账半径内 / 队员近身即入账 +1 币) */
export function magnetCoinsEcs(sim: Sim, delta: number): void {
  const coins = query(sim.world, COIN_SET as unknown as object[])
  if (coins.length === 0) return
  const dt = delta / 1000
  const cx = sim.center.x
  const cy = sim.center.y
  const r2 = sim.reward.magnetRadius * sim.reward.magnetRadius
  const collect = PICKUP.collectRadius * UNIT
  const collect2 = collect * collect
  const speed = PICKUP.magnetSpeed * UNIT
  updateCoinPop(sim)
  for (const eid of coins) {
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    // 磁力回旋镖优先:镖旁的金币直接入账,省去飞回中心的路程
    if (sim.frameAttractors.length > 0) {
      let taken = false
      for (const a of sim.frameAttractors) {
        const ad = sim.hooks.worldDelta(sim, x, y, a.x, a.y)
        if (ad.x * ad.x + ad.y * ad.y <= a.r2) {
          collectCoinEcs(sim, eid)
          taken = true
          break
        }
      }
      if (taken) continue
    }
    // 磁吸方向/距离走世界钩子(环面取最短差:隔着传送门也吸得到)
    const w = sim.hooks.worldDelta(sim, x, y, cx, cy)
    const dx = w.x
    const dy = w.y
    const dist2 = dx * dx + dy * dy
    // 入账:近队伍中心(collectRadius) 或 蹭到任一活着队员的身子。
    // 队员侧口径对齐旧 overlap(memberGroup, coins):队员受击圆 + 金币体半径的圆-圆,
    // 故受保护中心(受击圆减半)的捡币范围也随之小一圈,与旧实现一致
    if (dist2 <= collect2 || nearAliveMember(sim, x, y)) {
      collectCoinEcs(sim, eid)
      continue
    }
    // 闲置速度交给世界钩子(奔流:随波逐流;其余图静止);磁吸速度叠在它之上
    const idle = sim.hooks.coinIdleVelocity(sim)
    if (dist2 < r2) {
      const dir = norm(dx, dy)
      Vel.x[eid] = dir.x * speed + idle.x
      Vel.y[eid] = dir.y * speed + idle.y
    } else {
      Vel.x[eid] = idle.x
      Vel.y[eid] = idle.y
    }
    // 落点过世界钩子:只回绕不钳制——旧实现生成时钳一次,此后交物理积分自由飞
    const moved = sim.hooks.wrap(sim, x + Vel.x[eid]! * dt, y + Vel.y[eid]! * dt)
    const nx = moved.x
    const ny = moved.y
    Transform.x[eid] = nx
    Transform.y[eid] = ny
    // 世界回收(奔流:漂出下游即被河水冲走)
    if (sim.hooks.cullCoin(sim, nx, ny)) removeEntity(sim.world, eid)
  }
}

/** 掉落弹入:0.3 → 1 的 Back.easeOut 缩放(纯视觉,与位移无关)。
 * 单独成函数是因为它在旧实现里是 tween——波末过场冻结期照样要播完 */
export function updateCoinPop(sim: Sim): void {
  const size = PICKUPS.coin.size * UNIT
  for (const eid of query(sim.world, COIN_SET as unknown as object[])) {
    const popLeft = Pop.until[eid]! - sim.fxMs
    if (popLeft > 0) {
      const k = size * (0.3 + 0.7 * backEaseOut(1 - popLeft / COIN_POP_MS))
      Transform.w[eid] = k
      Transform.h[eid] = k
    } else if (Transform.w[eid] !== size) {
      Transform.w[eid] = size
      Transform.h[eid] = size
    }
  }
}

/** 金币是否蹭到了任一活着队员(圆-圆:队员受击圆 + 金币体半径,镜像旧 overlap) */
function nearAliveMember(sim: Sim, x: number, y: number): boolean {
  const cr = PICKUPS.coin.radius * UNIT
  for (const m of sim.members) {
    if (!Alive.v[m]) continue
    const rr = Hurt.radius[m]! + cr
    const d = sim.hooks.worldDelta(sim, x, y, Transform.x[m]!, Transform.y[m]!)
    if (d.x * d.x + d.y * d.y <= rr * rr) return true
  }
  return false
}

/** 入账一枚(镜像 collectCoin:拾取金爆 + 音效 + run.coins+1) */
function collectCoinEcs(sim: Sim, eid: number): void {
  sim.pendingBursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 4, kind: 'coin' })
  playSfx('coin')
  sim.run.coins += 1
  removeEntity(sim.world, eid)
}
