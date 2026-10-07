import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { DEG2RAD } from '../../util/units'
import { Depth, Faction, Floor, Homing, Linger, PrevPos, Proj, Projectile, Quad, Sprite, Tint, Transform, Vel, VisOff } from '../components'
import { projHitUids, projOnHit, projSrc } from '../store'
import type { Effect } from '../../types/abilityDefs'
import type { Source } from '../utils/source'
import { floorAt } from '../utils/pass'
import type { Point } from '../../util/vec'
import type { Sim } from '../sim'

/** 抛射最近抛出这么远，像素：贴脸的目标也画得出一道弧 */
const MIN_LOB_PX = 24

interface BoltSpec {
  readonly faction: number
  readonly frame: number
  readonly size: number
  readonly radius: number
  readonly speed: number
  readonly rotOffsetDeg: number
  readonly lifeMs: number
  readonly pierce: number
  readonly damage: number
  readonly knockback: number
  readonly src: Source
  readonly onHit?: readonly Effect[]
  readonly homingDeg?: number
  readonly linger?: number
  /** 平射飞的、抛射出手的高度：离出手处的地面多高，米 */
  readonly h: number
  /** 平射瞄着哪里：飞行的基准从出手处的地面连到那里的地面；不写就连到飞得到的最远处 */
  readonly aim?: Point
  /** 抛射拱起的高度（米）与抛到多远（像素）：落地就停 */
  readonly arc?: number
  readonly reach?: number
  /** 撞上障碍时的破坏力；through 为真的不受障碍阻挡 */
  readonly breach?: number
  readonly through?: boolean
}

/** 平射的来源只打占着它此刻离基准面 z 米这个高度的身体 */
export function flatSource(src: Source, z: number): Source {
  return { ...src, band: [z, z] }
}

/** 弹体：直线飞行（追踪的会转向）、一帧扫掠一段的飞行物，敌我同一种；无朝向的弹体自转；会落地的飞完躺在地上等召回；抛射的抛到瞄准的地方落地；平射的只打得到占着它那一层的身体 */
export function spawnBolt(sim: Sim, x: number, y: number, angle: number, spec: BoltSpec): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Projectile, Transform, Vel, Proj, PrevPos, Faction, Sprite, Tint, Depth, VisOff)
  Transform.x[eid] = x
  Transform.y[eid] = y
  Transform.rot[eid] = spec.rotOffsetDeg === 0 ? 0 : angle + spec.rotOffsetDeg * DEG2RAD
  Transform.w[eid] = spec.size
  Transform.h[eid] = spec.size
  PrevPos.x[eid] = x
  PrevPos.y[eid] = y
  Vel.x[eid] = Math.cos(angle) * spec.speed
  Vel.y[eid] = Math.sin(angle) * spec.speed
  Faction.v[eid] = spec.faction
  Sprite.frame[eid] = spec.frame
  Sprite.flipX[eid] = 0
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = 1
  Quad.v[eid] = 0
  Proj.damage[eid] = spec.damage
  Proj.radius[eid] = spec.radius
  Proj.kb[eid] = spec.knockback
  Proj.pierce[eid] = spec.pierce
  Proj.spin[eid] = spec.rotOffsetDeg === 0 ? 9 : 0
  Proj.rotOffset[eid] = spec.rotOffsetDeg * DEG2RAD
  if (spec.homingDeg) {
    addComponents(sim.world, eid, Homing)
    Homing.turn[eid] = spec.homingDeg * DEG2RAD
  }
  if (spec.linger) {
    addComponents(sim.world, eid, Linger)
    Linger.ms[eid] = spec.linger
  }
  const arc = spec.arc ?? 0
  const reach = arc > 0 ? Math.max(MIN_LOB_PX, Math.min(spec.reach ?? Infinity, (spec.speed * spec.lifeMs) / 1000)) : 0
  // 飞行的基准连到哪里：抛射是全程尽头的落点，平射是瞄准的地方，没瞄准就是飞得到的最远处
  const aim = spec.aim
  const far = arc > 0 ? reach : aim ? Math.hypot(aim.x - x, aim.y - y) : (spec.speed * spec.lifeMs) / 1000
  const to = arc > 0 || !aim ? { x: x + Math.cos(angle) * far, y: y + Math.sin(angle) * far } : aim
  const g = floorAt(sim, x, y)
  Proj.z[eid] = g + spec.h
  Proj.g[eid] = g
  Proj.dg[eid] = far > 0 ? (floorAt(sim, to.x, to.y) - g) / far : 0
  Floor.z[eid] = g
  Proj.arc[eid] = arc
  Proj.reach[eid] = reach
  Proj.flown[eid] = 0
  Proj.breach[eid] = spec.breach ?? 0
  Proj.through[eid] = spec.through ? 1 : 0
  const life = arc > 0 && spec.speed > 0 ? Math.min(spec.lifeMs, (reach / spec.speed) * 1000) : spec.lifeMs
  Proj.dieAt[eid] = sim.elapsedMs + life
  Depth.z[eid] = 8
  projOnHit[eid] = spec.onHit
  projHitUids[eid] = new Set()
  projSrc[eid] = arc > 0 ? spec.src : flatSource(spec.src, Proj.z[eid]!)
  return eid
}
