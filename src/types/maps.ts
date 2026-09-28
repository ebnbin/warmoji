import type mapsJson from '../assets/maps.json'
import type { Palette } from '../util/palette'
import type { EnemyKind, EnemyMixRow } from './enemies'

export interface MapDecor {
  readonly emojis: readonly string[]
  readonly sizeU: readonly [number, number]
  readonly alpha: readonly [number, number]
  readonly density: readonly [number, number]
}
interface WallsConfig {
  readonly blocks: number
  readonly maxLen: number
  readonly centerClearU: number
  readonly spawnMinCellDist: number
  readonly reflowMs: number
  /** 身体撞墙时的半径上限，过道一格宽 */
  readonly bodyRadiusCapU: number
}
export interface DayNightConfig {
  readonly cycleSec: number
  readonly startHour: number
  readonly visionMax: number
  readonly visionMid: number
  readonly visionMin: number
  readonly fogRadiusDusk: number
  readonly fogRadiusMidnight: number
  readonly fogAlphaMax: number
  readonly daySpawnScale: number
  readonly nightSpawnScale: number
}
/** 地面对体力的影响：赶路每走一格扣几点体力，歇着时体力回复乘多少 */
export interface GroundStamina {
  readonly exertion: number
  readonly regen: number
}
export interface IceConfig {
  readonly floeU: number
  readonly traction: number
  readonly waterTraction: number
  readonly waterViscosity: number
  /** 水里的体力：冰面按地图的体力算 */
  readonly waterExertion: number
  readonly waterRegen: number
  readonly waterTeamDps: number
  readonly waterEnemyDps: number
  readonly waterTickMs: number
}
export interface SpaceConfig {
  readonly blackholeRadiusU: number
  readonly meteor: {
    readonly intervalMs: number
    readonly intervalJitterMs: number
    readonly warnMs: number
    readonly radiusU: number
    readonly speedU: number
    readonly travelU: number
    readonly offsetU: number
    readonly damage: number
  }
}
/** 星云：圆心在原点、半径 radiusU 格的星域里有一个黑洞，引力按普卢默软化的万有引力 g = GM·r/(r²+ε²)^{3/2} 作用于一切 */
export interface NebulaConfig {
  readonly radiusU: number
  readonly hole: {
    /** 引力常数乘黑洞质量，格³/秒² */
    readonly gm: number
    readonly softeningU: number
    /** 视界半径：中心进了这个圈就被吞噬 */
    readonly horizonU: number
    /** 黑洞离星域中心的距离范围，方向随机 */
    readonly fromCenterU: readonly [number, number]
    /** 刷怪点与据点离黑洞至少多远 */
    readonly clearU: number
  }
  readonly meteor: {
    readonly firstMs: number
    readonly intervalMs: number
    readonly intervalJitterMs: number
    readonly warnMs: number
    /** 流星本体半径：中心距小于它就被砸中 */
    readonly radiusU: number
    readonly speedU: number
    /** 起点在瞄准点后方多远，瞄准点在队长两侧最多偏多远 */
    readonly leadU: number
    readonly offsetU: number
    readonly damage: number
    /** 轨迹按这个步长积分，最长飞这么久 */
    readonly stepMs: number
    readonly maxFlightMs: number
  }
}
export interface RiverConfig {
  readonly viewScale: number
  readonly width: number
  readonly flow: number
  /** 正逆流、正顺流赶路时费力的倍率，斜着走按夹角插值 */
  readonly upstream: number
  readonly downstream: number
  /** 拾取物漂过下游边多远消失 */
  readonly coinCullPad: number
  /** 敌人漂过下游边多远就被冲走 */
  readonly enemyCullPad: number
  readonly driftCount: number
  readonly driftSpeedMul: readonly [number, number]
  readonly waveSlow: number
  readonly waveFast: number
}
export interface TorusConfig {
  readonly arenaLong: number
  readonly arenaShort: number
  readonly projectileLifeMs: number
  readonly frame: number
}
export interface MapDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly kind: 'bounded' | 'river' | 'void' | 'ruins' | 'daynight' | 'space' | 'ice' | 'nebula'
  readonly size?: { readonly w: number; readonly h: number }
  readonly stamina: GroundStamina
  readonly palette: Palette
  readonly decor: MapDecor
  readonly drift?: readonly string[]
  readonly mix: readonly EnemyMixRow[]
  readonly dayMix?: readonly EnemyMixRow[]
  readonly nightMix?: readonly EnemyMixRow[]
  readonly walls?: WallsConfig
  readonly dayNight?: DayNightConfig
  readonly ice?: IceConfig
  readonly space?: SpaceConfig
  readonly nebula?: NebulaConfig
  readonly river?: RiverConfig
  readonly torus?: TorusConfig
  readonly finalWaveSub?: string
  readonly boss: EnemyKind
}
export type MapId = keyof typeof mapsJson

export type Hazard = 'coldWater' | 'meteor' | 'blackhole'

export interface DecorInstance {
  emoji: string
  xU: number
  yU: number
  sizeU: number
  alpha: number
  rotation: number
}
export interface MapDefaults {
  readonly width: number
  readonly height: number
  readonly cameraMargin: number
}
