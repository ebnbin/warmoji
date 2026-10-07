import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { SPAWN } from '../../data/enemies'
import { randomMapPoint } from '../utils/spawn'
import { MAPS } from '../../data/maps'
import type { MapId } from '../../types/maps'
import type { NebulaState } from '../../maps/nebula/model'
import { awayFromWall, roomAt } from '../../maps/basin'
import type { Basin } from '../../maps/basin'
import type { GateRuntime } from './gates'
import type { Landmark } from '../../maps/landmark'
import type { VolcanoState } from '../../maps/volcano/model'
import type { FloeState } from '../../maps/floe/model'
import type { AmethystState } from '../../maps/amethyst/world'
import { Radius, Transform } from '../components'
import type { Sim } from '../sim'
import type { Point } from '../../util/vec'
import { fleeSteer } from '../systems/shared/steer'
import { leaderPoint } from '../utils/team'
import type { BodyStep } from '../systems/shared/body'
import type { Crossing, Probe } from '../utils/pass'
import type { Solid } from './solids'
import type { ObstacleId } from '../../types/obstacles'
import type { MeadowState } from '../../maps/meadow/world'
import type { SakuraState } from '../../maps/sakura/world'
import type { DesertState } from '../../maps/desert/world'
import type { RuinsState } from '../../maps/ruins/world'
import type { DeepState } from '../../maps/deep/world'
import type { PetriState } from '../../maps/petri/world'
import type { TheaterState } from '../../maps/theater/world'
import type { ExitState } from '../../maps/exit/world'
import type { MapCue, MapGauge } from '../../data/signals'

export const ZERO: Point = { x: 0, y: 0 }

export interface Surface {
  readonly traction: number
  readonly viscosity: number
  /** 赶路每走一格扣掉的体力点数 */
  readonly exertion: number
  /** 歇着时体力回复的倍率 */
  readonly regen: number
}
/** 脚不沾地时的地面：不打滑、不黏、不费力 */
export const GROUND: Surface = { traction: 1, viscosity: 1, exertion: 0, regen: 1 }

const GROUNDS = new Map<MapId, Surface>()

/** 这张图的地面：费力与回复来自地图，其余同平地 */
export function groundOf(sim: Sim): Surface {
  let g = GROUNDS.get(sim.mapId)
  if (!g) {
    const { exertion, regen } = MAPS[sim.mapId].stamina
    g = { ...GROUND, exertion, regen }
    GROUNDS.set(sim.mapId, g)
  }
  return g
}

export interface WorldState {
  volcano: VolcanoState | null
  ruins: RuinsState | null
  nebula: NebulaState | null
  floe: FloeState | null
  amethyst: AmethystState | null
  desert: DesertState | null
  meadow: MeadowState | null
  sakura: SakuraState | null
  deep: DeepState | null
  petri: PetriState | null
  theater: TheaterState | null
  exit: ExitState | null
  gates: GateRuntime | null
}

export function newWorldState(): WorldState {
  return { volcano: null, ruins: null, nebula: null, floe: null, amethyst: null, desert: null, meadow: null, sakura: null, deep: null, petri: null, theater: null, exit: null, gates: null }
}

const NO_MARKS: Readonly<Record<string, readonly Landmark[]>> = {}

/** 穿过一扇传送门：在这一段路上走到 t（0 到 1）时越过门线，剩下的路连同终点平移 (dx, dy) 像素到另一扇门那边，速度不变 */
export interface PortalHop {
  readonly t: number
  readonly dx: number
  readonly dy: number
}

