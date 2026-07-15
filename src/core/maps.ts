import type { Palette } from './palette'
import { hslToInt } from './palette'

// 地图 = 关卡：固定主题（色板 + 地面装饰规则），是未来难度/专属怪物/开局
// buff 等设计的挂载框架。当前三张图只有主题差异，玩法数值完全一致。
// 装饰配置只固定「规则」（emoji 池/尺寸/透明度/密度/倾斜），每局的具体摆放
// 由 rollDecor 按 run 内的种子随机生成——一局一景，同局各波不变。

export interface MapDecor {
  /** 装饰 emoji 池（逐格随机挑选，无描边纹理） */
  readonly emojis: readonly string[]
  /** 单个装饰的尺寸范围（格） */
  readonly sizeU: readonly [number, number]
  /** 透明度范围（极低，不干扰战场读性） */
  readonly alpha: readonly [number, number]
  /** 每格出现装饰的概率范围（逐局掷一次；25×25 = 625 格，0.08 ≈ 50 个） */
  readonly density: readonly [number, number]
  /** 最大倾斜角（± 弧度）：雪花类可全向 π，有明确上下的（树/仙人掌）给小值 */
  readonly maxTiltRad: number
}

export interface MapSpec {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  /** 固定色板：战斗场景不再逐局随机 */
  readonly palette: Palette
  readonly decor: MapDecor
  // 未来扩展位：难度曲线 / 专属怪物表 / 开局 buff 等字段后续追加
}

export const MAPS = {
  forest: {
    emoji: '🌲',
    name: '黑森林',
    desc: '苍郁密林，落叶与蕨草铺满林间空地',
    palette: {
      bgFrom: 'hsl(150 30% 30%)',
      bgTo: 'hsl(170 32% 17%)',
      map: hslToInt(110, 0.3, 0.7),
      grid: 0x000000,
      gridAlpha: 0.07,
      shadow: 0x000000,
    },
    decor: {
      emojis: ['🌲', '🌳', '🌿', '🍂', '🍃', '🪨'],
      sizeU: [0.5, 1.2],
      alpha: [0.05, 0.1],
      density: [0.07, 0.1],
      maxTiltRad: 0.35,
    },
  },
  desert: {
    emoji: '🏜️',
    name: '荒漠',
    desc: '烈日荒原，仙人掌与枯骨散落黄沙',
    palette: {
      bgFrom: 'hsl(30 42% 36%)',
      bgTo: 'hsl(15 38% 20%)',
      map: hslToInt(45, 0.48, 0.76),
      grid: 0x000000,
      gridAlpha: 0.06,
      shadow: 0x000000,
    },
    decor: {
      emojis: ['🌵', '🪨', '🦴', '💀', '🥀'],
      sizeU: [0.5, 1.1],
      alpha: [0.05, 0.1],
      // 荒漠刻意更稀疏
      density: [0.05, 0.08],
      maxTiltRad: 0.3,
    },
  },
  snow: {
    emoji: '❄️',
    name: '雪原',
    desc: '冰封旷野，风雪在大地刻下冰晶',
    palette: {
      bgFrom: 'hsl(210 34% 34%)',
      bgTo: 'hsl(235 30% 18%)',
      map: hslToInt(205, 0.28, 0.82),
      grid: 0x000000,
      gridAlpha: 0.06,
      shadow: 0x000000,
    },
    decor: {
      emojis: ['❄️', '🧊', '✨'],
      sizeU: [0.4, 1.0],
      alpha: [0.06, 0.11],
      density: [0.08, 0.12],
      // 雪花/冰晶无上下之分，全向旋转
      maxTiltRad: Math.PI,
    },
  },
} as const satisfies Record<string, MapSpec>

export type MapId = keyof typeof MAPS
export const MAP_IDS = Object.keys(MAPS) as readonly MapId[]

export function sanitizeMapId(id: unknown): MapId {
  return typeof id === 'string' && id in MAPS ? (id as MapId) : MAP_IDS[0]!
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

/** 逐局随机的装饰摆放：地图自身的 1×1 格即虚拟网格，每格按密度掷
 * 是否放置，格内随机 offset 破坏规整感；中心钳制进地图，避免探出边缘 */
export function rollDecor(
  spec: MapDecor,
  rand: () => number,
  cols: number,
  rows: number,
): DecorInstance[] {
  const density = spec.density[0] + rand() * (spec.density[1] - spec.density[0])
  const out: DecorInstance[] = []
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (rand() >= density) continue
      const emoji = spec.emojis[Math.min(spec.emojis.length - 1, Math.floor(rand() * spec.emojis.length))]!
      const sizeU = spec.sizeU[0] + rand() * (spec.sizeU[1] - spec.sizeU[0])
      const clamp = (v: number, max: number): number =>
        Math.min(Math.max(v, sizeU / 2), max - sizeU / 2)
      out.push({
        emoji,
        xU: clamp(cx + rand(), cols),
        yU: clamp(cy + rand(), rows),
        sizeU,
        alpha: spec.alpha[0] + rand() * (spec.alpha[1] - spec.alpha[0]),
        rotation: (rand() * 2 - 1) * spec.maxTiltRad,
      })
    }
  }
  return out
}
