import type { Banner, LegacyFightDef, LegacySpawnRule, RunDef, StepDef } from '../src/types/runs'
import { DIFFICULTY } from './difficulty.ts'
import { TEAM_BASELINE } from './team.ts'

/** 正式局：每波撑多久、哪几波来精英潮、从第几波起小怪可能是精英、头目波刷怪放慢几倍、每波带光圈的敌人几只 */
const CLASSIC = {
  waveSec: [20, 20, 25, 25, 30, 30, 40, 40, 40, 60, 50, 50, 50, 50, 70, 60, 60, 90],
  surgeWaves: [10, 15],
  eliteFrom: 10,
  eliteChance: 0.15,
  bossRelief: 2,
  carriers: {
    boss: { buff: 1, debuff: 2 },
    tiers: [
      { upToWave: 3, buff: 2, debuff: 1 },
      { upToWave: 8, buff: 2, debuff: 2 },
    ],
    fallback: { buff: 3, debuff: 3 },
  },
} as const

const SURGE_BANNER: Banner = { title: '精英来袭', sub: '敌人潮涌来，小心金边强敌！' }
/** 精英潮与头目在开打后多久登场 */
const EVENT_MS = 600

/** 带光圈的敌人几只：头目波按头目的，其余按波次档 */
function carrierBudget(wave: number, boss: boolean): { buff: number; debuff: number } {
  const cb = CLASSIC.carriers
  if (boss) return cb.boss
  return cb.tiers.find((t) => wave <= t.upToWave) ?? cb.fallback
}

/** 正式局的第 wave 波：撑过时长；第 2 波起有带光圈的敌人，精英波来一次精英潮，最后一波头目登场、打倒它也算过关 */
function classicFight(wave: number, sec: number, last: boolean): LegacyFightDef {
  const ms = sec * 1000
  const eliteChance = wave >= CLASSIC.eliteFrom ? { eliteChance: CLASSIC.eliteChance } : {}
  const spawns: LegacySpawnRule[] = [{ kind: 'stream', ...(last ? { intervalMul: CLASSIC.bossRelief } : {}), ...eliteChance }]
  if (wave >= 2) {
    const { buff, debuff } = carrierBudget(wave, last)
    spawns.push({ kind: 'carriers', buff, debuff, atMs: ms * 0.12, spanMs: ms * 0.7 })
  }
  if ((CLASSIC.surgeWaves as readonly number[]).includes(wave)) {
    const { count, elites, spreadMs } = DIFFICULTY.surge
    spawns.push({ kind: 'batch', atMs: EVENT_MS, squad: { count, elites, spreadMs, ...eliteChance }, banner: SURGE_BANNER })
  }
  if (last) spawns.push({ kind: 'boss', atMs: EVENT_MS })
  return { name: `第 ${wave} 波`, spawns, ends: last ? [{ kind: 'time', ms }, { kind: 'boss' }] : [{ kind: 'time', ms }] }
}

/** 正式局的步骤：第 k 波之前招到 k 人直到满编，第 2 波起每波之前进一次商店 */
function classicSteps(): StepDef[] {
  const secs = CLASSIC.waveSec
  return secs.flatMap((sec, i): StepDef[] => {
    const wave = i + 1
    const before: StepDef[] = []
    if (wave <= TEAM_BASELINE.team.maxSize) before.push({ kind: 'recruit', upTo: wave })
    if (wave > 1) before.push({ kind: 'shop' })
    return [...before, { kind: 'fight', fight: classicFight(wave, sec, wave === secs.length) }]
  })
}

