import { hslToInt } from '../src/lib/palette.ts'
import type { MapDef } from '../src/maps/registry'

// 创作层（不进运行时 bundle）：地图数据行（调色板以 HSL 书写，生成时算成 int）。

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
      sizeU: [0.35, 0.95],
      alpha: [0.14, 0.26],
      density: [0.1, 0.14],
    },
  },
  desert: {
    emoji: '🏜️',
    name: '荒漠',
    desc: '无边的大漠，可朝任意方向走到天涯；终波赤鬼降临时毒雾收拢成圈',
    kind: 'infinite',
    palette: {
      bgFrom: 'hsl(30 42% 36%)',
      bgTo: 'hsl(15 38% 20%)',
      map: hslToInt(45, 0.48, 0.76),
      shadow: 0x000000,
    },
    decor: {
      emojis: ['🌵', '🪨', '🦴', '💀', '🥀'],
      sizeU: [0.35, 0.9],
      alpha: [0.14, 0.26],
      // 荒漠刻意更稀疏
      density: [0.08, 0.11],
    },
  },
  river: {
    emoji: '🌊',
    name: '奔流',
    desc: '一条永不停歇的大河，万物皆随波逐流；两岸静看你逆流而战',
    kind: 'river',
    palette: {
      // 页面底色呼应「棕岸 + 蓝水」主题
      bgFrom: 'hsl(28 32% 30%)',
      bgTo: 'hsl(205 38% 15%)',
      // map 色即河水基色（浅亮蓝，与棕色两岸强对比；岸带由场景另行绘制）
      map: hslToInt(197, 0.52, 0.66),
      shadow: 0x000000,
    },
    decor: {
      // 岸上静态植被（战斗区外，透明度可比战斗区装饰略高）
      emojis: ['🌾', '🌿', '🪨', '🌳', '🍄'],
      sizeU: [0.4, 0.8],
      alpha: [0.3, 0.45],
      density: [0.1, 0.14],
    },
    drift: ['🍃', '🌸', '🫧', '🍂'],
  },
  void: {
    emoji: '🌀',
    name: '虚空',
    desc: '悬浮虚空的一方战场，四边皆是传送门——穿出此缘，即现彼缘',
    kind: 'void',
    palette: {
      bgFrom: 'hsl(258 32% 14%)',
      bgTo: 'hsl(240 45% 7%)',
      // map 色即虚空地板（深邃暗紫，实体与星光在其上高对比）
      map: hslToInt(252, 0.28, 0.15),
      shadow: 0x000000,
    },
    decor: {
      // 星空点缀（静态散布，低透明度）
      emojis: ['✨', '⭐', '💫', '🪐', '☄️'],
      sizeU: [0.2, 0.65],
      alpha: [0.18, 0.34],
      density: [0.05, 0.08],
    },
  },
} as const satisfies Record<string, MapDef>
