import { addComponent, addComponents, addEntity, hasComponent, query } from 'bitecs'
import {
  Bob,
  GrantCoins,
  GrantFlash,
  GrantMod,
  Enemy,
  Grab,
  Lifetime,
  Magnet,
  Pickup,
  PICKUP_SET,
  PickupFx,
  Pop,
  Pull,
  Ring,
  Transform,
  Vel,
} from '../components'
import { attachDrawable } from './drawable'
import { enemyCarries, pickupDef, pickupSfx } from '../store'
import type { FieldPickupDef } from '../../types/battlefield'
import type { SfxId } from '../../types/sfx'
import type { Sim } from '../sim'
import { UNIT } from '../../util/units'
import { playSfx } from '../../audio/sfx'
import { PICKUP, PICKUPS } from '../../data/pickups'
import { FIELD, POLARITY_COLOR } from '../../data/battlefield'
import { backEaseOut } from '../utils/ease'

// 拾取物实体的生成:一种实体、一个工厂。金币、战场增/减益、（将来）掉落装备走的都是
// 这一条——差异全在 PickupSpec 的几个旋钮与 kind 上,管线（磁吸/拾取/到期）一行不用改。
// 效果登记表与逐帧推进在 ../pickups.ts。

/** 一枚拾取物的落地参数:外观 + 三个管线旋钮 + 到手效果的分派键 */
export interface PickupSpec {
  emoji: string
  /** 显示尺寸(px) */
  size: number
  /** 绘制深度 */
  z: number
  /** 磁吸半径(px);0 = 不磁吸 */
  pull: number
  /** 拾取半径(px) */
  grab: number
  /** 地面停留(ms);0 = 永不过期 */
  groundMs: number
  /** 入场弹出时长(ms);0 = 无 */
  popMs: number
  /** 待拾缓浮幅度(px);0 = 不浮 */
  bob: number
  /** 待拾光圈(半径即拾取半径的可视化,故与 grab 同值);省略即无圈 */
  ring?: { color: number; radius: number; fillAlpha: number; z: number }
  /** 效果需要的载荷(战场增/减益要知道自己是哪一枚) */
  def?: FieldPickupDef
  // ── 到手给什么：每种给法一个可选项，各自对应一个组件。都不给也合法（纯装饰拾取） ──
  /** 加钱 */
  coins?: number
  /** 施加一层限时乘区（用 def） */
  mod?: boolean
  /** 全队闪一下 */
  flash?: { color: number; ms: number }
  /** 爆点与音效（与上面三者正交：既给钱又给增益的也只爆一次） */
  fx?: { burst: number; sfx: SfxId }
}

/** 落一枚拾取物。落点先过世界钩子(浮冰:钳进冰面,免得漂进水里隔着掉血区捡不回) */
export function spawnPickup(sim: Sim, x: number, y: number, spec: PickupSpec): number {
  const p = sim.hooks.constrainCoin(sim, x, y)
  const eid = addEntity(sim.world)
  // Bob 恒挂(amp=0 即不浮):组件值按 eid 索引,eid 复用会读到上一位住户的残值
  addComponents(sim.world, eid, Pickup, Pull, Grab, Lifetime, Vel, Pop, Bob)
  attachDrawable(sim.world, eid, sim.frames, {
    id: spec.emoji,
    outline: 'player',
    x: p.x,
    y: p.y,
    size: spec.size,
    z: spec.z,
  })
  Pull.radius[eid] = spec.pull
  Grab.radius[eid] = spec.grab
  Lifetime.until[eid] = spec.groundMs > 0 ? sim.elapsedMs + spec.groundMs : 0
  Vel.x[eid] = 0
  Vel.y[eid] = 0
  // 入场弹出走视觉钟(波末过场冻结期照样播完);尺寸插值在 pickups.ts
  Pop.until[eid] = spec.popMs > 0 ? sim.fxMs + spec.popMs : 0
  Pop.ms[eid] = spec.popMs
  Pop.size[eid] = spec.size
  Pop.back[eid] = 1
  Pop.alpha[eid] = 1
  Bob.y0[eid] = p.y
  Bob.amp[eid] = spec.bob
  Bob.halfMs[eid] = 620
  if (spec.ring) {
    addComponent(sim.world, eid, Ring)
    Ring.color[eid] = spec.ring.color
    Ring.radius[eid] = spec.ring.radius
    Ring.fillAlpha[eid] = spec.ring.fillAlpha
    Ring.lineAlpha[eid] = 0.9
    Ring.lineWidth[eid] = 3
    Ring.born[eid] = sim.fxMs
    Ring.dy[eid] = 0
    Ring.z[eid] = spec.ring.z
    Ring.breathe[eid] = 1
  }
  pickupDef[eid] = spec.def
  pickupSfx[eid] = spec.fx?.sfx
  if (spec.coins !== undefined) {
    addComponent(sim.world, eid, GrantCoins)
    GrantCoins.n[eid] = spec.coins
  }
  if (spec.mod) addComponent(sim.world, eid, GrantMod)
  if (spec.flash) {
    addComponent(sim.world, eid, GrantFlash)
    GrantFlash.color[eid] = spec.flash.color
    GrantFlash.ms[eid] = spec.flash.ms
  }
  if (spec.fx) {
    addComponent(sim.world, eid, PickupFx)
    PickupFx.burst[eid] = spec.fx.burst
  }
  return eid
}

