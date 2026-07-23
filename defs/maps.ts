import { hslToInt } from '../src/core/palette.ts'
import type { MapDef } from '../src/maps/registry'
import type { EnemyMixRow } from '../src/enemies/registry'

// 创作层（不进运行时 bundle）：地图数据行（调色板以 HSL 书写，生成时算成 int）。

// 出场配比：编排属于地图——每张图一份专属出怪表，基础怪（zombie 等）跨图复用，
// 专精怪错开分布，让每张图的怪潮手感各不相同。新怪按波次渐入，zombie 有下限兜底。

/** 黑森林：幽林追击 + 蝗群挤压 + 林祭司群奶（专精：ghost/locust/mushroom/elf） */
const FOREST_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 80, perWave: -2, min: 40, max: 80 },
  { kind: 'ghost', sinceWave: 1, base: 15, perWave: 1, min: 12, max: 30 },
  { kind: 'locust', sinceWave: 2, base: 14, perWave: 0.6, min: 0, max: 28 },
  { kind: 'slime', sinceWave: 2, base: 12, perWave: 0.4, min: 0, max: 22 },
  { kind: 'boar', sinceWave: 3, base: 8, perWave: 0.4, min: 0, max: 16 },
  { kind: 'mushroom', sinceWave: 4, base: 8, perWave: 0.4, min: 0, max: 16 },
  { kind: 'elf', sinceWave: 5, base: 4, perWave: 0.3, min: 0, max: 9 },
]

/** 荒漠：蝗灾 + 突刺野猪 + 偷币鼠 + 炮龟攻城（专精：locust/rat/turtle/creeper） */
const DESERT_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 78, perWave: -2, min: 38, max: 78 },
  { kind: 'locust', sinceWave: 1, base: 16, perWave: 0.8, min: 12, max: 32 },
  { kind: 'boar', sinceWave: 2, base: 10, perWave: 0.4, min: 0, max: 18 },
  { kind: 'snake', sinceWave: 3, base: 9, perWave: 0.3, min: 0, max: 14 },
  { kind: 'rat', sinceWave: 4, base: 6, perWave: 0.3, min: 0, max: 12 },
  { kind: 'creeper', sinceWave: 4, base: 6, perWave: 0.3, min: 0, max: 12 },
  { kind: 'turtle', sinceWave: 5, base: 5, perWave: 0.3, min: 0, max: 10 },
]

/** 奔流：泡泡分裂 + 定距毒蛇 + 炮龟 + 毒河豚（专精：blob/turtle/puffer） */
const RIVER_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 78, perWave: -2, min: 38, max: 78 },
  { kind: 'ghost', sinceWave: 1, base: 14, perWave: 0.8, min: 10, max: 28 },
  { kind: 'blob', sinceWave: 2, base: 12, perWave: 0.5, min: 0, max: 22 },
  { kind: 'slime', sinceWave: 2, base: 12, perWave: 0.4, min: 0, max: 22 },
  { kind: 'snake', sinceWave: 3, base: 9, perWave: 0.3, min: 0, max: 14 },
  { kind: 'puffer', sinceWave: 4, base: 6, perWave: 0.4, min: 0, max: 13 },
  { kind: 'turtle', sinceWave: 5, base: 5, perWave: 0.3, min: 0, max: 10 },
]

/** 工厂：外星游射 + 自爆怪 + 虫巢产线 + 石像哨兵 + 毒河豚（专精：invader/hive/gargoyle/puffer） */
const FACTORY_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 76, perWave: -2, min: 36, max: 76 },
  { kind: 'invader', sinceWave: 1, base: 14, perWave: 0.6, min: 10, max: 26 },
  { kind: 'slime', sinceWave: 2, base: 12, perWave: 0.4, min: 0, max: 22 },
  { kind: 'creeper', sinceWave: 3, base: 8, perWave: 0.4, min: 0, max: 16 },
  { kind: 'rat', sinceWave: 4, base: 6, perWave: 0.3, min: 0, max: 12 },
  { kind: 'gargoyle', sinceWave: 5, base: 5, perWave: 0.3, min: 0, max: 11 },
  { kind: 'puffer', sinceWave: 5, base: 5, perWave: 0.3, min: 0, max: 11 },
  { kind: 'hive', sinceWave: 7, base: 3, perWave: 0.15, min: 0, max: 6 },
]

/** 残垣：穿墙幽灵 + 石像鬼 + 林祭司群奶 + 自爆怪（专精：ghost/gargoyle/elf/mushroom） */
const RUINS_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 78, perWave: -2, min: 38, max: 78 },
  { kind: 'ghost', sinceWave: 1, base: 18, perWave: 1, min: 14, max: 34 },
  { kind: 'mushroom', sinceWave: 3, base: 8, perWave: 0.4, min: 0, max: 15 },
  { kind: 'snake', sinceWave: 3, base: 9, perWave: 0.3, min: 0, max: 14 },
  { kind: 'creeper', sinceWave: 4, base: 7, perWave: 0.3, min: 0, max: 13 },
  { kind: 'gargoyle', sinceWave: 4, base: 6, perWave: 0.3, min: 0, max: 12 },
  { kind: 'elf', sinceWave: 5, base: 4, perWave: 0.3, min: 0, max: 9 },
]

