import { hasComponent, removeEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { Airborne, Alive, CharScale, Drive, Hp, Motion, MOTION, Phys, Pickup, Radius, Shard, Slot, Transform, Uid } from '../components'
import { approach } from '../systems/shared/body'
import { die } from '../systems/shared/combat'
import { GRAVITY } from './channel'
import { flowAt } from './water'
import type { BodyStep } from '../systems/shared/body'
import type { Source } from '../utils/source'
import type { Flow, Water } from './water'
import type { WadeConfig } from '../../types/maps'
import type { Sim } from '../sim'

/** 水的密度，千克/米³ */
const RHO = 1000
/** 正在游的身体要水的力矩与推力都降到推得倒、推得动的这么多倍以内才站得住：比站不住时宽一点，免得在临界处一漂一站 */
const STEADY = 0.8

/** 水里的身体要的参数：一格多少米与身体的尺寸、受力 */
export interface Wading {
  readonly meterPerU: number
  readonly body: WadeConfig
}

/**
 * 水深 depth 米、水速 (wx, wy) 米/秒 的地方，半径 radius 像素、质量倍率 massMul 的身体站不站得住：质量按半径的三次方与质量倍率缩放，身高按半径缩放，体积按密度；
 * 浮力按没进水里的那截身高占的比例托起身体，脚下的压力 N = mg − 浮力；水的推力 ½ρ·Cd·迎水面积·w²，胯以下迎水的是两条腿，胯以上是整个身宽。
 * 浮起来了，推力绕脚掌的力矩大过 N 乘扶正力臂（推倒），或者推力大过 N 乘脚底的摩擦系数（滑走），就站不住；正在游的 swimming 要两样都降到 STEADY 倍以内才重新站得住
 */
export function swept(cfg: Wading, radius: number, massMul: number, depth: number, wx: number, wy: number, swimming: boolean): boolean {
  const b = cfg.body
  const k = radius / UNIT / b.radiusU
  const mass = b.kg * massMul * k ** 3
  const width = (2 * radius * cfg.meterPerU) / UNIT
  const height = b.heightM * k
  const stand = Math.min(depth, height)
  const upright = mass * GRAVITY * (1 - (RHO / b.density) * (stand / height))
  if (upright <= 0) return true
  const hip = height * b.hip
  const low = Math.min(stand, hip)
  const high = stand - low
  const legs = width * b.legs * low
  const torso = width * high
  const push = 0.5 * RHO * b.drag * (legs + torso) * (wx * wx + wy * wy)
  const arm = (legs * low * 0.5 + torso * (hip + high * 0.5)) / (legs + torso)
  const hold = upright * (swimming ? STEADY : 1)
  return push * arm > hold * height * b.lever || push > hold * b.mu
}

/** 随水漂：位置像素、速度像素/秒，速度以快慢 k 趋近水速 (wx, wy)（米/秒）加上自己相对水的速度 (dx, dy)（像素/秒） */
export function drift(cfg: Wading, out: BodyStep, x: number, y: number, vx: number, vy: number, wx: number, wy: number, dx: number, dy: number, k: number, dt: number): void {
  const toPx = UNIT / cfg.meterPerU
  approach(out, x, y, vx, vy, wx * toPx + dx, wy * toPx + dy, k, dt)
}

const FLOW: Flow = { h: 0, u: 0, v: 0 }

/** 身体本来的大小：角色的判定半径里乘了队长倍率，那只是画面上突出队长，受力不算它 */
function bodyRadius(sim: Sim, eid: number): number {
  return hasComponent(sim.world, eid, CharScale) ? Radius.v[eid]! / CharScale.v[eid]! : Radius.v[eid]!
}

/**
 * 水里的一步：掉落物落进水里跟落叶一样顺水漂，被吸向队伍的速度照加；身体站不住就随水漂、自己划水，站得住的按常规走；碎片照常。
 * swimming 按实体记着哪些身体正随水漂着（uid 对不上就是换了实体）。接管了这一步就返回 true
 */
export function wade(sim: Sim, cfg: Wading, w: Water, swimming: Map<number, number>, eid: number, dt: number, x: number, y: number, vx: number, vy: number, out: BodyStep): boolean {
  if (hasComponent(sim.world, eid, Shard)) return false
  flowAt(w, x / UNIT, y / UNIT, FLOW)
  const g = sim.hooks.surface(sim, x, y)
  const k = (Phys.drag[eid]! * Phys.grip[eid]! * g.traction * g.viscosity) / Phys.mass[eid]!
  if (hasComponent(sim.world, eid, Pickup)) {
    if (FLOW.h < cfg.body.wetM) return false
    drift(cfg, out, x, y, vx, vy, FLOW.u, FLOW.v, Drive.x[eid]!, Drive.y[eid]!, k, dt)
    return true
  }
  const uid = Uid.v[eid]!
  const was = swimming.get(eid) === uid
  if (FLOW.h < cfg.body.wetM || !swept(cfg, bodyRadius(sim, eid), Phys.mass[eid]!, FLOW.h, FLOW.u, FLOW.v, was)) {
    swimming.delete(eid)
    return false
  }
  swimming.set(eid, uid)
  drift(cfg, out, x, y, vx, vy, FLOW.u, FLOW.v, Drive.x[eid]! * cfg.body.swim, Drive.y[eid]! * cfg.body.swim, k, dt)
  return true
}

/**
 * 被水冲出了地图：掉落物没了；角色倒下（复活时照常回到队伍里），敌人与召唤出的身体死去，按 src 记在这一种危险地形上，身体先挪到 (x, y)（像素，冲走的去处）；
 * 腾空的、被抛着的、穿行中的身体不沾水，碎片不管
 */
export function washOut(sim: Sim, eid: number, src: Source, x: number, y: number): void {
  if (hasComponent(sim.world, eid, Shard)) return
  if (hasComponent(sim.world, eid, Pickup)) {
    removeEntity(sim.world, eid)
    return
  }
  if (!Alive.v[eid] || hasComponent(sim.world, eid, Airborne) || Motion.kind[eid] === MOTION.arc || Motion.kind[eid] === MOTION.transit) return
  Transform.x[eid] = x
  Transform.y[eid] = y
  const st = sim.run.stats
  if (hasComponent(sim.world, eid, Slot) && src.hazard) {
    const slot = Slot.v[eid]!
    if (slot >= 0 && slot < st.damageTaken.length) st.damageTaken[slot] = (st.damageTaken[slot] ?? 0) + Hp.v[eid]!
    st.hazardDamage[src.hazard] = (st.hazardDamage[src.hazard] ?? 0) + Hp.v[eid]!
  }
  die(sim, eid, src, Phys.vx[eid]!, Phys.vy[eid]!)
}
