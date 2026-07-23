import { hslToInt } from '../src/core/palette.ts'
import type { MapDef } from '../src/maps/registry'
import type { EnemyMixRow } from '../src/enemies/registry'

// 创作层（不进运行时 bundle）：地图数据行（调色板以 HSL 书写，生成时算成 int）。

// 出场配比（暂四图共用，日后各图可分化）：新怪按波次渐入，僵尸/幽灵为主体，
// zombie 有下限兜底。编排属于地图——同一份表展开进每张图，运行时各存一份
const DEFAULT_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 80, perWave: -2, min: 40, max: 80 },
  { kind: 'ghost', sinceWave: 1, base: 15, perWave: 1, min: 15, max: 32 },
  { kind: 'invader', sinceWave: 2, base: 8, perWave: 0.3, min: 0, max: 12 },
  { kind: 'boar', sinceWave: 3, base: 8, perWave: 0.4, min: 0, max: 16 },
  { kind: 'snake', sinceWave: 4, base: 7, perWave: 0.3, min: 0, max: 10 },
  { kind: 'mushroom', sinceWave: 4, base: 7, perWave: 0.4, min: 0, max: 14 },
  { kind: 'rat', sinceWave: 5, base: 5, perWave: 0.3, min: 0, max: 10 },
  { kind: 'blob', sinceWave: 5, base: 7, perWave: 0.4, min: 0, max: 14 },
  { kind: 'slime', sinceWave: 2, base: 16, perWave: 0.4, min: 0, max: 28 },
  { kind: 'hive', sinceWave: 7, base: 3, perWave: 0.15, min: 0, max: 6 },
  { kind: 'creeper', sinceWave: 4, base: 6, perWave: 0.3, min: 0, max: 12 },
]

export const MAPS = {
  forest: {
    emoji: '1f332',
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
      emojis: ['1f332', '1f333', '1f33f', '1f342', '1f343', '1faa8'],
      sizeU: [0.35, 0.95],
      alpha: [0.14, 0.26],
      density: [0.1, 0.14],
    },
    mix: DEFAULT_MIX,
    boss: 'boss',
  },
  desert: {
    emoji: '1f3dc',
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
      emojis: ['1f335', '1faa8', '1f9b4', '1f480', '1f940'],
      sizeU: [0.35, 0.9],
      alpha: [0.14, 0.26],
      // 荒漠刻意更稀疏
      density: [0.08, 0.11],
    },
    mix: DEFAULT_MIX,
    boss: 'boss',
  },
  river: {
    emoji: '1f30a',
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
      emojis: ['1f33e', '1f33f', '1faa8', '1f333', '1f344'],
      sizeU: [0.4, 0.8],
      alpha: [0.3, 0.45],
      density: [0.1, 0.14],
    },
    drift: ['1f343', '1f338', '1fae7', '1f342'],
    mix: DEFAULT_MIX,
    boss: 'boss',
  },
  void: {
    emoji: '1f300',
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
      emojis: ['2728', '2b50', '1f4ab', '1fa90', '2604'],
      sizeU: [0.2, 0.65],
      alpha: [0.18, 0.34],
      density: [0.05, 0.08],
    },
    mix: DEFAULT_MIX,
    boss: 'boss',
  },
  ruins: {
    emoji: '1f3da',
    name: '残垣',
    desc: '断壁残垣的废墟回廊——墙挡人、挡弹、也挡视线；靠掩体、卡口与探头作战',
    kind: 'ruins',
    palette: {
      bgFrom: 'hsl(35 16% 28%)',
      bgTo: 'hsl(28 18% 12%)',
      // map 色即石质地面（暖灰褐；断壁由地面色压暗而来，读成同一石料）
      map: hslToInt(38, 0.12, 0.62),
      shadow: 0x000000,
    },
    decor: {
      // 瓦砾 / 碎砖 / 枯草：断壁之间的废墟碎屑，稀疏（墙才是主体）
      emojis: ['1faa8', '1f9f1', '1f940', '1f33f'],
      sizeU: [0.3, 0.7],
      alpha: [0.12, 0.22],
      density: [0.05, 0.08],
    },
    mix: DEFAULT_MIX,
    // 残垣专属 Boss：拆迁鬼——犀角冲撞碾墙 + 落石无视遮挡
    boss: 'rhino',
  },
} as const satisfies Record<string, MapDef>
