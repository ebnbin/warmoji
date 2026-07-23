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

export interface MapDef {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  /** 世界形态：bounded = 25×25 有界竞技场；infinite = 无边界（终波缩圈）；
   * river = 单屏固定相机 + 恒定水流；void = 固定 16:9 环面（四边传送门）；
   * ruins = 有界竞技场 + 断壁（挡移动/子弹/视线，流场寻路） */
  readonly kind: 'bounded' | 'infinite' | 'river' | 'void' | 'ruins'
  /** 固定色板：战斗场景不再逐局随机 */
  readonly palette: Palette
  readonly decor: MapDecor
  /** 河流图：水面漂浮物池（顺流循环，区别于岸上静态 decor） */
  readonly drift?: readonly string[]
  /** 本图出怪表（波次配比——编排属于地图，不属于敌人） */
  readonly mix: readonly EnemyMixRow[]
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
] as const
export type ArenaSceneKey = (typeof ARENA_SCENE_KEYS)[number]

/** 该地图应进入的竞技场场景（每种世界形态一套独立场景实现，按图路由） */
export function arenaSceneFor(id: MapId): ArenaSceneKey {
  const kind = MAPS[id].kind
  if (kind === 'infinite') return 'arenaInfinite'
  if (kind === 'river') return 'arenaRiver'
  if (kind === 'void') return 'arenaVoid'
  if (kind === 'ruins') return 'arenaRuins'
  return 'arena'
}

/** 本图终波 Boss 定义（按 map.boss 引用 enemies 目录） */
export function bossFor(id: MapId): EnemyDef {
  return ENEMIES[MAPS[id].boss]!
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
