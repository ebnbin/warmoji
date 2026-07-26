import { addComponent, addComponents, addEntity } from 'bitecs'
import { Lifetime, Owner, Ring, Tint, Transform, Zone, ZoneBurn, ZoneChill, ZoneFollow } from '../components'
import { zoneSrcName } from '../store'
import type { Sim } from '../sim'

// 区域实体：地上一块圆，进去就受影响。
//
// 地面毒圈/灼烧区与寒气光环从前是两套完全不同的东西——前者是模块级数组 + 每块一个
// Phaser Graphics + 两条 tween，后者是每帧清空重建的 sim.frameSlowZones + 场景侧一池
// Arc 按帧表对帐。其实它们是同一个概念的两个实例，差别只在三个正交旋钮：
//
// · **锚在哪**：静止在落点（毒圈） / 跟着某个实体走（光环 → ZoneFollow）
// · **活多久**：到点退场（durationMs → Lifetime） / 随造它的武器在（durationMs=0）
// · **进去了怎么样**：掉血（ZoneBurn） / 减速（ZoneChill），都挂上就都生效
//
// 视觉是通用的 Ring 组件（静止档：半径与透明度由 zones.ts 写），于是入场缩放、
// 到期淡出、跟随挪位全都落在实体自己身上——没有任何需要配对销毁的游离对象。
// 逐帧推进在 ../zones.ts。

/** 一块区域的落地参数 */
export interface ZoneSpec {
  x: number
  y: number
  /** 作用半径(px) */
  radius: number
  /** 它属于哪一侧:效果只落在对面 */
  faction: number
  /** 存活时长(ms);0 = 不按时限退场(跟随型随武器走) */
  durationMs: number
  /** 入场缩放时长(ms);0 = 直接到位 */
  enterMs: number
  /** 视觉 */
  color: number
  fillAlpha: number
  lineAlpha: number
  lineWidth: number
  /** 进去掉血:每 tickMs 一跳(srcName 给敌方区,战报按敌人名归属) */
  burn?: { damage: number; tickMs: number; srcSlot: number; srcName: string }
  /** 进去减速:移速 ×factor */
  chill?: { factor: number }
  /** 跟着 of 走(位姿每帧抄它);owner = 造它的那件武器(开关随它的出手闸门、随它一并回收) */
  follow?: { of: number; owner: number }
}

/** 铺一块区域 */
export function spawnZone(sim: Sim, spec: ZoneSpec): number {
  const world = sim.world
  const eid = addEntity(world)
  addComponents(world, eid, Zone, Transform, Tint, Ring, Lifetime)
  Zone.radius[eid] = spec.radius
  Zone.faction[eid] = spec.faction
  Zone.enterMs[eid] = spec.enterMs
  Zone.on[eid] = 1
  Transform.x[eid] = spec.x
  Transform.y[eid] = spec.y
  Transform.rot[eid] = 0
  Transform.w[eid] = 0
  Transform.h[eid] = 0
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = 1
  // 静止档的圈:半径与整体透明度由 zones.ts 每帧写(入场缩放 / 到期淡出)
  Ring.color[eid] = spec.color
  Ring.radius[eid] = spec.radius * (spec.enterMs > 0 ? 0.3 : 1)
  Ring.fillAlpha[eid] = spec.fillAlpha
  Ring.lineAlpha[eid] = spec.lineAlpha
  Ring.lineWidth[eid] = spec.lineWidth
  Ring.born[eid] = sim.fxMs
  Ring.dy[eid] = 0
  Ring.z[eid] = 2 // 铺在地上:压在一切单位之下
  Ring.breathe[eid] = 0
  Lifetime.until[eid] = spec.durationMs > 0 ? sim.elapsedMs + spec.durationMs : 0
  if (spec.burn) {
    addComponent(world, eid, ZoneBurn)
    ZoneBurn.damage[eid] = spec.burn.damage
    ZoneBurn.tickMs[eid] = spec.burn.tickMs
    ZoneBurn.nextAt[eid] = sim.elapsedMs + spec.burn.tickMs
    ZoneBurn.srcSlot[eid] = spec.burn.srcSlot
    zoneSrcName[eid] = spec.burn.srcName
  }
  if (spec.chill) {
    addComponent(world, eid, ZoneChill)
    ZoneChill.factor[eid] = spec.chill.factor
  }
  if (spec.follow) {
    addComponents(world, eid, ZoneFollow, Owner)
    ZoneFollow.of[eid] = spec.follow.of
    Owner.eid[eid] = spec.follow.owner
  }
  return eid
}
