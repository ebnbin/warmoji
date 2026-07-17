import type { Palette } from './palette'
import { hslToInt } from './palette'

// 地图 = 关卡：固定主题（色板 + 地面装饰规则），是未来难度/专属怪物/开局
// buff 等设计的挂载框架。当前三张图只有主题差异，玩法数值完全一致。
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

export interface MapSpec {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  /** 世界形态：bounded = 25×25 有界竞技场；infinite = 无边界（终波缩圈）；
   * river = 单屏固定相机 + 恒定水流 */
  readonly kind: 'bounded' | 'infinite' | 'river'
  /** 固定色板：战斗场景不再逐局随机 */
  readonly palette: Palette
  readonly decor: MapDecor
  /** 河流图：水面漂浮物池（顺流循环，区别于岸上静态 decor） */
  readonly drift?: readonly string[]
  // 未来扩展位：难度曲线 / 专属怪物表 / 开局 buff 等字段后续追加
}

export const MAPS = {
  forest: {
    emoji: '🌲',
    name: '黑森林',
    desc: '苍郁密林，落叶与蕨草铺满林间空地',
    kind: 'bounded',
    palette: {
      bgFrom: 'hsl(150 30% 30%)',
      bgTo: 'hsl(170 32% 17%)',
      map: hslToInt(110, 0.3, 0.7),
      shadow: 0x000000,
    },
    decor: {
      emojis: ['🌲', '🌳', '🌿', '🍂', '🍃', '🪨'],
      sizeU: [0.28, 0.7],
      alpha: [0.14, 0.26],
      density: [0.1, 0.14],
    },
  },
  desert: {
    emoji: '🏜️',
    name: '荒漠',
    desc: '烈日荒原，仙人掌与枯骨散落黄沙',
    kind: 'bounded',
    palette: {
      bgFrom: 'hsl(30 42% 36%)',
      bgTo: 'hsl(15 38% 20%)',
      map: hslToInt(45, 0.48, 0.76),
      shadow: 0x000000,
    },
    decor: {
      emojis: ['🌵', '🪨', '🦴', '💀', '🥀'],
      sizeU: [0.28, 0.68],
      alpha: [0.14, 0.26],
      // 荒漠刻意更稀疏
      density: [0.08, 0.11],
    },
  },
  snow: {
    emoji: '❄️',
    name: '雪原',
    desc: '冰封旷野，风雪在大地刻下冰晶',
    kind: 'bounded',
    palette: {
      bgFrom: 'hsl(210 34% 34%)',
      bgTo: 'hsl(235 30% 18%)',
      map: hslToInt(205, 0.28, 0.82),
      shadow: 0x000000,
    },
    decor: {
      emojis: ['❄️', '🧊', '✨'],
      sizeU: [0.25, 0.62],
      alpha: [0.16, 0.3],
      density: [0.12, 0.16],
    },
  },
  wilds: {
    emoji: '🌾',
    name: '无垠旷野',
    desc: '没有边界的原野，可朝任意方向走到天涯；终波赤鬼降临时毒雾收拢成圈',
    kind: 'infinite',
    palette: {
      bgFrom: 'hsl(80 30% 30%)',
      bgTo: 'hsl(100 28% 16%)',
      map: hslToInt(75, 0.34, 0.66),
      shadow: 0x000000,
    },
    decor: {
      emojis: ['🌾', '🌼', '🍃', '🪨', '🌻'],
      sizeU: [0.28, 0.66],
      alpha: [0.14, 0.26],
      density: [0.1, 0.14],
    },
  },
  river: {
    emoji: '🌊',
    name: '奔流',
    desc: '一条永不停歇的大河，万物皆随波逐流；两岸静看你逆流而战',
    kind: 'river',
    palette: {
      bgFrom: 'hsl(155 32% 28%)',
      bgTo: 'hsl(200 36% 15%)',
      // map 色即河水基色（河谷两岸的暗带由场景另行绘制）
      map: hslToInt(199, 0.46, 0.56),
      shadow: 0x000000,
    },
    decor: {
      // 岸上静态植被（战斗区外，透明度可比战斗区装饰略高）
      emojis: ['🌾', '🌿', '🪨', '🌳', '🍄'],
      sizeU: [0.3, 0.6],
      alpha: [0.3, 0.45],
      density: [0.1, 0.14],
    },
    drift: ['🍃', '🌸', '🫧', '🍂'],
  },
} as const satisfies Record<string, MapSpec>

export type MapId = keyof typeof MAPS
export const MAP_IDS = Object.keys(MAPS) as readonly MapId[]

export function sanitizeMapId(id: unknown): MapId {
  return typeof id === 'string' && id in MAPS ? (id as MapId) : MAP_IDS[0]!
}

/** 该地图应进入的竞技场场景（有界/无界/河流是三套场景实现，按图路由） */
export function arenaSceneFor(id: MapId): 'arena' | 'arenaInfinite' | 'arenaRiver' {
  const kind = MAPS[id].kind
  if (kind === 'infinite') return 'arenaInfinite'
  if (kind === 'river') return 'arenaRiver'
  return 'arena'
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
  spec: MapDecor,
  rand: () => number,
  cols: number,
  rows: number,
): DecorInstance[] {
  const density = spec.density[0] + rand() * (spec.density[1] - spec.density[0])
  const noise = noiseField(rand, cols, rows, 6)
  const out: DecorInstance[] = []
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      // 场值重映射：低处近乎空地、高处密聚（均值 ≈0.76，总量仍由 density 主导）
      const local = density * (0.15 + 1.7 * Math.pow(noise(cx + 0.5, cy + 0.5), 1.5))
      if (rand() >= local) continue
      const emoji = spec.emojis[Math.min(spec.emojis.length - 1, Math.floor(rand() * spec.emojis.length))]!
      const sizeU = spec.sizeU[0] + rand() * (spec.sizeU[1] - spec.sizeU[0])
      const clamp = (v: number, max: number): number =>
        Math.min(Math.max(v, sizeU / 2), max - sizeU / 2)
      out.push({
        emoji,
        xU: clamp(cx + 0.5 + (rand() * 2 - 1) * 1.1, cols),
        yU: clamp(cy + 0.5 + (rand() * 2 - 1) * 1.1, rows),
        sizeU,
        alpha: spec.alpha[0] + rand() * (spec.alpha[1] - spec.alpha[0]),
        // 全部 360° 随机旋转：装饰是「散落在地上的东西」，没有统一朝向才自然
        rotation: (rand() * 2 - 1) * Math.PI,
      })
    }
  }
  return out
}
