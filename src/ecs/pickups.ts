import { addComponent, query, removeEntity } from 'bitecs'
import { UNIT } from '../util/units'
import { norm } from '../util/vec'
import { playSfx } from '../audio/sfx'
import { PICKUP, PICKUPS } from '../data/pickups'
import { FIELD, POLARITY_COLOR } from '../data/battlefield'
import { foldBattleEffects } from '../war/battleFx'
import {
  Alive,
  Bob,
  Enemy,
  Grab,
  Hurt,
  Lifetime,
  Magnet,
  MFlash,
  PICKUP_SET,
  Pickup,
  Pop,
  Pull,
  Ring,
  Tint,
  Transform,
  Vel,
} from './components'
import { backEaseOut } from './ease'
import { enemyCarries, pickupDef } from './store'
import { spawnPickup } from './entities/pickup'
import type { PickupSpec } from './entities/pickup'
import type { Sim } from './sim'
import type { FieldPickupDef } from '../types/battlefield'

// 拾取物管线:一条。落地待拾 → (可选)磁吸向队伍中心 → 进拾取圈到手 → 触发它那一种效果,
// 外加入场弹出 / 待拾缓浮 / 到期淡出这些与种类无关的杂事。
//
// 「不同的拾取给不同的东西」是唯一的分歧点,故收在 PICKUP_KINDS 一处:
// **新增一种拾取 = 在这张表里加一行(落地参数 + 到手效果),管线一行不用碰。**
// 金币与战场增/减益此前是两套东西(前者 ECS 实体、后者游离的 Phaser 对象 + 模块级数组),
// 现在只是这张表里的两行。

/** 地面到期前的渐隐时长(ms) */
const FADE_MS = 250

/** 到手效果的分派键;下标即 Pickup.kind */
export const COIN = 0
export const FIELD_BUFF = 1

/** 一种拾取物:怎么落地(spec)+ 到手干什么(collect) */
interface PickupKind {
  /** 落地参数:def 是该枚的载荷(金币无载荷) */
  spec(sim: Sim, def: FieldPickupDef | undefined): PickupSpec
  /** 到手效果:此刻实体还在,Transform 可读;回收由管线负责 */
  collect(sim: Sim, eid: number): void
}

const PICKUP_KINDS: readonly PickupKind[] = [
  // ── 金币:磁吸入账,永久经济 ──
  {
    spec: (sim) => ({
      kind: COIN,
      emoji: PICKUPS.coin.emoji,
      size: PICKUPS.coin.size * UNIT,
      z: 3,
      // 磁吸范围随队长/道具走(Magnet 挂在队长身上)
      pull: Magnet.radius[sim.captain]!,
      grab: PICKUP.collectRadius * UNIT,
      groundMs: 0,
      popMs: 160,
      bob: 0,
    }),
    collect: (sim, eid) => {
      sim.pendingBursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 4, kind: 'coin' })
      playSfx('coin')
      sim.run.coins += 1
    },
  },
  // ── 战场增/减益:不磁吸(需主动走位,增益去趋、减益去避),短时,施加一层限时乘区 ──
  {
    spec: (_sim, def) => ({
      kind: FIELD_BUFF,
      emoji: def!.emoji,
      size: 0.85 * UNIT,
      z: 6,
      pull: 0,
      grab: FIELD.grabRadiusU * UNIT,
      groundMs: FIELD.groundMs,
      popMs: 180,
      bob: 6,
      ring: { color: POLARITY_COLOR[def!.polarity], radius: FIELD.grabRadiusU * UNIT, fillAlpha: 0.12, z: 3 },
      def,
    }),
    collect: (sim, eid) => {
      const def = pickupDef[eid]!
      const color = POLARITY_COLOR[def.polarity]
      sim.pendingBursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 10, kind: 'coin' })
      playSfx(def.polarity === 'buff' ? 'levelup' : 'hurt')
      applyBattleMod(sim, def)
      sim.pendingCollects.push(def)
      // 到手反馈:全队闪一下极性色。走受击闪光同一通道——否则队员视觉每帧把染色抹回常态,
      // 只闪得到一帧
      for (const m of sim.members) {
        if (!Alive.v[m]) continue
        MFlash.until[m] = sim.elapsedMs + 300
        Tint.color[m] = color
        Tint.effect[m] = 0
      }
    },
  },
]