export interface WorldHooks {
  worldDelta(sim: Sim, fromX: number, fromY: number, toX: number, toY: number): Point
  wrap(sim: Sim, x: number, y: number): Point
  /** 这里的引力加速度，像素/秒² */
  pull(sim: Sim, x: number, y: number): Point
  /** 这里是不是汇（黑洞的视界）：进了这里的身体、弹体就停下，由地图吞掉 */
  sink(sim: Sim, x: number, y: number): boolean
  /** 这里的地面；body 是踩在上面的身体，有的地面只对一部分身体起作用，不给就只算对谁都一样的那部分 */
  surface(sim: Sim, x: number, y: number, body?: number): Surface
  /** 在这里朝 (dx, dy) 赶路的费力倍率：逆着介质更累，顺着更省力 */
  effort(sim: Sim, x: number, y: number, dx: number, dy: number): number
  /** 地面自己的接触力学：接管这一步就把位置与速度写进 out 并返回 true，否则按常规积分 */
  contact(sim: Sim, eid: number, dt: number, x: number, y: number, vx: number, vy: number, out: BodyStep): boolean
  /** 任何身体的位置修正：边界、障碍、环面回绕，按身体半径 */
  constrainBody(sim: Sim, eid: number, from: Point, next: Point): Point
  /** 跟随中的身体从 from 被拉到 next 时的位置修正；不写就照拉，隔着障碍也贴到宿主身上 */
  follow?(sim: Sim, eid: number, from: Point, next: Point): Point
  /** 岩壁这类硬边界围出的能走的地面，身体按它挡在壁外；边界不是这样定的地图没有 */
  basin(sim: Sim): Basin | null
  /** 能站的地面：出怪口沿它的外边界摆，翻进从它外面起跳；默认是 basin，冰面外是海、空腔外是软壳层这类没有硬墙的地图另给 */
  ground(sim: Sim): Basin | null
  chaseDir(sim: Sim, eid: number, tx: number, ty: number): Point
  /** 线段 a→b 上第一处探测在它里面、又要贯穿才过得去的实心（贯穿几次按 utils/pass 的 passCost）；不写就按 wallHit */
  trace?(sim: Sim, probe: Probe, ax: number, ay: number, bx: number, by: number): Crossing | null
  /** 线段第一次碰上墙的地方：碰上的一律当作岩体挡下；写了 trace 的不看它 */
  wallHit?(sim: Sim, ax: number, ay: number, bx: number, by: number): Point | null
  /** (x, y) 处立着的实心，挡身体的与挡弹体的都算，取规则用的那份；只给开发面板画高度，不写就当没有 */
  solidAt?(sim: Sim, x: number, y: number): Solid | null
  /** (x, y) 处能站的地面离基准面多高，米：站在上面的身体、地上的东西都从它量起；不写就是平地 */
  floorZ?(sim: Sim, x: number, y: number): number
  /** 破坏力打在 (x, y) 离地 z 米处、半径 r 像素的范围里，按材质的强度折算能打掉多少，返回实际用掉的；不写就什么也打不坏 */
  breach?(sim: Sim, x: number, y: number, z: number, r: number, amount: number): number
  /** 弹体或出手撞上了障碍：给画面崩点碎屑 */
  impact?(sim: Sim, x: number, y: number, material: ObstacleId): void
  /** 引擎不调用：破坏一律走 breach */
  smashWall?(sim: Sim, x: number, y: number): void
  wanderDir(sim: Sim, eid: number, dx: number, dy: number): Point
  fleeDir(sim: Sim, eid: number, awayX: number, awayY: number): Point
  /** 飞行物出了这里就消失 */
  outside(sim: Sim, x: number, y: number): boolean
  spawnPoint(sim: Sim, boss: boolean): Point
  /** 地图的中心：据点与定点刷怪从这里起算 */
  center(sim: Sim): Point
  /** 把一个点收进敌人能站、能走到队伍的范围 */
  settle(sim: Sim, p: Point): Point
  /** 半径 radius 像素的一只敌人此刻能不能落在这里：站得下、脚下没有要命的东西；只有出怪口挑落点时用 */
  canSpawn(sim: Sim, x: number, y: number, radius: number): boolean
  /** 地图自己的地标，按组：出怪口里摆在同名地标上的从这里取；一组要么整组都在、要么整组都空（火山口只在喷发时有），组里的次序不变 */
  landmarks(sim: Sim): Readonly<Record<string, readonly Landmark[]>>
  /** 此刻怪更多从哪一侧来：方向是那一侧朝外的方向，长度按这张图自己的单位（浮冰是风速）；不偏为零 */
  lean(sim: Sim): Point
  /** 队员在队长 from 身后的坑位 at 落在不该站的地方（会伤人、贴着或隔着传送门）时挪开；不写就不挪 */
  seat?(sim: Sim, from: Point, at: Point): Point
  /** 沿直线从 a 走到 b（像素）先穿过的那扇传送门；eid 不为 −1 时是这个实体此刻真的穿了过去。没有传送门的地图不写 */
  portal?(sim: Sim, eid: number, ax: number, ay: number, bx: number, by: number): PortalHop | null
  /** 从 a 飞向 b（像素）最近的直路：直着飞，或先穿过一扇传送门再飞；返回这一路起头朝哪、多长的位移。没有传送门的地图不写，按 worldDelta */
  towards?(sim: Sim, ax: number, ay: number, bx: number, by: number): Point
  /** 从 (x, y) 走到队长要走多远，像素，按地图的寻路算、穿门的路也算，走不到为 Infinity；不写就按直线 */
  toLeader?(sim: Sim, x: number, y: number): number
  /** 这个身体此刻每秒换多少口气，按体力点数：正的是喘得上气，走着也按它补；负的是憋着气，按它往下掉，歇着也回不来；不写就照常 */
  breath?(sim: Sim, eid: number): number
  /** 这张图要队伍盯住的一处：在屏幕外时队长身边画一个指过去的箭头；不写就没有 */
  beacon?(sim: Sim): Point | null
  /** 一具身体死了（倒下等复活的不算），这时它的位置与半径还在；不写就什么也不做 */
  died?(sim: Sim, eid: number): void
  /** 地面此刻盖住了 (x, y) 处躺着的掉落物：捡不到、吸不走，露出来以后照常；不写就从不盖住 */
  covers?(sim: Sim, x: number, y: number): boolean
  /** 关卡读的地图读数，从 0 到 1：这张图在 data/signals 里写了哪几种就给哪几种 */
  gauge?(sim: Sim, g: MapGauge): number
  /** 关卡给地图的指令：让这张图此刻做一次它本来就会做的事，这张图在 data/signals 里写了哪几种就接哪几种 */
  cue?(sim: Sim, c: MapCue): void
  onStart(sim: Sim): void
  tick(sim: Sim, delta: number): void
}