/** 远征：选一名首发出发，三章各两关，每关几个阶段不停顿地换目标，每章第二关以头目收尾；击杀攒全队经验，升级时自选招人或给队员升级 */
const EXPEDITION = {
  emoji: '1f9ed',
  name: '远征',
  desc: '选一名首发出发，穿过黑森林、残垣与深空三片地区；每关连着打几段，目标一段接一段地换，关与关之间逛商店；击杀攒全队经验，升级时捡起掉落的升级道具，招人或给队员升级；每章以头目收尾，击败深空的奇点就是胜利',
  stars: [{ kind: 'downs', count: 15 }, { kind: 'time', ms: 660_000 }],
  rules: { between: 'rest' },
  teamLevel: { base: 26, growth: 1.24, maxLevel: 15 },
  steps: [
    { kind: 'recruit', upTo: 1 },
    {
      kind: 'fight',
      fight: {
        name: '1-1 林边',
        map: 'forest',
        clockSec: 0,
        phases: [
          {
            intro: { title: '第一章 · 黑森林', sub: '清空林边的三小批敌人；升级时走过去捡起掉落的升级道具' },
            mix: [
              { kind: 'zombie', weight: 4 },
              { kind: 'ghost', weight: 1 },
            ],
            spawns: [
              {
                kind: 'waves',
                atMs: 2500,
                gapMs: 2000,
                squads: [
                  { count: 3, enemy: 'zombie', at: { kind: 'far' } },
                  { count: 5, at: { kind: 'point', dx: 8, dy: 2, spread: 2 }, banner: { title: '第二批', sub: '幽灵飘得快，血却薄' } },
                  { count: 6, spreadMs: 3000, at: { kind: 'ring', dist: 7 }, banner: { title: '最后一批', sub: '从四面围上来了' } },
                ],
              },
            ],
            ends: [{ kind: 'cleared' }, { kind: 'time', ms: 45_000 }],
          },
          {
            intro: { title: '蝗灾', sub: '五十只跳蝗成群扑来，一只不留' },
            spawns: [
              {
                kind: 'stream',
                intervalMs: 600,
                total: 50,
                mix: [
                  { kind: 'locust', weight: 3 },
                  { kind: 'zombie', weight: 1 },
                ],
              },
            ],
            ends: [{ kind: 'cleared' }],
          },
          {
            intro: { title: '精英野猪', sub: '金边的精英更硬、撞人更疼，经验多四倍，打倒它还会掉下增益；清场过关' },
            spawns: [
              {
                kind: 'batch',
                atMs: 1500,
                squad: { count: 1, enemy: 'boar', elites: 1, carry: 'buff', escort: { enemy: 'zombie', count: 5 }, at: { kind: 'point', dx: 0, dy: -7, spread: 2 } },
              },
            ],
            ends: [{ kind: 'cleared' }],
          },
        ],
      },
    },
    { kind: 'shop', tier: 4 },
    {
      kind: 'fight',
      fight: {
        name: '1-2 蛛后',
        map: 'forest',
        clockSec: 90,
        phases: [
          {
            intro: { title: '萨满营地', sub: '萨满会给同伴回血，先杀它' },
            spawns: [
              {
                kind: 'waves',
                atMs: 2500,
                gapMs: 2500,
                squads: [
                  { count: 8, enemy: 'zombie', escort: { enemy: 'elf', count: 1 }, at: { kind: 'point', dx: -7, dy: -6, spread: 2.5 } },
                  { count: 8, enemy: 'slime', escort: { enemy: 'elf', count: 2 }, at: { kind: 'point', dx: 7, dy: 5, spread: 2.5 }, banner: { title: '黏液虫', sub: '蹭到就糊住，攻速大降' } },
                  { count: 8, enemy: 'zombie', escort: { enemy: 'elf', count: 2 }, spreadMs: 1500, at: { kind: 'ring', dist: 7 }, banner: { title: '营地倾巢', sub: '两个萨满压阵' } },
                ],
              },
            ],
            ends: [{ kind: 'cleared' }, { kind: 'time', ms: 70_000 }],
          },
          {
            intro: { title: '蛛卵林', sub: '蛛卵 6 秒不打破就结成缠人的网；撑到不再产卵，再清空林子' },
            mix: [
              { kind: 'zombie', weight: 3 },
              { kind: 'ghost', weight: 1 },
              { kind: 'mushroom', weight: 1 },
            ],
            spawns: [
              { kind: 'stream', intervalMs: 900, untilMs: 24_000 },
              { kind: 'batch', atMs: 2000, every: 7000, times: 4, squad: { count: 4, enemy: 'sapling', at: { kind: 'ring', dist: 5 } } },
            ],
            ends: [{ kind: 'cleared' }],
          },
          {
            spawns: [
              { kind: 'batch', atMs: 1500, squad: { count: 1, enemy: 'treant', stats: { mul: { maxHp: 0.35 } } }, banner: { title: '蛛后现身', sub: '打破她产下的蛛卵，别被网缠住' } },
            ],
            ends: [{ kind: 'boss' }],
          },
        ],
        reward: { coins: 60, heal: true },
      },
    },
    { kind: 'shop', tier: 7 },
    {
      kind: 'fight',
      fight: {
        name: '2-1 断墙之间',
        map: 'ruins',
        clockSec: 190,
        phases: [
          {
            intro: { title: '第二章 · 残垣', sub: '墙挡人、挡弹，也挡视线；清空三面来敌' },
            spawns: [
              {
                kind: 'waves',
                atMs: 2500,
                gapMs: 2500,
                squads: [
                  { count: 8, enemy: 'skeleton', at: { kind: 'point', dx: 0, dy: -9, spread: 2.5 }, banner: { title: '北面', sub: '骷髅兵打散了还会爬起来一次' } },
                  { count: 8, enemy: 'zombie', escort: { enemy: 'snake', count: 3 }, at: { kind: 'point', dx: 9, dy: 0, spread: 2.5 }, banner: { title: '东面', sub: '毒蛇躲在后面吐毒，借墙挡住' } },
                  { count: 10, enemy: 'skeleton', escort: { enemy: 'knight', count: 2 }, at: { kind: 'point', dx: -9, dy: 0, spread: 2.5 }, banner: { title: '西面', sub: '狼骑：先打狼，再打人' } },
                ],
              },
            ],
            ends: [{ kind: 'cleared' }],
          },
          {
            intro: { title: '引爆', sub: '60 秒内依次踩过三个信标；自爆怪专找你，别让它贴身' },
            spawns: [
              { kind: 'stream', intervalMs: 1200, enemy: 'zombie' },
              { kind: 'stream', intervalMs: 3600, enemy: 'creeper', huntLeader: true },
            ],
            ends: [
              { kind: 'hold', ms: 12_000, radius: 1.8, points: [{ dx: -8, dy: -8 }, { dx: 8, dy: -5 }, { dx: 0, dy: 8 }] },
              { kind: 'time', ms: 60_000, lose: true },
            ],
          },
        ],
        reward: { coins: 40 },
      },
    },
    { kind: 'shop', tier: 9 },
    {
      kind: 'fight',
      fight: {
        name: '2-2 暴龙',
        map: 'ruins',
        clockSec: 280,
        phases: [
          {
            intro: { title: '石像鬼回廊', sub: '石像鬼掉到四成血会石化回血，一口气打穿它' },
            spawns: [
              {
                kind: 'waves',
                atMs: 2500,
                gapMs: 2500,
                squads: [
                  { count: 10, enemy: 'skeleton', escort: { enemy: 'gargoyle', count: 2 }, at: { kind: 'point', dx: -8, dy: -6, spread: 2 } },
                  { count: 3, enemy: 'gargoyle', escort: { enemy: 'elf', count: 2 }, at: { kind: 'ring', dist: 6 }, banner: { title: '萨满守像', sub: '萨满会把石像鬼奶回来，先杀萨满' } },
                ],
              },
            ],
            ends: [{ kind: 'cleared' }],
          },
          {
            intro: { title: '狼骑悬赏', sub: '75 秒内击倒四名带着赏金逃窜的狼骑' },
            mix: [
              { kind: 'skeleton', weight: 2 },
              { kind: 'zombie', weight: 2 },
              { kind: 'snake', weight: 1 },
            ],
            spawns: [
              { kind: 'stream', intervalMs: 2000 },
              {
                kind: 'batch',
                atMs: 3000,
                squad: { count: 4, enemy: 'knight', stats: { mul: { maxHp: 1.5 } }, drive: { kind: 'flee', range: 5.5 }, at: { kind: 'far' }, bounty: true },
                banner: { title: '悬赏发布', sub: '四名狼骑带着赏金逃窜，把它们逼到墙角' },
              },
            ],
            ends: [{ kind: 'bounty' }, { kind: 'time', ms: 75_000, lose: true }],
          },
          {
            spawns: [
              {
                kind: 'batch',
                atMs: 1500,
                squad: { count: 1, enemy: 'rhino', stats: { mul: { maxHp: 0.55, damage: 0.8 } } },
                banner: { title: '暴龙现身', sub: '它会冲锋撞人，横着躲开；跺地前退出圈外' },
              },
            ],
            ends: [{ kind: 'boss' }],
          },
        ],
        reward: { coins: 120, heal: true },
      },
    },
    { kind: 'shop', tier: 12 },
    {
      kind: 'fight',
      fight: {
        name: '3-1 迷魂哨线',
        map: 'space',
        clockSec: 370,
        phases: [
          {
            intro: { title: '第三章 · 深空', sub: '流星越来越密，天体不时横扫：击杀 45 只，或撑过 40 秒' },
            spawns: [
              {
                kind: 'stream',
                intervalMs: 450,
                ramp: { toMs: 250, overMs: 30_000 },
                mix: [
                  { kind: 'alien', weight: 3 },
                  { kind: 'comet', weight: 2 },
                ],
              },
            ],
            ends: [{ kind: 'kills', count: 45 }, { kind: 'time', ms: 40_000 }],
          },
          {
            intro: { title: '迷魂哨线', sub: '迷魂眼会把人勾过去，先拆掉它们' },
            spawns: [
              {
                kind: 'waves',
                atMs: 2500,
                gapMs: 2500,
                squads: [
                  { count: 10, enemy: 'invader', escort: { enemy: 'siren', count: 3 }, at: { kind: 'ring', dist: 8 } },
                  { count: 8, enemy: 'ufo', escort: { enemy: 'siren', count: 3 }, at: { kind: 'ring', dist: 8 }, banner: { title: '飞碟', sub: '远远地绕着你射' } },
                  { count: 12, enemy: 'alien', escort: { enemy: 'siren', count: 4 }, spreadMs: 1500, at: { kind: 'ring', dist: 8 }, banner: { title: '最后一道哨线', sub: '四只迷魂眼' } },
                ],
              },
            ],
            ends: [{ kind: 'cleared' }],
          },
          {
            intro: { title: '深空信标', sub: '在信标圈里站满 10 秒，给奇点定位；45 秒内完成' },
            mix: [
              { kind: 'alien', weight: 2 },
              { kind: 'comet', weight: 1 },
              { kind: 'ufo', weight: 1 },
            ],
            spawns: [{ kind: 'stream', intervalMs: 800 }],
            ends: [
              { kind: 'hold', ms: 10_000, radius: 2, points: [{ dx: 0, dy: 0 }] },
              { kind: 'time', ms: 45_000, lose: true },
            ],
          },
        ],
        reward: { coins: 100, heal: true },
      },
    },
    { kind: 'shop', tier: 15 },
    {
      kind: 'fight',
      fight: {
        name: '3-2 奇点',
        map: 'space',
        clockSec: 450,
        phases: [
          {
            intro: { title: '精英潮', sub: '三波精英接连压上，只只都是金边' },
            mix: [
              { kind: 'ufo', weight: 1 },
              { kind: 'comet', weight: 1 },
              { kind: 'alien', weight: 2 },
            ],
            spawns: [
              {
                kind: 'waves',
                atMs: 2000,
                gapMs: 2000,
                squads: [
                  { count: 4, elites: 4, spreadMs: 1200 },
                  { count: 4, elites: 4, spreadMs: 1200, at: { kind: 'ring', dist: 7 }, banner: { title: '第二波精英', sub: '从四面压上来' } },
                  { count: 4, elites: 4, spreadMs: 1200, banner: { title: '最后一波精英', sub: '清掉它们，奇点就要现身' } },
                ],
              },
            ],
            ends: [{ kind: 'cleared' }],
          },
          {
            mix: [
              { kind: 'alien', weight: 2 },
              { kind: 'comet', weight: 1 },
            ],
            spawns: [
              { kind: 'stream', intervalMs: 3000 },
              { kind: 'batch', atMs: 1500, squad: { count: 1, enemy: 'blackhole', stats: { mul: { maxHp: 0.7 } } }, banner: { title: '奇点', sub: '最后一战：别踏进它的视界' } },
            ],
            ends: [{ kind: 'bossHp', below: 0.5 }],
          },
          {
            intro: { title: '奇点暴走', sub: '它只剩一半了，碎片从四面涌来；一口气打倒它' },
            mix: [
              { kind: 'alien', weight: 1 },
              { kind: 'comet', weight: 2 },
            ],
            spawns: [
              { kind: 'stream', intervalMs: 1800 },
              { kind: 'batch', atMs: 800, squad: { count: 6, enemy: 'comet', at: { kind: 'ring', dist: 6 } } },
            ],
            ends: [{ kind: 'boss' }],
          },
        ],
      },
    },
  ],
} as const satisfies RunDef