/** 落一枚金币(可多枚散开) */
export function dropCoins(sim: Sim, x: number, y: number, count: number): void {
  const spec = PICKUP_KINDS[COIN]!.spec(sim, undefined)
  for (let i = 0; i < count; i++) {
    const jx = count > 1 ? (sim.rng.next() - 0.5) * 0.6 * UNIT : 0
    const jy = count > 1 ? (sim.rng.next() - 0.5) * 0.6 * UNIT : 0
    spawnPickup(sim, x + jx, y + jy, spec)
  }
}

/** 落一枚战场增/减益(携带者死亡处) */
export function dropFieldPickup(sim: Sim, x: number, y: number, def: FieldPickupDef): void {
  spawnPickup(sim, x, y, PICKUP_KINDS[FIELD_BUFF]!.spec(sim, def))
}

/** 给携带者敌人挂上极性光环(实体自带的圈:敌人没了圈自然跟着没,不必对帐销毁) */
export function attachCarrierRing(sim: Sim, eid: number, def: FieldPickupDef): void {
  addComponent(sim.world, eid, Ring)
  Ring.color[eid] = POLARITY_COLOR[def.polarity]
  Ring.radius[eid] = FIELD.auraRadiusU * UNIT
  Ring.fillAlpha[eid] = 0.18
  Ring.lineAlpha[eid] = 0.9
  Ring.lineWidth[eid] = 3
  Ring.born[eid] = sim.fxMs
  Ring.dy[eid] = 0
  Ring.z[eid] = 4
  Ring.breathe[eid] = 1
}

/** 施加一层限时效果:同 id 只刷新计时不叠加,随即重折乘区 */
function applyBattleMod(sim: Sim, def: FieldPickupDef): void {
  sim.battleMods = sim.battleMods.filter((m) => m.id !== def.id)
  sim.battleMods.push({
    id: def.id,
    emoji: def.emoji,
    polarity: def.polarity,
    until: sim.elapsedMs + def.durationMs,
    totalMs: def.durationMs,
    fx: def.fx,
  })
  sim.battleFx = foldBattleEffects(sim.battleMods.map((m) => m.fx))
}

/** 逐帧:磁吸 → 拾取 → 到期回收,外加入场弹出与待拾缓浮 */
export function updatePickups(sim: Sim, delta: number): void {
  const eids = query(sim.world, PICKUP_SET as unknown as object[])
  if (eids.length === 0) return
  const dt = delta / 1000
  const now = sim.elapsedMs
  const cx = sim.center.x
  const cy = sim.center.y
  for (const eid of eids) {
    animate(sim, eid)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    // 磁力回旋镖优先:镖旁的拾取物直接到手,省去飞回中心的路程
    if (sim.frameAttractors.length > 0 && Pull.radius[eid]! > 0) {
      let taken = false
      for (const a of sim.frameAttractors) {
        const ad = sim.hooks.worldDelta(sim, x, y, a.x, a.y)
        if (ad.x * ad.x + ad.y * ad.y <= a.r2) {
          take(sim, eid)
          taken = true
          break
        }
      }
      if (taken) continue
    }
    // 方向/距离走世界钩子(环面取最短差:隔着传送门也吸得到)
    const w = sim.hooks.worldDelta(sim, x, y, cx, cy)
    const dist2 = w.x * w.x + w.y * w.y
    // 到手:近队伍中心(拾取半径) 或 蹭到任一活着队员的身子(仅磁吸类——战场拾取要的就是走位)
    const grab = Grab.radius[eid]!
    if (dist2 <= grab * grab || (Pull.radius[eid]! > 0 && nearAliveMember(sim, x, y))) {
      take(sim, eid)
      continue
    }
    // 到期:末段渐隐再回收(圈随 Tint.alpha 一起淡,见 render/rings.ts)
    if (Lifetime.until[eid]! > 0) {
      const left = Lifetime.until[eid]! - now
      if (left <= 0) {
        removeEntity(sim.world, eid)
        continue
      }
      if (left < FADE_MS) Tint.alpha[eid] = left / FADE_MS
    }
    if (Pull.radius[eid]! === 0) continue
    // 闲置速度交给世界钩子(奔流:随波逐流;其余图静止);磁吸速度叠在它之上
    const idle = sim.hooks.coinIdleVelocity(sim)
    const pull = Pull.radius[eid]!
    if (dist2 < pull * pull) {
      const dir = norm(w.x, w.y)
      Vel.x[eid] = dir.x * PICKUP.magnetSpeed * UNIT + idle.x
      Vel.y[eid] = dir.y * PICKUP.magnetSpeed * UNIT + idle.y
    } else {
      Vel.x[eid] = idle.x
      Vel.y[eid] = idle.y
    }
    // 落点过世界钩子:只回绕不钳制——生成时钳过一次,此后交物理积分自由飞
    const moved = sim.hooks.wrap(sim, x + Vel.x[eid]! * dt, y + Vel.y[eid]! * dt)
    Transform.x[eid] = moved.x
    Transform.y[eid] = moved.y
    // 世界回收(奔流:漂出下游即被河水冲走)
    if (sim.hooks.cullCoin(sim, moved.x, moved.y)) removeEntity(sim.world, eid)
  }
}