export const bounded: WorldHooks = {
  worldDelta(_sim, fromX, fromY, toX, toY) {
    return { x: toX - fromX, y: toY - fromY }
  },
  wrap(_sim, x, y) {
    return { x, y }
  },
  pull() {
    return ZERO
  },
  sink() {
    return false
  },
  surface(sim) {
    return groundOf(sim)
  },
  effort() {
    return 1
  },
  contact() {
    return false
  },
  constrainBody(sim, eid, _from, next) {
    const r = Radius.v[eid]!
    return {
      x: Math.min(Math.max(next.x, r), sim.mapW - r),
      y: Math.min(Math.max(next.y, r), sim.mapH - r),
    }
  },
  basin() {
    return null
  },
  chaseDir(_sim, eid, tx, ty) {
    return norm(tx - Transform.x[eid]!, ty - Transform.y[eid]!)
  },
  wanderDir(sim, eid, dx, dy) {
    const margin = 0.6 * UNIT
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    return {
      x: (x < margin && dx < 0) || (x > sim.mapW - margin && dx > 0) ? -dx : dx,
      y: (y < margin && dy < 0) || (y > sim.mapH - margin && dy > 0) ? -dy : dy,
    }
  },
  fleeDir(sim, eid, awayX, awayY) {
    return fleeSteer(Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
  },
  outside(sim, x, y) {
    return x < -UNIT || x > sim.mapW + UNIT || y < -UNIT || y > sim.mapH + UNIT
  },
  spawnPoint(sim, boss) {
    return randomMapPoint(
      sim.rng,
      sim.mapW,
      sim.mapH,
      (boss ? 2 : SPAWN.edgeInset) * UNIT,
      leaderPoint(sim),
      SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1),
    )
  },
  center(sim) {
    return { x: sim.mapW / 2, y: sim.mapH / 2 }
  },
  settle(sim, p) {
    const inset = SPAWN.edgeInset * UNIT
    return { x: Math.min(Math.max(p.x, inset), sim.mapW - inset), y: Math.min(Math.max(p.y, inset), sim.mapH - inset) }
  },
  ground(sim) {
    return sim.hooks.basin(sim)
  },
  canSpawn() {
    return true
  },
  landmarks() {
    return NO_MARKS
  },
  lean() {
    return ZERO
  },
  onStart() {},
  tick() {},
}

/** 游荡着走到壁跟前就像撞上地图边一样折回来 */
export function wanderIn(b: Basin, eid: number, dx: number, dy: number): Point {
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  if (roomAt(b, x, y) > Radius.v[eid]! + 0.6 * UNIT) return { x: dx, y: dy }
  const n = awayFromWall(b, x, y)
  const dot = dx * n.x + dy * n.y
  return dot >= 0 ? { x: dx, y: dy } : { x: dx - 2 * dot * n.x, y: dy - 2 * dot * n.y }
}
