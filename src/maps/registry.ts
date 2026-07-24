import mapsJson from '../assets/maps.json'
import type { Palette } from '../core/palette'
import { ENEMIES } from '../enemies/registry'
import type { EnemyDef, EnemyMixRow } from '../enemies/registry'

// 地图 = 关卡：一种玩法一个主题——黑森林（有界竞技场）、荒漠（无限世界
// + 终波缩圈）、奔流（单屏河流 + 水流漂移），每张图都是不同的世界规则。
// 装饰配置只固定「规则」（emoji 池/尺寸/透明度/密度/倾斜），每局的具体摆放
// 由 rollDecor 按 run 内的种子随机生成——一局一景，同局各波不变。

export interface MapDecor {
  /** 装饰 emoji 池（逐格随机挑选，黑描边纹理与玩家侧同款） */
  readonly emojis: readonly string[]
  /** 单个装饰的尺寸范围（格）：明显小于战斗实体（1 格），不抢注意力 */
  readonly sizeU: readonly [number, number]
  /** 透明度范围（低于战斗实体一大截，保证战场读性） */
  readonly alpha: readonly [number, number]
  /** 每格出现装饰的概率范围（逐局掷一次；25×25 = 625 格，0.08 ≈ 50 个） */
  readonly density: readonly [number, number]
}

/** 断壁/地形特性（可选）：挂在有界图上即启用墙——挡移动/子弹/视线 + 流场寻路。
 * 目前仅残垣图配置；数据模型上任何有界图都可通过配置本字段获得该玩法（组合式地图特性） */
export interface WallsConfig {
  /** 断壁块数 */
  readonly blocks: number
  /** 单块最大长度（格） */
  readonly maxLen: number
  /** 中心留空半径（格） */
  readonly centerClearU: number
  /** 刷怪点离队伍中心的最小格距（别贴脸刷） */
  readonly spawnMinCellDist: number
  /** 流场重算节流（ms）：队伍格没变就不重算 */
  readonly reflowMs: number
}

/** 昼夜循环特性（可选）：挂在有界图上即启用昼夜——相机随时刻余弦缩放 + 夜幕迷雾圈 +
 * 昼夜两批怪（dayMix/nightMix）。目前仅晨昏原野配置；数据模型上任何有界图都可组合本特性 */
export interface DayNightConfig {
  /** 一整天 = 多少秒（白天→黑夜→白天一个完整周期） */
  readonly cycleSec: number
  /** wave 1 起始时刻（0..24） */
  readonly startHour: number
  /** 正午视野（格）——相机拉最远 */
  readonly visionMax: number
  /** 黄昏/黎明视野（格）——标准视野 */
  readonly visionMid: number
  /** 午夜视野（格）——相机拉最近 */
  readonly visionMin: number
  /** 迷雾圈半径（格）：黄昏/黎明够大到基本不挡 */
  readonly fogRadiusDusk: number
  /** 迷雾圈半径（格）：午夜收成一小圈 */
  readonly fogRadiusMidnight: number
  /** 午夜迷雾最浓时的不透明度 */
  readonly fogAlphaMax: number
  /** 出怪密度：白天间隔倍率（<1 更密） */
  readonly daySpawnScale: number
  /** 出怪密度：夜晚间隔倍率（>1 更疏） */
  readonly nightSpawnScale: number
}

/** 浮冰/打滑特性（可选）：方形浮冰 + 全局打滑（速度低通趋近目标）+ 四周水域（落水掉血·敌我通吃）。
 * 目前仅浮冰图配置；数据模型上任何图都可组合本特性 */