/** 晨昏原野·白天：见得远的正面怪，密集扑来（专精：boar/locust/slime/invader） */
const DAY_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 70, perWave: -2, min: 34, max: 70 },
  { kind: 'boar', sinceWave: 1, base: 18, perWave: 0.8, min: 12, max: 34 },
  { kind: 'locust', sinceWave: 1, base: 16, perWave: 0.8, min: 12, max: 32 },
  { kind: 'slime', sinceWave: 2, base: 12, perWave: 0.4, min: 0, max: 22 },
  { kind: 'invader', sinceWave: 3, base: 8, perWave: 0.4, min: 0, max: 16 },
]

/** 晨昏原野·黑夜：稀疏潜袭怪，雾里贴脸才现形（专精：ghost/gargoyle/snake/creeper/rat） */
const NIGHT_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 40, perWave: -1, min: 20, max: 40 },
  { kind: 'ghost', sinceWave: 1, base: 16, perWave: 1, min: 12, max: 30 },
  { kind: 'gargoyle', sinceWave: 2, base: 8, perWave: 0.4, min: 0, max: 16 },
  { kind: 'snake', sinceWave: 3, base: 9, perWave: 0.3, min: 0, max: 14 },
  { kind: 'creeper', sinceWave: 3, base: 7, perWave: 0.3, min: 0, max: 13 },
  { kind: 'rat', sinceWave: 4, base: 5, perWave: 0.3, min: 0, max: 11 },
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
    mix: FOREST_MIX,
    boss: 'treant',
  },
  desert: {
    emoji: '1f3dc',
    name: '荒漠',
    desc: '无边的大漠，可朝任意方向走到天涯；终波蝎王降临时毒雾收拢成圈',
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
    mix: DESERT_MIX,
    boss: 'scorpion',
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
    mix: RIVER_MIX,
    boss: 'croc',
  },
  void: {
    emoji: '1f3ed',
    name: '工厂',
    desc: '轰鸣的自动化车间，四壁皆是传送闸口——出这头即现那头',
    kind: 'void',
    palette: {
      bgFrom: 'hsl(210 16% 20%)',
      bgTo: 'hsl(214 22% 8%)',
      // map 色即钢板厂房地面（冷调钢灰，零件与实体在其上高对比）
      map: hslToInt(210, 0.08, 0.34),
      shadow: 0x000000,
    },
    decor: {
      // 散落厂房地面的齿轮/扳手/螺栓/油桶/料箱/工具（低透明度贴地，不抢战场读性）
      emojis: ['2699', '1f527', '1f529', '1f6e2', '1f4e6', '1f6e0'],
      sizeU: [0.3, 0.7],
      alpha: [0.14, 0.26],
      density: [0.05, 0.09],
    },
    mix: FACTORY_MIX,
    // 工厂专属 Boss：母机核心——激光环扫 + 液压重锤
    boss: 'mecha',
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
    mix: RUINS_MIX,
    // 残垣专属 Boss：拆迁鬼——犀角冲撞碾墙 + 落石无视遮挡
    boss: 'rhino',
  },
  daynight: {
    emoji: '1f304',
    name: '晨昏原野',
    desc: '随昼夜轮转的旷野：正午视野纵览全场，午夜相机收窄、四合起以身为心的迷雾；昼夜各出一批怪',
    kind: 'daynight',
    // 有界 30×30：正午拉远能纵览大半张图，午夜收窄成一小圈
    size: { w: 30, h: 30 },
    palette: {
      // 页面底色取暮色靛蓝→深夜紫（暗示昼夜过渡）
      bgFrom: 'hsl(245 30% 28%)',
      bgTo: 'hsl(258 34% 11%)',
      // map 色即旷野草地（暮色柔绿；白昼明亮，夜幕由迷雾另行压暗）
      map: hslToInt(150, 0.2, 0.6),
      shadow: 0x000000,
    },
    decor: {
      // 旷野植被：麦穗 / 蕨草 / 向日葵 / 雏菊 / 卵石（低透明度贴地）
      emojis: ['1f33e', '1f33f', '1f33b', '1f33c', '1faa8'],
      sizeU: [0.35, 0.9],
      alpha: [0.14, 0.26],
      density: [0.09, 0.13],
    },
    // mix = 昼夜两批并集（供图鉴/名录/兜底）；实际出怪由 dayMix/nightMix 按相位切换
    mix: [...DAY_MIX, ...NIGHT_MIX],
    dayMix: DAY_MIX,
    nightMix: NIGHT_MIX,
    // 晨昏原野专属 Boss：晦明——日冕环爆 + 月华坠
    boss: 'eclipse',
  },
} as const satisfies Record<string, MapDef>
