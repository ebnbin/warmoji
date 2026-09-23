import mapsJson from '../assets/maps.json'
import type { Palette } from '../util/palette'
import type { EnemyMixRow } from './enemies'

export interface MapDecor {
  readonly emojis: readonly string[]
  /** 尺寸范围（格） */
  readonly sizeU: readonly [number, number]
  /** 透明度范围 */
  readonly alpha: readonly [number, number]
  /** 每格出现概率范围，逐局掷一次 */
  readonly density: readonly [number, number]
}
/** 挂上即启用断壁：挡移动/子弹/视线 + 流场寻路 */
export interface WallsConfig {
  readonly blocks: number
  /** 单块最大长度（格） */
  readonly maxLen: number
  /** 中心留空半径（格） */
  readonly centerClearU: number
  /** 刷怪点离队伍中心的最小格距 */
  readonly spawnMinCellDist: number
  /** 流场重算节流（ms） */
  readonly reflowMs: number
}
/** 挂上即启用昼夜 */
export interface DayNightConfig {
  /** 一整天的秒数 */
  readonly cycleSec: number
  /** wave 1 起始时刻（0..24） */
  readonly startHour: number
  /** 正午视野（格） */
  readonly visionMax: number
  /** 黄昏/黎明视野（格） */
  readonly visionMid: number
  /** 午夜视野（格） */
  readonly visionMin: number
  /** 黄昏/黎明迷雾圈半径（格） */
  readonly fogRadiusDusk: number
  /** 午夜迷雾圈半径（格） */
  readonly fogRadiusMidnight: number
  /** 午夜迷雾最浓时的不透明度 */
  readonly fogAlphaMax: number
  /** 白天刷怪间隔倍率 */
  readonly daySpawnScale: number
  /** 夜晚刷怪间隔倍率 */
  readonly nightSpawnScale: number
}
/** 挂上即启用打滑与落水 */
export interface IceConfig {
  /** 浮冰边长（格）：战斗区 = [0, floeU]²，其外皆是水 */
  readonly floeU: number
  /** 队伍冰上速度响应时间常数（秒） */
  readonly teamTauIce: number
  /** 队伍水中速度响应时间常数（秒） */
  readonly teamTauWater: number
  /** 敌人冰上速度响应时间常数（秒） */
  readonly enemyTauIce: number
  /** 击退衰减时间常数倍率 */
  readonly knockbackTauMul: number
  /** 水中速度倍率（玩家/敌人同用） */
  readonly waterSpeedMul: number
  /** 玩家落水每秒掉血 */
  readonly waterTeamDps: number
  /** 敌人落水每秒掉血 */
  readonly waterEnemyDps: number
  /** 落水掉血结算间隔（ms） */
  readonly waterTickMs: number
}
/** 挂上即启用黑洞禁锢场与天体横扫 */
export interface SpaceConfig {
  /** 格；圆心在地图中心 */
  readonly blackholeRadiusU: number
  readonly meteor: {
    /** 平均间隔（ms） */
    readonly intervalMs: number
    /** 间隔随机抖动（±ms） */
    readonly intervalJitterMs: number
    /** 出现前预警时长（ms） */
    readonly warnMs: number
    /** 球体半径（格） */
    readonly radiusU: number
    /** 划过速度（格/秒） */
    readonly speedU: number
    /** 直线全长（格） */
    readonly travelU: number
    /** 相对队伍中心的垂直随机偏移上限（格） */
    readonly offsetU: number
    /** 敌我通吃 */
    readonly damage: number
  }
}
/** 挂上即启用单屏固定相机、河道与顺流漂移 */
export interface RiverConfig {
  /** 世界尺寸 = 逻辑视口 × viewScale */
  readonly viewScale: number
  /** 河道宽度（格） */
  readonly width: number
  /** 流速（格/秒） */
  readonly flow: number
  /** 金币漂出下游边界这一距离后清理（格） */
  readonly coinCullPad: number
  readonly driftCount: number
  /** 漂浮物个体速度倍率区间 */
  readonly driftSpeedMul: readonly [number, number]
  /** 水纹滚动速度，为流速的倍数 */
  readonly waveSlow: number
  readonly waveFast: number
}
/** 挂上即启用环面世界与四边传送门 */
export interface TorusConfig {
  /** 竞技场长边（格） */
  readonly arenaLong: number
  /** 竞技场短边（格） */
  readonly arenaShort: number
  /** 玩家子弹寿命（ms）：环面上飞不出屏幕，须按时限回收 */
  readonly projectileLifeMs: number
  /** 传送门门框光带厚度（格） */
  readonly frame: number
}
/** 挂上即启用无边界、休眠、环带刷怪与分块装饰 */
export interface InfiniteConfig {
  /** 活跃方形半边长（格）：超出的敌人休眠 */
  readonly activeHalf: number
  /** 刷怪环带内环（格，以队伍中心为圆心） */
  readonly spawnRingMin: number
  /** 刷怪环带外环（格） */
  readonly spawnRingMax: number
  /** 装饰分块边长（格） */
  readonly chunkCells: number
  /** 装饰活跃范围 = 相机视野外扩的块数 */
  readonly chunkPad: number
}
/** 挂上即启用终波缩圈 */
export interface ShrinkRingConfig {
  /** 初始半径（格） */
  readonly r0: number
  /** 收缩到底的半径（格） */
  readonly rMin: number
  /** 开圈后静止观察期（ms） */
  readonly holdMs: number
  /** 收缩结束时刻（ms，此后维持 rMin 到波末） */
  readonly shrinkEndMs: number
  /** 圈外掉血结算间隔（ms） */
  readonly tickMs: number
  /** 圈外每跳掉血 */
  readonly tickDamage: number
}
export interface MapDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  /** bounded 有界；infinite 无边界；river 单屏水流；void 环面传送门；ruins 有界 + 断壁；daynight 有界 + 昼夜；space 无限 + 天体；ice 浮冰打滑 */
  readonly kind: 'bounded' | 'infinite' | 'river' | 'void' | 'ruins' | 'daynight' | 'space' | 'ice'
  /** 有界图尺寸（格），缺省取 MapDefaults */
  readonly size?: { readonly w: number; readonly h: number }
  readonly palette: Palette
  readonly decor: MapDecor
  /** 水面漂浮物池 */
  readonly drift?: readonly string[]
  /** 昼夜图存 dayMix/nightMix 的并集，只供图鉴与兜底 */
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
  /** 缺省「击败它，或撑过 N 秒！」 */
  readonly finalWaveSub?: string
  /** 引用 role:'boss' 的 kind */
  readonly boss: string
}
export type MapId = keyof typeof mapsJson
/** 格坐标 */
export interface DecorInstance {
  emoji: string
  xU: number
  yU: number
  sizeU: number
  alpha: number
  rotation: number
}
export interface MapDefaults {
  /** 格；每图 size.w 可覆盖 */
  readonly width: number
  /** 格；每图 size.h 可覆盖 */
  readonly height: number
  /** 相机滚动范围 = 地图四周外扩这一圈（格） */
  readonly cameraMargin: number
}