/** 到手:跑该种类的效果,然后回收 */
function take(sim: Sim, eid: number): void {
  PICKUP_KINDS[Pickup.kind[eid]!]!.collect(sim, eid)
  pickupDef[eid] = undefined
  removeEntity(sim.world, eid)
}

/** 只推进视觉(入场弹出 / 待拾缓浮),不做磁吸与拾取:波末过场冻结期用——
 * 世界停了,但已在飞的弹入动画照旧收尾(旧实现里这是 tween 天然不受冻结影响) */
export function stepPickupVisuals(sim: Sim): void {
  for (const eid of query(sim.world, PICKUP_SET as unknown as object[])) animate(sim, eid)
}

/** 与种类无关的两桩视觉:入场弹出(0.3 → 1 的 Back.easeOut 缩放)与待拾缓浮。
 * 都走视觉钟 sim.fxMs——波末过场冻结期照样播完 */
function animate(sim: Sim, eid: number): void {
  const popLeft = Pop.until[eid]! - sim.fxMs
  const size = Pop.size[eid]!
  if (popLeft > 0) {
    const k = size * (0.3 + 0.7 * backEaseOut(1 - popLeft / Pop.ms[eid]!))
    Transform.w[eid] = k
    Transform.h[eid] = k
  } else if (Transform.w[eid] !== size) {
    Transform.w[eid] = size
    Transform.h[eid] = size
  }
  if (Bob.amp[eid]! > 0) {
    // 三角波上下缓飘;光圈按 -off 抵消,始终贴在落点(它画的是拾取圈,不该跟着飘)
    const t = (sim.fxMs % (Bob.halfMs[eid]! * 2)) / Bob.halfMs[eid]!
    const off = -Bob.amp[eid]! * (t <= 1 ? t : 2 - t)
    Transform.y[eid] = Bob.y0[eid]! + off
    Ring.dy[eid] = -off
  }
}

/** 是否蹭到了任一活着队员(圆-圆:队员受击圆 + 拾取物体半径,镜像旧 overlap)。
 * 受保护中心(受击圆减半)的捡币范围也随之小一圈,与旧实现一致 */
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

/** 在场待拾数 / 携带者数(HUD 与 e2e 探针) */
export function pickupCounts(sim: Sim): { pickups: number; carriers: number } {
  let pickups = 0
  for (const eid of query(sim.world, PICKUP_SET as unknown as object[])) {
    if (Pickup.kind[eid] === FIELD_BUFF) pickups++
  }
  let carriers = 0
  for (const eid of query(sim.world, [Enemy])) {
    if (enemyCarries[eid] !== undefined) carriers++
  }
  return { pickups, carriers }
}
