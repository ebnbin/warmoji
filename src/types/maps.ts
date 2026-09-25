import type { MAPS } from '../../defs/maps'
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
export interface IceConfig {
  readonly floeU: number
  readonly teamTauIce: number
  readonly teamTauWater: number
  readonly enemyTauIce: number
  readonly knockbackTauMul: number
  readonly waterSpeedMul: number
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
export interface RiverConfig {
  readonly viewScale: number
  readonly width: number
  readonly flow: number
  readonly coinCullPad: number
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
export interface InfiniteConfig {
  readonly activeHalf: number
  readonly spawnRingMin: number
  readonly spawnRingMax: number
  readonly chunkCells: number
  readonly chunkPad: number
}
export interface ShrinkRingConfig {
  readonly r0: number
  readonly rMin: number
  readonly holdMs: number
  readonly shrinkEndMs: number
  readonly tickMs: number
  readonly tickDamage: number
}
export interface MapDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly kind: 'bounded' | 'infinite' | 'river' | 'void' | 'ruins' | 'daynight' | 'space' | 'ice'
  readonly size?: { readonly w: number; readonly h: number }
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
  readonly river?: RiverConfig
  readonly torus?: TorusConfig
  readonly infinite?: InfiniteConfig
  readonly shrinkRing?: ShrinkRingConfig
  readonly finalWaveSub?: string
  readonly boss: EnemyKind
}
export type MapId = keyof typeof MAPS
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