export interface IceConfig {
  /** 方形浮冰边长（格）：战斗区 = [0,floeU]²，其外皆是水 */
  readonly floeU: number
  /** 队伍冰上速度响应时间常数（秒）——打滑程度主参数，越大越滑 */
  readonly teamTauIce: number
  /** 队伍水中速度响应时间常数（秒） */
  readonly teamTauWater: number
  /** 敌人冰上速度响应时间常数（秒） */
  readonly enemyTauIce: number
  /** 击退衰减时间常数倍率（低摩擦让击退滑得远） */
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

/** 深空特性（可选）：黑洞禁锢场（向外阻力随距圆心增大）+ 天体横扫危险物（敌我通吃）。
 * 目前仅深空图配置；数据模型上任何图都可组合本特性 */
export interface SpaceConfig {
  /** 黑洞禁锢场半径（格）：整张图即此圈，圆心固定在地图中心 */
  readonly blackholeRadiusU: number
  /** 天体横扫危险物 */
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
    /** 压到的伤害（队员/敌人/Boss 一律照打） */
    readonly damage: number
  }
}

/** 奔流/水流特性（可选）：单屏固定相机 + 河道 + 恒定顺流漂移（万物随波逐流）。
 * 目前仅奔流图配置；数据模型上任何图都可组合本特性 */
export interface RiverConfig {
  /** 视野倍率：单屏固定相机下放大逻辑视口（世界尺寸 = 逻辑视口 × viewScale） */
  readonly viewScale: number
  /** 河道宽度（格，跨流向恒定） */
  readonly width: number
  /** 流速（格/秒，恒定漂移） */
  readonly flow: number
  /** 金币漂出下游边界这一距离后清理（格） */
  readonly coinCullPad: number
  /** 水面漂浮物数量 */
  readonly driftCount: number
  /** 漂浮物个体速度倍率区间 */
  readonly driftSpeedMul: readonly [number, number]
  /** 双层水纹滚动速度（视差贴图偏移，约为流速的倍数） */
  readonly waveSlow: number
  readonly waveFast: number
}

/** 环面/传送门特性（可选）：固定 16:9 环面世界（四边传送门，出这头即现那头）+ 跨缝分身相机。
 * 目前仅工厂图配置；数据模型上任何图都可组合本特性 */
export interface TorusConfig {
  /** 竞技场长边（格） */
  readonly arenaLong: number
  /** 竞技场短边（格） */
  readonly arenaShort: number
  /** 条带相机宽度（格）：渲染实体跨缝时的对侧分身 */
  readonly strip: number
  /** 玩家子弹寿命（ms）：环面上永远飞不出屏幕，必须按时限回收 */
  readonly projectileLifeMs: number
  /** 传送门门框光带厚度（格） */
  readonly frame: number
}

