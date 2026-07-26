import { addComponent, addComponents, addEntity } from 'bitecs'
import { Bob, Grab, Lifetime, Pickup, Pop, Pull, Ring, Vel } from '../components'
import { attachDrawable } from '../drawable'
import { pickupDef } from '../store'
import type { FieldPickupDef } from '../../types/battlefield'
import type { Sim } from '../sim'

// 拾取物实体的生成:一种实体、一个工厂。金币、战场增/减益、（将来）掉落装备走的都是
// 这一条——差异全在 PickupSpec 的几个旋钮与 kind 上,管线（磁吸/拾取/到期）一行不用改。
// 效果登记表与逐帧推进在 ../pickups.ts。

/** 一枚拾取物的落地参数:外观 + 三个管线旋钮 + 到手效果的分派键 */
export interface PickupSpec {
  /** 到手效果的分派键(PICKUP_KINDS 的下标) */
  kind: number
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
  Pickup.kind[eid] = spec.kind
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
    Ring.born[eid] = sim.fxMs
    Ring.dy[eid] = 0
    Ring.z[eid] = spec.ring.z
  }
  pickupDef[eid] = spec.def
  return eid
}