/** 实验关：地图与队伍都预设好，开局就打；每一关试一种过关条件或规则组合 */
const LABS = {
  sweep: {
    emoji: '1f9f9',
    name: '歼灭战',
    desc: '五批敌人一批接一批从不同方向压过来，清空全部就赢，不限时',
    note: '清场当胜利条件：节奏跟着清怪的速度走，每批之间有喘息',
    map: 'forest',
    team: { slots: [{ tags: ['defense'] }, { tags: ['damage', 'area'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    start: { wave: 4, sec: 90 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'time', ms: 90_000 }],
    steps: [
      {
        kind: 'fight',
        fight: {
          name: '歼灭战',
          intro: { title: '歼灭战', sub: '清空五批敌人' },
          spawns: [
            {
              kind: 'waves',
              atMs: 3000,
              gapMs: 2500,
              squads: [
                { count: 10, at: { kind: 'point', dx: 0, dy: -9, spread: 2 }, banner: { title: '第一批', sub: '北面来敌' } },
                { count: 14, at: { kind: 'point', dx: 9, dy: 0, spread: 2 }, banner: { title: '第二批', sub: '东面来敌' } },
                { count: 18, elites: 2, at: { kind: 'point', dx: -9, dy: 0, spread: 2 }, banner: { title: '第三批', sub: '西面来敌，带着精英' } },
                { count: 22, eliteChance: 0.15, at: { kind: 'ring', dist: 7 }, banner: { title: '第四批', sub: '四面合围' } },
                { count: 30, elites: 4, spreadMs: 3000, at: { kind: 'point', dx: 0, dy: 9, spread: 3 }, banner: { title: '最后一批', sub: '南面的大部队' } },
              ],
            },
          ],
          ends: [{ kind: 'cleared' }],
        },
      },
    ],
  },
  hunt: {
    emoji: '23f1',
    name: '猎杀令',
    desc: '一分钟内击杀 150 只；二十秒后敌人变多，四十秒后开始有敌人从身后摸上来',
    note: '击杀数当胜利条件、到点就输：逼着主动找怪打，躲着拖时间没用',
    map: 'desert',
    team: { slots: [{ tags: ['damage'] }, { tags: ['damage'] }, { tags: ['area'] }, { tags: ['mobile'] }], level: 2 },
    start: { wave: 5, sec: 150 },
    stars: [{ kind: 'time', ms: 50_000 }, { kind: 'downs', count: 0 }],
    steps: [
      {
        kind: 'fight',
        fight: {
          name: '猎杀令',
          intro: { title: '猎杀令', sub: '60 秒内击杀 150 只' },
          spawns: [
            { kind: 'stream', intervalMul: 0.7 },
            { kind: 'stream', fromMs: 20_000, intervalMul: 1.2, eliteChance: 0.2 },
            { kind: 'stream', fromMs: 40_000, intervalMul: 1.5, at: { kind: 'behind', dist: 5 } },
          ],
          ends: [
            { kind: 'kills', count: 150 },
            { kind: 'time', ms: 60_000, lose: true },
          ],
        },
      },
    ],
  },
  bounty: {
    emoji: '1f4b0',
    name: '悬赏',
    desc: '五名悬赏目标混在敌群里，看见队伍就逃；九十秒内把它们全部击倒',
    note: '指定目标当胜利条件：目标会逃，逼着队伍穿过敌群去追',
    map: 'ruins',
    team: { slots: ['detective', 'eagle', 'chipmunk'], level: 2 },
    start: { wave: 4, sec: 100 },
    stars: [{ kind: 'time', ms: 60_000 }, { kind: 'downs', count: 0 }],
    steps: [
      {
        kind: 'fight',
        fight: {
          name: '悬赏',
          intro: { title: '悬赏', sub: '击倒全部悬赏目标，它们会逃' },
          spawns: [
            { kind: 'stream', intervalMul: 1.3 },
            {
              kind: 'batch',
              atMs: 3000,
              squad: { count: 3, enemy: 'raccoon', elites: 3, hpMul: 2, drive: { kind: 'flee', range: 6 }, at: { kind: 'far' }, bounty: true },
              banner: { title: '悬赏发布', sub: '三名怪盗带着赏金逃窜' },
            },
            {
              kind: 'batch',
              atMs: 30_000,
              squad: { count: 2, enemy: 'knight', elites: 2, hpMul: 2, drive: { kind: 'flee', range: 7 }, at: { kind: 'far' }, bounty: true },
              banner: { title: '追加悬赏', sub: '两名狼骑也上了榜' },
            },
          ],
          ends: [{ kind: 'bounty' }, { kind: 'time', ms: 90_000, lose: true }],
        },
      },
    ],
  },
  hill: {
    emoji: '1f6a9',
    name: '据点轮转',
    desc: '队长在据点圈里站满 12 秒，据点就换到下一处，一共三处；敌人全都冲着队长来',
    note: '站位当胜利条件：放风筝行不通，要在圈里顶住',
    map: 'forest',
    team: { slots: ['guard', 'panda', { tags: ['support'] }, { tags: ['area'] }], level: 2 },
    start: { wave: 5, sec: 120 },
    stars: [{ kind: 'time', ms: 80_000 }, { kind: 'switches', count: 0 }],
    steps: [
      {
        kind: 'fight',
        fight: {
          name: '据点轮转',
          intro: { title: '据点轮转', sub: '队长站进圈里，站满就换下一处' },
          chaseLeader: true,
          spawns: [
            { kind: 'stream', intervalMul: 0.9 },
            { kind: 'batch', atMs: 25_000, squad: { count: 12, eliteChance: 0.2, at: { kind: 'ring', dist: 6 } }, banner: { title: '反扑', sub: '敌人围住了队长' } },
            { kind: 'batch', atMs: 50_000, squad: { count: 16, elites: 2, at: { kind: 'ring', dist: 6 } }, banner: { title: '再次反扑', sub: '精英带队' } },
          ],
          ends: [
            { kind: 'hold', ms: 36_000, radius: 2.5, points: [{ dx: -6, dy: -5 }, { dx: 6, dy: -2 }, { dx: -2, dy: 7 }] },
            { kind: 'time', ms: 120_000, lose: true },
          ],
        },
      },
    ],
  },
  dash: {
    emoji: '1f3c3',
    name: '突围',
    desc: '依次踩过废墟里的五个信标，每个站一秒；敌人源源不断地扑向队长，限时 75 秒',
    note: '把据点缩成一秒的信标：从守点变成跑图，考验穿插与走位',
    map: 'ruins',
    team: { slots: ['unicorn', 'kangaroo', 'frog'], level: 2 },
    start: { wave: 6, sec: 180 },
    stars: [{ kind: 'time', ms: 50_000 }, { kind: 'skills', count: 0 }],
    steps: [
      {
        kind: 'fight',
        fight: {
          name: '突围',
          intro: { title: '突围', sub: '依次踩过五个信标' },
          chaseLeader: true,
          spawns: [{ kind: 'stream', intervalMul: 0.6, cap: 120 }],
          ends: [
            { kind: 'hold', ms: 5000, radius: 1.6, points: [{ dx: -10, dy: -10 }, { dx: 10, dy: -10 }, { dx: 10, dy: 10 }, { dx: -10, dy: 10 }, { dx: 0, dy: 0 }] },
            { kind: 'time', ms: 75_000, lose: true },
          ],
        },
      },
    ],
  },
  gold: {
    emoji: '1fa99',
    name: '淘金热',
    desc: '75 秒内捡到 120 金币；偷币鼠会抢走地上的钱，打死它才吐出来',
    note: '金币当胜利条件：拾取和抢钱的敌人成了主角，打怪只是手段',
    map: 'void',
    team: { slots: [{ tags: ['damage', 'area'] }, { tags: ['mobile'] }, { tags: ['ranged'] }], level: 2 },
    start: { wave: 3, sec: 60 },
    stars: [{ kind: 'time', ms: 55_000 }, { kind: 'downs', count: 0 }],
    steps: [
      {
        kind: 'fight',
        fight: {
          name: '淘金热',
          intro: { title: '淘金热', sub: '75 秒内捡到 120 金币' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'slime', weight: 2 },
            { kind: 'raccoon', weight: 2 },
            { kind: 'rat', weight: 3 },
          ],
          spawns: [
            { kind: 'stream', intervalMul: 0.8 },
            { kind: 'stream', fromMs: 30_000, untilMs: 50_000, intervalMul: 0.5 },
            { kind: 'batch', atMs: 30_000, squad: { count: 8, enemy: 'rat', at: { kind: 'far' } }, banner: { title: '淘金高峰', sub: '一群偷币鼠来抢钱了' } },
          ],
          ends: [
            { kind: 'coins', count: 120 },
            { kind: 'time', ms: 75_000, lose: true },
          ],
        },
      },
    ],
  },
  iron: {
    emoji: '1f6e1',
    name: '铁人',
    desc: '撑过 60 秒，但只要有一名队员倒下就算输；敌人伤害提高三成，陨石照常横扫',
    note: '倒下即负：从「打得快」变成「不失误」，护住脆皮比输出更要紧',
    map: 'space',
    team: { slots: [{ tags: ['defense'] }, { tags: ['support'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    start: { wave: 6, sec: 150 },
    stars: [{ kind: 'kills', count: 100 }, { kind: 'skills', count: 0 }],
    steps: [
      {
        kind: 'fight',
        fight: {
          name: '铁人',
          intro: { title: '铁人', sub: '撑过 60 秒，谁都不许倒下' },
          enemyMods: { mul: { damage: 1.3 } },
          spawns: [{ kind: 'stream' }, { kind: 'carriers', buff: 2, debuff: 2, atMs: 5000, spanMs: 40_000 }],
          ends: [
            { kind: 'time', ms: 60_000 },
            { kind: 'downs', count: 1 },
          ],
        },
      },
    ],
  },
  ambush: {
    emoji: '1f440',
    name: '伏击',
    desc: '没有常规刷怪，敌人一阵阵直接冒在队伍四周和身后，现身前没有预兆；清空最后一阵就赢',
    note: '刷怪位置与预兆当变量：敌人不再从远处走来、也不提前示警，考验被包围时的反应',
    map: 'daynight',
    team: { slots: [{ tags: ['area'] }, { tags: ['control'] }, { tags: ['defense'] }], level: 2 },
    rules: { surprise: true },
    start: { wave: 4, sec: 90 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'time', ms: 55_000 }],
    steps: [
      {
        kind: 'fight',
        fight: {
          name: '伏击',
          intro: { title: '伏击', sub: '当心四周和身后' },
          spawns: [
            { kind: 'batch', atMs: 3000, squad: { count: 8, at: { kind: 'ring', dist: 4 } }, banner: { title: '包围', sub: '敌人从四面冒出来' } },
            { kind: 'batch', atMs: 11_000, squad: { count: 6, eliteChance: 0.3, at: { kind: 'behind', dist: 3 } }, banner: { title: '背后！', sub: '有东西摸到了身后' } },
            { kind: 'batch', atMs: 19_000, squad: { count: 12, elites: 1, at: { kind: 'ring', dist: 5 } }, banner: { title: '再次包围', sub: '圈子更大了' } },
            { kind: 'batch', atMs: 27_000, squad: { count: 8, elites: 2, at: { kind: 'behind', dist: 3 } }, banner: { title: '背后！', sub: '精英摸上来了' } },
            { kind: 'batch', atMs: 35_000, squad: { count: 20, eliteChance: 0.2, spreadMs: 1500, at: { kind: 'ring', dist: 6 } }, banner: { title: '最后的合围', sub: '清掉它们' } },
          ],
          ends: [{ kind: 'cleared' }],
        },
      },
    ],
  },
  gauntlet: {
    emoji: '1f451',
    name: '头目连战',
    desc: '连打三名别处的头目，只有六成血量；每场之前进一次商店、满血开打，换队长要冷却 8 秒',
    note: '步骤只有商店与头目战交替；换人冷却让「轮着换人放技能」变成要算计的事',
    map: 'forest',
    team: { slots: ['bear', 'mage', 'medic', 'cowboy'], level: 3 },
    rules: { between: 'full', leader: { switchCdMs: 8000 } },
    coins: 150,
    start: { wave: 10, sec: 300 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'time', ms: 150_000 }],
    steps: [
      { kind: 'shop' },
      {
        kind: 'fight',
        fight: {
          name: '第一战 · 暴龙',
          spawns: [
            { kind: 'stream', intervalMul: 3 },
            { kind: 'batch', atMs: 800, squad: { count: 1, enemy: 'rhino', hpMul: 0.6 }, banner: { title: '暴龙出现', sub: '击败它！' } },
          ],
          ends: [{ kind: 'boss' }],
        },
      },
      { kind: 'shop' },
      {
        kind: 'fight',
        fight: {
          name: '第二战 · 蝎王',
          spawns: [
            { kind: 'stream', intervalMul: 3 },
            { kind: 'batch', atMs: 800, squad: { count: 1, enemy: 'scorpion', hpMul: 0.6 }, banner: { title: '蝎王出现', sub: '击败它！' } },
          ],
          ends: [{ kind: 'boss' }],
        },
      },
      { kind: 'shop' },
      {
        kind: 'fight',
        fight: {
          name: '终战 · 夜伯爵',
          spawns: [
            { kind: 'stream', intervalMul: 3 },
            { kind: 'batch', atMs: 800, squad: { count: 1, enemy: 'eclipse', hpMul: 0.6 }, banner: { title: '夜伯爵出现', sub: '最后一战！' } },
          ],
          ends: [{ kind: 'boss' }],
        },
      },
    ],
  },
  attrition: {
    emoji: '26b0',
    name: '车轮战',
    desc: '六轮敌人轮番上阵；倒下的队员不会自己起来，队长到身边站 2.5 秒能扶起来，军医的急救包也能救，但全队一共只能起来 3 次',
    note: '倒下不再是等时间：去扶人要顶着火力，起来的次数有限，减员成了要管的资源',
    map: 'ice',
    team: { slots: ['medic', 'guard', 'jellyfish', 'fencer'], level: 2 },
    rules: { revive: false, rescue: { ms: 2500, radius: 1.2 }, lives: 3 },
    start: { wave: 5, sec: 120 },
    stars: [{ kind: 'lives', count: 2 }, { kind: 'time', ms: 120_000 }],
    steps: [
      {
        kind: 'fight',
        fight: {
          name: '车轮战',
          intro: { title: '车轮战', sub: '倒下要队长去扶，全队只能起来 3 次' },
          spawns: [
            {
              kind: 'waves',
              atMs: 3000,
              gapMs: 3000,
              squads: [
                { count: 10, banner: { title: '第一轮', sub: '热身' } },
                { count: 14, elites: 1, banner: { title: '第二轮', sub: '来了个精英' } },
                { count: 18, eliteChance: 0.1, banner: { title: '第三轮', sub: '越来越多' } },
                { count: 12, elites: 4, banner: { title: '第四轮', sub: '精英小队' } },
                { count: 26, eliteChance: 0.15, spreadMs: 2500, banner: { title: '第五轮', sub: '大部队' } },
                { count: 1, enemy: 'swan', hpMul: 0.5, banner: { title: '最后一轮', sub: '霜鸦亲自上阵' } },
              ],
            },
          ],
          ends: [{ kind: 'cleared' }],
        },
      },
    ],
  },
  triathlon: {
    emoji: '1f3c5',
    name: '三关连闯',
    desc: '两人出发，连过猎杀、据点、头目三关；关与关之间招一名新队员、逛一次商店；一关打完时还倒着的队员，这一局都回不来',
    note: '同一局里每一场的过关条件都不同；永久减员让每一关的伤亡都带到后面',
    map: 'desert',
    team: { slots: [{ tags: ['damage', 'ranged'] }, { tags: ['defense'] }], level: 1 },
    rules: { between: 'permadeath' },
    coins: 40,
    start: { wave: 3, sec: 60 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'time', ms: 150_000 }],
    steps: [
      {
        kind: 'fight',
        fight: {
          name: '第一关 · 猎杀',
          intro: { title: '第一关 · 猎杀', sub: '45 秒内击杀 40 只' },
          spawns: [{ kind: 'stream', intervalMul: 0.8 }],
          ends: [
            { kind: 'kills', count: 40 },
            { kind: 'time', ms: 45_000, lose: true },
          ],
        },
      },
      { kind: 'recruit', upTo: 3 },
      { kind: 'shop' },
      {
        kind: 'fight',
        fight: {
          name: '第二关 · 据点',
          intro: { title: '第二关 · 据点', sub: '队长在圈里站满 15 秒' },
          chaseLeader: true,
          spawns: [{ kind: 'stream' }],
          ends: [
            { kind: 'hold', ms: 15_000, radius: 2.5, points: [{ dx: 6, dy: -6 }] },
            { kind: 'time', ms: 60_000, lose: true },
          ],
        },
      },
      { kind: 'recruit', upTo: 4 },
      { kind: 'shop' },
      {
        kind: 'fight',
        fight: {
          name: '第三关 · 头目',
          spawns: [{ kind: 'stream', intervalMul: 2 }, { kind: 'boss', atMs: EVENT_MS }],
          ends: [{ kind: 'boss' }, { kind: 'time', ms: 90_000 }],
        },
      },
    ],
  },
  elite: {
    emoji: '1f479',
    name: '精英狩猎',
    desc: '场上最多十二只敌人，但只只都是精英；两分钟内击杀 30 只',
    note: '换掉配比、全员精英、固定刷怪间隔，再给队伍加伤：数量少质量高的节奏',
    map: 'ruins',
    team: { slots: [{ tags: ['damage'] }, { tags: ['damage'] }, { tags: ['support'] }], level: 3 },
    start: { wave: 8, sec: 200 },
    stars: [{ kind: 'time', ms: 80_000 }, { kind: 'downs', count: 0 }],
    steps: [
      {
        kind: 'fight',
        fight: {
          name: '精英狩猎',
          intro: { title: '精英狩猎', sub: '只只都是精英，击杀 30 只' },
          mix: [
            { kind: 'knight', weight: 2 },
            { kind: 'skeleton', weight: 2 },
            { kind: 'gargoyle', weight: 1 },
          ],
          rules: { mods: { mul: { damage: 1.25 } } },
          spawns: [{ kind: 'stream', intervalMs: 1500, eliteChance: 1, cap: 12 }],
          ends: [
            { kind: 'kills', count: 30 },
            { kind: 'time', ms: 120_000, lose: true },
          ],
        },
      },
    ],
  },
  focus: {
    emoji: '1f3f9',
    name: '众矢之的',
    desc: '你操控的法师就是队长，不能换人；所有敌人都冲着他来，他倒下就输。撑过 60 秒',
    note: '队长倒下就输、不能换人：玩家本人成了要护住的目标，躲闪比输出要紧',
    map: 'desert',
    team: { slots: ['mage', 'guard', 'panda', 'medic'], level: 2 },
    rules: { leader: { lock: true, critical: true } },
    start: { wave: 5, sec: 120 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'kills', count: 80 }],
    steps: [
      {
        kind: 'fight',
        fight: {
          name: '众矢之的',
          intro: { title: '众矢之的', sub: '你倒下就输，撑过 60 秒' },
          chaseLeader: true,
          spawns: [
            { kind: 'stream', intervalMul: 0.9 },
            { kind: 'batch', atMs: 20_000, squad: { count: 10, elites: 1, at: { kind: 'ring', dist: 5 } }, banner: { title: '合围', sub: '敌人围住了你' } },
            { kind: 'batch', atMs: 40_000, squad: { count: 8, eliteChance: 0.3, at: { kind: 'behind', dist: 3 } }, banner: { title: '背后！', sub: '有东西摸到了身后' } },
          ],
          ends: [{ kind: 'time', ms: 60_000 }],
        },
      },
    ],
  },
  brawl: {
    emoji: '1f93c',
    name: '近身肉搏',
    desc: '只能招募近战角色，全队自带吸血；一名近战出发，打三场，场与场之间招人、逛商店',
    note: '招募限定加一局级别的修正：阵容被规则锁成一种打法，回血只能靠贴身输出',
    map: 'forest',
    team: { slots: [{ tags: ['melee'] }], level: 1 },
    rules: { recruit: { tags: ['melee'] }, mods: { add: { lifesteal: 0.06 } } },
    coins: 40,
    start: { wave: 3, sec: 60 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'time', ms: 150_000 }],
    steps: [
      {
        kind: 'fight',
        fight: {
          name: '第一场 · 立足',
          intro: { title: '第一场 · 立足', sub: '一个人撑过 40 秒' },
          spawns: [{ kind: 'stream' }],
          ends: [{ kind: 'time', ms: 40_000 }],
        },
      },
      { kind: 'recruit', upTo: 3 },
      { kind: 'shop' },
      {
        kind: 'fight',
        fight: {
          name: '第二场 · 清场',
          intro: { title: '第二场 · 清场', sub: '清空三批敌人' },
          spawns: [
            {
              kind: 'waves',
              atMs: 3000,
              gapMs: 2500,
              squads: [
                { count: 12, banner: { title: '第一批', sub: '贴上去打' } },
                { count: 16, elites: 1, banner: { title: '第二批', sub: '来了个精英' } },
                { count: 20, eliteChance: 0.15, banner: { title: '最后一批', sub: '清掉它们' } },
              ],
            },
          ],
          ends: [{ kind: 'cleared' }],
        },
      },
      { kind: 'recruit', upTo: 4 },
      { kind: 'shop' },
      {
        kind: 'fight',
        fight: {
          name: '第三场 · 头目',
          spawns: [{ kind: 'stream', intervalMul: 2 }, { kind: 'boss', atMs: EVENT_MS }],
          ends: [{ kind: 'boss' }, { kind: 'time', ms: 75_000 }],
        },
      },
    ],
  },
  night: {
    emoji: '1f319',
    name: '夜猎',
    desc: '四下一片漆黑，只看得见队长身边 5 格；四名悬赏目标藏在黑暗里，看见队伍就逃，箭头指向最近的一个。90 秒内把它们全部击倒',
    note: '视野缩小：远处的敌人和预兆都看不见，追目标只能跟着箭头摸黑走',
    map: 'forest',
    team: { slots: [{ tags: ['damage', 'ranged'] }, { tags: ['mobile'] }, { tags: ['support'] }], level: 2 },
    rules: { vision: 5 },
    start: { wave: 4, sec: 100 },
    stars: [{ kind: 'time', ms: 60_000 }, { kind: 'downs', count: 0 }],
    steps: [
      {
        kind: 'fight',
        fight: {
          name: '夜猎',
          intro: { title: '夜猎', sub: '摸黑击倒全部悬赏目标' },
          spawns: [
            { kind: 'stream', intervalMul: 1.2 },
            {
              kind: 'batch',
              atMs: 3000,
              squad: { count: 2, enemy: 'raccoon', elites: 2, hpMul: 1.5, drive: { kind: 'flee', range: 6 }, at: { kind: 'far' }, bounty: true },
              banner: { title: '悬赏发布', sub: '两名怪盗躲进了黑暗' },
            },
            {
              kind: 'batch',
              atMs: 25_000,
              squad: { count: 2, enemy: 'knight', elites: 2, hpMul: 1.5, drive: { kind: 'flee', range: 7 }, at: { kind: 'far' }, bounty: true },
              banner: { title: '追加悬赏', sub: '两名狼骑也摸黑逃窜' },
            },
          ],
          ends: [{ kind: 'bounty' }, { kind: 'time', ms: 90_000, lose: true }],
        },
      },
    ],
  },
  bootcamp: {
    emoji: '1f530',
    name: '新兵营',
    desc: '队员永远是 1 级、不能放主动技能；商店只卖普通和稀有道具、不能刷新。两人出发打三场，场与场之间招人、逛商店',
    note: '把升级、技能和刷新都锁住：成长只剩买什么，打法只剩走位和站位',
    map: 'desert',
    team: { slots: [{ tags: ['damage'] }, { tags: ['defense'] }], level: 1 },
    rules: { maxLevel: 1, skills: false, shop: { rarity: { max: 'rare' }, reroll: false } },
    coins: 60,
    start: { wave: 3, sec: 60 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'switches', count: 0 }],
    steps: [
      {
        kind: 'fight',
        fight: {
          name: '第一场 · 列队',
          intro: { title: '第一场 · 列队', sub: '撑过 40 秒' },
          spawns: [{ kind: 'stream' }],
          ends: [{ kind: 'time', ms: 40_000 }],
        },
      },
      { kind: 'recruit', upTo: 3 },
      { kind: 'shop' },
      {
        kind: 'fight',
        fight: {
          name: '第二场 · 清场',
          intro: { title: '第二场 · 清场', sub: '清空三批敌人' },
          spawns: [
            {
              kind: 'waves',
              atMs: 3000,
              gapMs: 2500,
              squads: [
                { count: 12, banner: { title: '第一批', sub: '稳住阵脚' } },
                { count: 16, elites: 1, banner: { title: '第二批', sub: '来了个精英' } },
                { count: 20, eliteChance: 0.15, banner: { title: '最后一批', sub: '清掉它们' } },
              ],
            },
          ],
          ends: [{ kind: 'cleared' }],
        },
      },
      { kind: 'recruit', upTo: 4 },
      { kind: 'shop' },
      {
        kind: 'fight',
        fight: {
          name: '第三场 · 头目',
          spawns: [{ kind: 'stream', intervalMul: 2 }, { kind: 'boss', atMs: EVENT_MS }],
          ends: [{ kind: 'boss' }, { kind: 'time', ms: 75_000 }],
        },
      },
    ],
  },
} as const satisfies Record<string, RunDef>

export const RUNS = {
  classic: {
    emoji: '2694',
    name: '正式局',
    desc: '从一名首发起步，每波之间招募与购物，撑过十八波，终波击败或撑过头目',
    record: true,
    steps: classicSteps(),
  },
  expedition: EXPEDITION,
  sandbox: {
    emoji: '1f3af',
    name: '试炼场',
    desc: '队员、敌人、规模与强度都由开发者面板的旋钮决定，不计时、不结束',
    team: 'knobs',
    coins: 999_999,
    steps: [{ kind: 'fight', fight: { spawns: [{ kind: 'knobs' }], ends: [] } }],
  },
  ...LABS,
} as const satisfies Record<string, RunDef>