export interface MapDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  /** 世界形态：bounded = 25×25 有界竞技场；infinite = 无边界（终波缩圈）；
   * river = 单屏固定相机 + 恒定水流；void = 固定 16:9 环面（四边传送门）；
   * ruins = 有界竞技场 + 断壁（挡移动/子弹/视线，流场寻路）；
   * daynight = 有界竞技场 + 昼夜循环（相机随时刻涨落、夜幕起迷雾）；
   * space = 无限世界 + 天体横扫危险物 + 黑洞禁锢场（终波）；
   * ice = 25×25 方形浮冰 + 全局打滑（不跟手）+ 四周水域（落水掉血·敌我通吃），相机永远跟随 */
  readonly kind: 'bounded' | 'infinite' | 'river' | 'void' | 'ruins' | 'daynight' | 'space' | 'ice'
  /** 有界图尺寸（格）：缺省用 MAP.width/height（25×25）；昼夜图放大到 30×30 */
  readonly size?: { readonly w: number; readonly h: number }
  /** 固定色板：战斗场景不再逐局随机 */
  readonly palette: Palette
  readonly decor: MapDecor
  /** 河流图：水面漂浮物池（顺流循环，区别于岸上静态 decor） */
  readonly drift?: readonly string[]
  /** 本图出怪表（波次配比——编排属于地图，不属于敌人）。
   * 昼夜图另有 dayMix/nightMix 分相位出怪；此处存两批并集，供图鉴/名录/兜底用 */
  readonly mix: readonly EnemyMixRow[]
  /** 昼夜图专用：白天出怪表（密集正面怪） */
  readonly dayMix?: readonly EnemyMixRow[]
  /** 昼夜图专用：黑夜出怪表（稀疏潜袭怪） */
  readonly nightMix?: readonly EnemyMixRow[]
  /** 断壁/地形特性（可选）：配置即启用墙 + 流场寻路（当前仅残垣图使用） */
  readonly walls?: WallsConfig
  /** 昼夜循环特性（可选）：配置即启用昼夜相机/迷雾/两批怪（当前仅晨昏原野使用） */
  readonly dayNight?: DayNightConfig
  /** 浮冰/打滑特性（可选）：配置即启用打滑 + 落水掉血（当前仅浮冰图使用） */
  readonly ice?: IceConfig
  /** 深空特性（可选）：配置即启用黑洞禁锢场 + 天体横扫（当前仅深空图使用） */
  readonly space?: SpaceConfig
  /** 奔流/水流特性（可选）：配置即启用单屏固定相机 + 河道 + 顺流漂移（当前仅奔流图使用） */
  readonly river?: RiverConfig
  /** 环面/传送门特性（可选）：配置即启用环面世界 + 四边传送门 + 分身相机（当前仅工厂图使用） */
  readonly torus?: TorusConfig
  /** 本图终波 Boss：引用 enemies 里某个 role:'boss' 的 kind */
  readonly boss: string
}

// 地图表：数据行在 defs/maps.ts（创作层），npm run gen 生成 maps.json
export type MapId = keyof typeof mapsJson
export const MAPS = mapsJson as unknown as Record<MapId, MapDef>


export const MAP_IDS = Object.keys(MAPS) as readonly MapId[]

export function sanitizeMapId(id: unknown): MapId {
  return typeof id === 'string' && id in MAPS ? (id as MapId) : MAP_IDS[0]!
}

/** 全部竞技场场景键（每种世界形态一套独立场景实现）：注册/路由/探针共用同一份 */
export const ARENA_SCENE_KEYS = [
  'arena',
  'arenaInfinite',
  'arenaRiver',
  'arenaVoid',
  'arenaRuins',
  'arenaDayNight',
  'arenaSpace',
  'arenaIce',
] as const
export type ArenaSceneKey = (typeof ARENA_SCENE_KEYS)[number]

/** 该地图应进入的竞技场场景（每种世界形态一套独立场景实现，按图路由） */
export function arenaSceneFor(id: MapId): ArenaSceneKey {
  const kind = MAPS[id].kind
  if (kind === 'infinite') return 'arenaInfinite'
  if (kind === 'river') return 'arenaRiver'
  if (kind === 'void') return 'arenaVoid'
  if (kind === 'ruins') return 'arenaRuins'
  if (kind === 'daynight') return 'arenaDayNight'
  if (kind === 'space') return 'arenaSpace'
  if (kind === 'ice') return 'arenaIce'
  return 'arena'
}

/** 本图终波 Boss 定义（按 map.boss 引用 enemies 目录） */
export function bossFor(id: MapId): EnemyDef {
  return ENEMIES[MAPS[id].boss]!
}

/** 本图会实际出现的全部敌人：波次编排的常规怪 + 终波 Boss + 它们衍生的子代
 * （巢穴生成 / 死亡分裂，如泡泡→小泡泡、虫巢→小飞虫）。按出现序去重，子代紧随亲代、
 * Boss 末位。测试模式的敌人清单据此按图裁剪，只列本图有的敌人。 */
