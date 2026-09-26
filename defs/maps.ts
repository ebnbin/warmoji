import { hslToInt } from '../src/util/palette.ts'
import type { MapDef } from '../src/types/maps'
import type { EnemyMixRow } from '../src/types/enemies'

const FOREST_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 80, perWave: -2, min: 40, max: 80 },
  { kind: 'ghost', sinceWave: 1, base: 15, perWave: 1, min: 12, max: 30 },
  { kind: 'locust', sinceWave: 2, base: 14, perWave: 0.6, min: 0, max: 28 },
  { kind: 'slime', sinceWave: 2, base: 12, perWave: 0.4, min: 0, max: 22 },
  { kind: 'boar', sinceWave: 3, base: 8, perWave: 0.4, min: 0, max: 16 },
  { kind: 'mushroom', sinceWave: 4, base: 8, perWave: 0.4, min: 0, max: 16 },
  { kind: 'elf', sinceWave: 5, base: 4, perWave: 0.3, min: 0, max: 9 },
]

const DESERT_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 78, perWave: -2, min: 38, max: 78 },
  { kind: 'locust', sinceWave: 1, base: 16, perWave: 0.8, min: 12, max: 32 },
  { kind: 'boar', sinceWave: 2, base: 10, perWave: 0.4, min: 0, max: 18 },
  { kind: 'snake', sinceWave: 3, base: 9, perWave: 0.3, min: 0, max: 14 },
  { kind: 'rat', sinceWave: 4, base: 6, perWave: 0.3, min: 0, max: 12 },
  { kind: 'creeper', sinceWave: 4, base: 6, perWave: 0.3, min: 0, max: 12 },
  { kind: 'turtle', sinceWave: 5, base: 5, perWave: 0.3, min: 0, max: 10 },
]

const RIVER_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 78, perWave: -2, min: 38, max: 78 },
  { kind: 'ghost', sinceWave: 1, base: 14, perWave: 0.8, min: 10, max: 28 },
  { kind: 'blob', sinceWave: 2, base: 12, perWave: 0.5, min: 0, max: 22 },
  { kind: 'slime', sinceWave: 2, base: 12, perWave: 0.4, min: 0, max: 22 },
  { kind: 'snake', sinceWave: 3, base: 9, perWave: 0.3, min: 0, max: 14 },
  { kind: 'puffer', sinceWave: 4, base: 6, perWave: 0.4, min: 0, max: 13 },
  { kind: 'turtle', sinceWave: 5, base: 5, perWave: 0.3, min: 0, max: 10 },
]

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

const RUINS_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 78, perWave: -2, min: 38, max: 78 },
  { kind: 'ghost', sinceWave: 1, base: 18, perWave: 1, min: 14, max: 34 },
  { kind: 'mushroom', sinceWave: 3, base: 8, perWave: 0.4, min: 0, max: 15 },
  { kind: 'snake', sinceWave: 3, base: 9, perWave: 0.3, min: 0, max: 14 },
  { kind: 'creeper', sinceWave: 4, base: 7, perWave: 0.3, min: 0, max: 13 },
  { kind: 'gargoyle', sinceWave: 4, base: 6, perWave: 0.3, min: 0, max: 12 },
  { kind: 'elf', sinceWave: 5, base: 4, perWave: 0.3, min: 0, max: 9 },
]

const DAY_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 70, perWave: -2, min: 34, max: 70 },
  { kind: 'boar', sinceWave: 1, base: 18, perWave: 0.8, min: 12, max: 34 },
  { kind: 'locust', sinceWave: 1, base: 16, perWave: 0.8, min: 12, max: 32 },
  { kind: 'slime', sinceWave: 2, base: 12, perWave: 0.4, min: 0, max: 22 },
  { kind: 'invader', sinceWave: 3, base: 8, perWave: 0.4, min: 0, max: 16 },
]

const NIGHT_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 40, perWave: -1, min: 20, max: 40 },
  { kind: 'ghost', sinceWave: 1, base: 16, perWave: 1, min: 12, max: 30 },
  { kind: 'gargoyle', sinceWave: 2, base: 8, perWave: 0.4, min: 0, max: 16 },
  { kind: 'snake', sinceWave: 3, base: 9, perWave: 0.3, min: 0, max: 14 },
  { kind: 'creeper', sinceWave: 3, base: 7, perWave: 0.3, min: 0, max: 13 },
  { kind: 'rat', sinceWave: 4, base: 5, perWave: 0.3, min: 0, max: 11 },
]

