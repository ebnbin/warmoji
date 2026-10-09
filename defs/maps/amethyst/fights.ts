import type { ExperimentDef } from '../../../src/types/runs'

/** 这张图的关卡：每个只试一种新玩法，靠这张图自己的机制成立 */
export const FIGHTS = {
  geodeRun: {
    emoji: '1f48e',
    name: '日落前寻晶',
    desc: '暗道尽头各藏着一颗小晶洞：趁着天亮走遍每一颗，在里面站上 2.5 秒；白天的怪正是从那些暗道里出来的，太阳已经偏西，天一黑就输',
    note: '把昼夜当时限：右上角的时辰盘就是倒计时，越往暗道深处越黑，怪也越多',
    team: { slots: [{ tags: ['mobile'] }, { tags: ['damage', 'ranged'] }, { tags: ['defense'] }], level: 2 },
    stars: [{ kind: 'time', ms: 36_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '日落前寻晶',
      map: 'amethyst',
      clockSec: 10,
      phases: [
        {
          intro: { title: '日落前寻晶', sub: '天黑之前走遍每一颗小晶洞' },
          mix: [
            { kind: 'caveBat', weight: 3 },
            { kind: 'hollow', weight: 2 },
            { kind: 'cheshire', weight: 1 },
            { kind: 'geodeling', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 1100 }],
          ends: [
            { kind: 'visit', mark: 'tunnel', radius: 1.4, ms: 2500 },
            { kind: 'event', event: 'dusk', count: 1, lose: true },
          ],
        },
      ],
    },
  },
  nightWatch: {
    emoji: '1f319',
    name: '守夜',
    desc: '从黄昏守到天亮：入夜后火把照不到的地方哪里都可能冒出怪，顶缝里会落下来，地上半埋的晶洞里会爬出来；等到日出',
    note: '把黑暗当刷怪规则：火光那一圈就是安全区，怪从圈外的暗处现身，队伍越分散暗处越少',
    team: { slots: [{ tags: ['area'] }, { tags: ['defense'] }, { tags: ['support'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'kills', count: 70 }],
    fight: {
      name: '守夜',
      map: 'amethyst',
      clockSec: 45,
      enemyMods: { mul: { damage: 0.75 } },
      phases: [
        {
          intro: { title: '守夜', sub: '撑到日出' },
          mix: [
            { kind: 'caveBat', weight: 3 },
            { kind: 'hollow', weight: 2 },
            { kind: 'lurker', weight: 1 },
            { kind: 'cheshire', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 800 },
            { kind: 'batch', atMs: 30_000, squad: { count: 8, mix: [{ kind: 'geodeling', weight: 1 }, { kind: 'hollow', weight: 2 }], at: { kind: 'gate', gate: 'rift' } }, banner: { title: '顶缝', sub: '有东西从顶缝里落下来了' } },
            { kind: 'batch', atMs: 45_000, squad: { count: 6, enemy: 'geodeling', elites: 1, at: { kind: 'gate', gate: 'geode' } }, banner: { title: '晶洞', sub: '地上的晶洞里爬出来了' } },
          ],
          ends: [{ kind: 'event', event: 'dawn', count: 1 }],
        },
      ],
    },
  },
  pocketHunt: {
    emoji: '1f526',
    name: '晶洞深处',
    desc: '三名悬赏目标躲在暗道尽头的小晶洞里，一步也不挪，那里白天也是黑的，怪都从那里出来：钻进暗道把它们打倒，限时 90 秒',
    note: '把黑暗当巢穴：目标在怪物涌出来的方向上，暗道又窄又拐弯，进去就是逆流而上',
    team: { slots: [{ tags: ['area'] }, { tags: ['defense'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    stars: [{ kind: 'time', ms: 60_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '晶洞深处',
      map: 'amethyst',
      clockSec: 0,
      enemyMods: { mul: { damage: 0.8 } },
      phases: [
        {
          intro: { title: '晶洞深处', sub: '击倒躲在小晶洞里的悬赏目标' },
          mix: [
            { kind: 'caveBat', weight: 3 },
            { kind: 'hollow', weight: 2 },
            { kind: 'cheshire', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1000, at: { kind: 'gate', gate: 'tunnel' } },
            {
              kind: 'batch',
              atMs: 1500,
              squad: { count: 3, enemy: 'geodeling', elites: 3, stats: { mul: { maxHp: 2 } }, drive: { kind: 'stay' }, at: { kind: 'gate', gate: 'tunnel' }, bounty: true },
              banner: { title: '悬赏发布', sub: '三只晶簇怪守在小晶洞里' },
            },
          ],
          ends: [
            { kind: 'bounty' },
            { kind: 'time', ms: 90_000, lose: true },
          ],
        },
      ],
    },
  },
  darkAmbush: {
    emoji: '1f440',
    name: '暗处伏击',
    desc: '入夜的晶洞里，敌人不打预兆，一阵阵直接冒在队伍四周和身后，火把照不到的地方冒出来之前什么都看不见；清完最后一阵就赢',
    note: '刷怪位置与预兆当变量：敌人不再从远处走来，也不提前示警，考验被包围时的反应',
    team: { slots: [{ tags: ['area'] }, { tags: ['control'] }, { tags: ['defense'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'time', ms: 55_000 }],
    fight: {
      name: '暗处伏击',
      map: 'amethyst',
      clockSec: 70,
      enemyMods: { mul: { damage: 0.7 } },
      rules: { surprise: true },
      phases: [
        {
          intro: { title: '暗处伏击', sub: '当心四周和身后' },
          mix: [
            { kind: 'caveBat', weight: 3 },
            { kind: 'hollow', weight: 2 },
            { kind: 'lurker', weight: 1 },
            { kind: 'cheshire', weight: 1 },
          ],
          spawns: [
            { kind: 'batch', atMs: 3000, squad: { count: 8, at: { kind: 'ring', dist: 4 } }, banner: { title: '包围', sub: '敌人从暗处冒出来' } },
            { kind: 'batch', atMs: 11_000, squad: { count: 6, eliteChance: 0.3, at: { kind: 'behind', dist: 3 } }, banner: { title: '背后！', sub: '有东西摸到了身后' } },
            { kind: 'batch', atMs: 19_000, squad: { count: 12, elites: 1, at: { kind: 'ring', dist: 5 } }, banner: { title: '再次包围', sub: '圈子更大了' } },
            { kind: 'batch', atMs: 27_000, squad: { count: 8, elites: 2, at: { kind: 'behind', dist: 3 } }, banner: { title: '背后！', sub: '精英摸上来了' } },
            { kind: 'batch', atMs: 35_000, squad: { count: 18, eliteChance: 0.2, spreadMs: 1500, at: { kind: 'ring', dist: 6 } }, banner: { title: '最后的合围', sub: '清掉它们' } },
          ],
          ends: [{ kind: 'cleared' }],
        },
      ],
    },
  },
} as const satisfies Record<string, ExperimentDef>