// ── 掉落 ──────────────────────────────────────────────────

// 拾取物管线:一条。落地待拾 → (可选)磁吸向队伍中心 → 进拾取圈到手 → 挂 Collected,
// 由各 Grant 系统各取所需,最后统一回收。外加入场弹出 / 待拾缓浮 / 到期淡出。
//
// **「到手给什么」不再是一个 kind 分派**：从前是 PICKUP_KINDS[kind].collect 一个回调，
// 金币那行写死 coins += 1、战场那行写死 applyBattleMod，于是「既给钱又给增益」的
// 拾取物无处安放。现在每种给法一个组件，要几样挂几样。

/** 金币：磁吸入账，永久经济 */
function coinSpec(sim: Sim): PickupSpec {
  return {
    emoji: PICKUPS.coin.emoji,
    size: PICKUPS.coin.size * UNIT,
    z: 3,
    // 磁吸范围随队长/道具走(Magnet 挂在队长身上)
    pull: Magnet.radius[sim.captain]!,
    grab: PICKUP.collectRadius * UNIT,
    groundMs: 0,
    popMs: 160,
    bob: 0,
    coins: 1,
    fx: { burst: 4, sfx: 'coin' },
  }
}

/** 战场增/减益：不磁吸(需主动走位，增益去趋、减益去避)，短时，施加一层限时乘区 */
function fieldSpec(def: FieldPickupDef): PickupSpec {
  const color = POLARITY_COLOR[def.polarity]
  return {
    emoji: def.emoji,
    size: 0.85 * UNIT,
    z: 6,
    pull: 0,
    grab: FIELD.grabRadiusU * UNIT,
    groundMs: FIELD.groundMs,
    popMs: 180,
    bob: 6,
    ring: { color, radius: FIELD.grabRadiusU * UNIT, fillAlpha: 0.12, z: 3 },
    def,
    mod: true,
    flash: { color, ms: 300 },
    fx: { burst: 10, sfx: def.polarity === 'buff' ? 'levelup' : 'hurt' },
  }
}

/** 落一枚金币(可多枚散开) */
export function dropCoins(sim: Sim, x: number, y: number, count: number): void {
  const spec = coinSpec(sim)
  for (let i = 0; i < count; i++) {
    const jx = count > 1 ? (sim.rng.next() - 0.5) * 0.6 * UNIT : 0
    const jy = count > 1 ? (sim.rng.next() - 0.5) * 0.6 * UNIT : 0
    spawnPickup(sim, x + jx, y + jy, spec)
  }
}

/** 落一枚战场增/减益(携带者死亡处) */
export function dropFieldPickup(sim: Sim, x: number, y: number, def: FieldPickupDef): void {
  spawnPickup(sim, x, y, fieldSpec(def))
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


/** 与种类无关的两桩视觉:入场弹出(0.3 → 1 的 Back.easeOut 缩放)与待拾缓浮。
 * 都走视觉钟 sim.fxMs——波末过场冻结期照样播完 */
export function animatePickup(sim: Sim, eid: number): void {
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

/** 在场待拾数 / 携带者数(HUD 与 e2e 探针) */
export function pickupCounts(sim: Sim): { pickups: number; carriers: number } {
  let pickups = 0
  for (const eid of query(sim.world, PICKUP_SET as unknown as object[])) {
    if (hasComponent(sim.world, eid, GrantMod)) pickups++
  }
  let carriers = 0
  for (const eid of query(sim.world, [Enemy])) {
    if (enemyCarries[eid] !== undefined) carriers++
  }
  return { pickups, carriers }
}

/** 战场掉币：落地待拾，音效与爆点随拾取管线 */
export function spawnCoins(sim: Sim, x: number, y: number, count: number): void {
  if (sim.over) return
  sim.out.bursts.push({ x, y, count: 6, kind: 'coin' })
  playSfx('coin')
  dropCoins(sim, x, y, count)
}