const SPACE_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 74, perWave: -2, min: 36, max: 74 },
  { kind: 'invader', sinceWave: 1, base: 16, perWave: 0.7, min: 12, max: 30 },
  { kind: 'alien', sinceWave: 2, base: 14, perWave: 0.6, min: 0, max: 26 },
  { kind: 'comet', sinceWave: 3, base: 9, perWave: 0.4, min: 0, max: 17 },
  { kind: 'ufo', sinceWave: 4, base: 7, perWave: 0.4, min: 0, max: 14 },
  { kind: 'gargoyle', sinceWave: 5, base: 5, perWave: 0.3, min: 0, max: 11 },
]

const ICE_MIX: readonly EnemyMixRow[] = [
  { kind: 'zombie', sinceWave: 1, base: 78, perWave: -2, min: 38, max: 78 },
  { kind: 'boar', sinceWave: 1, base: 16, perWave: 0.8, min: 12, max: 32 },
  { kind: 'ghost', sinceWave: 2, base: 12, perWave: 0.5, min: 0, max: 24 },
  { kind: 'blob', sinceWave: 2, base: 12, perWave: 0.5, min: 0, max: 22 },
  { kind: 'snake', sinceWave: 3, base: 9, perWave: 0.3, min: 0, max: 14 },
  { kind: 'turtle', sinceWave: 4, base: 6, perWave: 0.3, min: 0, max: 12 },
  { kind: 'creeper', sinceWave: 5, base: 6, perWave: 0.3, min: 0, max: 12 },
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
      density: [0.08, 0.11],
    },
    mix: DESERT_MIX,
    finalWaveSub: '毒雾收拢成圈，圈外持续掉血——别想苟！',
    infinite: { activeHalf: 32, spawnRingMin: 4, spawnRingMax: 16, chunkCells: 8, chunkPad: 1 },
    shrinkRing: { r0: 16, rMin: 12, holdMs: 6000, shrinkEndMs: 38000, tickMs: 500, tickDamage: 6 },
    boss: 'scorpion',
  },
  river: {
    emoji: '1f30a',
    name: '奔流',
    desc: '一条永不停歇的大河，万物皆随波逐流；两岸静看你逆流而战',
    kind: 'river',
    palette: {
      bgFrom: 'hsl(28 32% 30%)',
      bgTo: 'hsl(205 38% 15%)',
      map: hslToInt(197, 0.52, 0.66),
      shadow: 0x000000,
    },
    decor: {
      emojis: ['1f33e', '1f33f', '1faa8', '1f333', '1f344'],
      sizeU: [0.4, 0.8],
      alpha: [0.3, 0.45],
      density: [0.1, 0.14],
    },
    drift: ['1f343', '1f338', '1fae7', '1f342'],
    mix: RIVER_MIX,
    finalWaveSub: '大河没有退路，正面迎战！',
    river: {
      viewScale: 1.2,
      width: 12,
      flow: 1,
      driftCount: 18,
      driftSpeedMul: [0.75, 1.3],
      waveSlow: 0.6,
      waveFast: 1.2,
    },
    infinite: { activeHalf: 32, spawnRingMin: 4, spawnRingMax: 16, chunkCells: 8, chunkPad: 1 },
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
      map: hslToInt(210, 0.08, 0.34),
      shadow: 0x000000,
    },
    decor: {
      emojis: ['2699', '1f527', '1f529', '1f6e2', '1f4e6', '1f6e0'],
      sizeU: [0.3, 0.7],
      alpha: [0.14, 0.26],
      density: [0.05, 0.09],
    },
    mix: FACTORY_MIX,
    finalWaveSub: '环形厂区无处可退，正面迎战！',
    torus: {
      arenaLong: 24,
      arenaShort: 13.5,
      projectileLifeMs: 1500,
      frame: 0.3,
    },
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
      map: hslToInt(38, 0.12, 0.62),
      shadow: 0x000000,
    },
    decor: {
      emojis: ['1faa8', '1f9f1', '1f940', '1f33f'],
      sizeU: [0.3, 0.7],
      alpha: [0.12, 0.22],
      density: [0.05, 0.08],
    },
    mix: RUINS_MIX,
    walls: { blocks: 15, maxLen: 4, centerClearU: 3.5, spawnMinCellDist: 5, reflowMs: 120 },
    boss: 'rhino',
  },
  daynight: {
    emoji: '1f304',
    name: '晨昏原野',
    desc: '随昼夜轮转的旷野：正午视野纵览全场，午夜相机收窄、四合起以身为心的迷雾；昼夜各出一批怪',
    kind: 'daynight',
    size: { w: 30, h: 30 },
    palette: {
      bgFrom: 'hsl(245 30% 28%)',
      bgTo: 'hsl(258 34% 11%)',
      map: hslToInt(150, 0.2, 0.6),
      shadow: 0x000000,
    },
    decor: {
      emojis: ['1f33e', '1f33f', '1f33b', '1f33c', '1faa8'],
      sizeU: [0.35, 0.9],
      alpha: [0.14, 0.26],
      density: [0.09, 0.13],
    },
    mix: [...DAY_MIX, ...NIGHT_MIX],
    dayMix: DAY_MIX,
    nightMix: NIGHT_MIX,
    dayNight: {
      cycleSec: 48,
      startHour: 6,
      visionMax: 30,
      visionMid: 20,
      visionMin: 10,
      fogRadiusDusk: 11,
      fogRadiusMidnight: 3.5,
      fogAlphaMax: 0.9,
      daySpawnScale: 0.68,
      nightSpawnScale: 1.55,
    },
    finalWaveSub: '击败它，或撑过头目波——注意昼夜轮替，夜幕里它更难缠！',
    boss: 'eclipse',
  },
  space: {
    emoji: '1f30c',
    name: '深空',
    desc: '被黑洞禁锢的圆形星域——全程困在一个圈里，越靠边缘引力越强、谁也逃不出去；天体不时拖着直线横扫战场（敌我通吃），终波奇点正面决战',
    kind: 'space',
    palette: {
      bgFrom: 'hsl(245 45% 14%)',
      bgTo: 'hsl(255 55% 4%)',
      map: hslToInt(246, 0.45, 0.09),
      shadow: 0x000000,
    },
    decor: {
      emojis: ['2b50', '2728', '1f31f', '1f4ab'],
      sizeU: [0.3, 0.7],
      alpha: [0.16, 0.32],
      density: [0.06, 0.1],
    },
    mix: SPACE_MIX,
    finalWaveSub: '奇点降临——禁锢星域内已无处可逃，正面迎战！',
    space: {
      blackholeRadiusU: 12.5,
      meteor: {
        intervalMs: 15000,
        intervalJitterMs: 5000,
        warnMs: 1500,
        radiusU: 2.6,
        speedU: 14,
        travelU: 30,
        offsetU: 7,
        damage: 30,
      },
    },
    infinite: { activeHalf: 32, spawnRingMin: 4, spawnRingMax: 16, chunkCells: 8, chunkPad: 1 },
    boss: 'blackhole',
  },
  ice: {
    emoji: '2744',
    name: '浮冰',
    desc: '脚下是打滑的浮冰——不跟手、刹不住、会过冲；四周刺骨寒水，滑出冰面就掉血、越游越慢（敌我通吃）。低摩擦让击退格外突出，把敌人推下水淹死是这里的活路',
    kind: 'ice',
    palette: {
      bgFrom: 'hsl(205 45% 20%)',
      bgTo: 'hsl(215 55% 6%)',
      map: hslToInt(198, 0.32, 0.82),
      shadow: 0x0a1f33,
    },
    decor: {
      emojis: ['2744', '1f9ca'],
      sizeU: [0.3, 0.7],
      alpha: [0.14, 0.28],
      density: [0.05, 0.09],
    },
    mix: ICE_MIX,
    ice: {
      floeU: 25,
      traction: 0.12,
      waterTraction: 0.35,
      waterViscosity: 2.5,
      waterTeamDps: 16,
      waterEnemyDps: 32,
      waterTickMs: 250,
    },
    boss: 'croc',
  },
} as const satisfies Record<string, MapDef>