export function mapEnemyRoster(id: MapId): EnemyDef[] {
  const seen = new Set<string>()
  const out: EnemyDef[] = []
  const add = (def: EnemyDef): void => {
    if (seen.has(def.kind)) return
    seen.add(def.kind)
    out.push(def)
    if (def.spawner) add(def.spawner.into)
    for (const fx of def.onDeath ?? []) if (fx.kind === 'split') add(fx.into)
  }
  for (const row of MAPS[id].mix) {
    const def = ENEMIES[row.kind]
    if (def) add(def)
  }
  add(bossFor(id))
  return out
}

// ── 装饰散布 ────────────────────────────────────────────────

/** 一个装饰实例（格坐标，渲染层再乘 UNIT） */
export interface DecorInstance {
  emoji: string
  xU: number
  yU: number
  sizeU: number
  alpha: number
  rotation: number
}

/** 低频值噪声场：晶格随机值 + 平滑双线性插值，返回 (xU,yU) → 0..1。
 * 晶格取自同一 rand 流，保证同种子同摆放 */
function noiseField(
  rand: () => number,
  cols: number,
  rows: number,
  waveU: number,
): (x: number, y: number) => number {
  const gw = Math.ceil(cols / waveU) + 2
  const gh = Math.ceil(rows / waveU) + 2
  const lattice: number[] = []
  for (let i = 0; i < gw * gh; i++) lattice.push(rand())
  const smooth = (t: number): number => t * t * (3 - 2 * t)
  return (x, y) => {
    const gx = Math.min(gw - 2, Math.max(0, x / waveU))
    const gy = Math.min(gh - 2, Math.max(0, y / waveU))
    const ix = Math.floor(gx)
    const iy = Math.floor(gy)
    const fx = smooth(gx - ix)
    const fy = smooth(gy - iy)
    const v00 = lattice[iy * gw + ix]!
    const v10 = lattice[iy * gw + ix + 1]!
    const v01 = lattice[(iy + 1) * gw + ix]!
    const v11 = lattice[(iy + 1) * gw + ix + 1]!
    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy
  }
}

/** 逐局随机的装饰摆放：地图自身的 1×1 格即虚拟网格，每格按密度掷是否放置。
 * 防「太整齐」两板斧：低频噪声场调制每格密度（自然成簇、留出空地），
 * 摆放中心允许溢出到邻格（±1.1 格）而非只在本格内 jitter；
 * 中心钳制进地图，避免探出边缘 */
export function rollDecor(
  def: MapDecor,
  rand: () => number,
  cols: number,
  rows: number,
): DecorInstance[] {
  const density = def.density[0] + rand() * (def.density[1] - def.density[0])
  const noise = noiseField(rand, cols, rows, 6)
  const out: DecorInstance[] = []
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      // 场值重映射：低处近乎空地、高处密聚（均值 ≈0.76，总量仍由 density 主导）
      const local = density * (0.15 + 1.7 * Math.pow(noise(cx + 0.5, cy + 0.5), 1.5))
      if (rand() >= local) continue
      const emoji = def.emojis[Math.min(def.emojis.length - 1, Math.floor(rand() * def.emojis.length))]!
      const sizeU = def.sizeU[0] + rand() * (def.sizeU[1] - def.sizeU[0])
      const clamp = (v: number, max: number): number =>
        Math.min(Math.max(v, sizeU / 2), max - sizeU / 2)
      out.push({
        emoji,
        xU: clamp(cx + 0.5 + (rand() * 2 - 1) * 1.1, cols),
        yU: clamp(cy + 0.5 + (rand() * 2 - 1) * 1.1, rows),
        sizeU,
        alpha: def.alpha[0] + rand() * (def.alpha[1] - def.alpha[0]),
        // 全部 360° 随机旋转：装饰是「散落在地上的东西」，没有统一朝向才自然
        rotation: (rand() * 2 - 1) * Math.PI,
      })
    }
  }
  return out
}

export const MAP = {
  width: 25,
  height: 25,
  // 相机滚动范围 = 地图四周外扩这一圈
  cameraMargin: 2,
} as const
