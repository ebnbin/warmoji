import type { ExperimentDef } from '../../../src/types/runs'

/** 这张图的关卡：每个只试一种新玩法，靠这张图自己的机制成立 */
export const FIGHTS = {
  curtainCoins: {
    emoji: '1f3ad',
    name: '谢幕前收钱',
    desc: '每次换幕，地布连同上面没捡的金币一起推进侧幕；偷币鼠也在抢：第三次换幕之前捡满 60 金币',
    note: '把清场当倒计时：右上角的换幕盘就是这一幕还剩多久，盘子一闪就得去捡钱',
    team: { slots: [{ tags: ['damage', 'area'] }, { tags: ['mobile'] }, { tags: ['ranged'] }], level: 2 },
    stars: [{ kind: 'time', ms: 50_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '谢幕前收钱',
      map: 'theater',
      clockSec: 0,
      phases: [
        {
          intro: { title: '谢幕前收钱', sub: '第三次换幕之前捡满 60 金币' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'rat', weight: 2 },
            { kind: 'mushroom', weight: 1 },
            { kind: 'skeleton', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 700, loot: { coins: 2 } }],
          ends: [
            { kind: 'coins', count: 60 },
            { kind: 'event', event: 'act', count: 3, lose: true },
          ],
        },
      ],
    },
  },
  fourActs: {
    emoji: '1f3ac',
    name: '四幕剧',
    desc: '一幕一批演员：第一幕僵尸与偷币鼠，第二幕骷髅与狼骑，第三幕毒蘑菇、石像鬼与萨满，每次换幕都把台上清空；终幕夜伯爵登场，换幕也清不走它',
    note: '让换幕切分阶段：每一幕是一个干净的小关，阶段按地图的节奏接上，不按时间',
    team: { slots: [{ tags: ['defense'] }, { tags: ['area'] }, { tags: ['damage', 'ranged'] }, { tags: ['support'] }], level: 3 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'time', ms: 140_000 }],
    fight: {
      name: '四幕剧',
      map: 'theater',
      clockSec: 0,
      phases: [
        {
          intro: { title: '第一幕', sub: '僵尸与偷币鼠' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'rat', weight: 2 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 650 }],
          ends: [{ kind: 'event', event: 'act', count: 1 }],
        },
        {
          intro: { title: '第二幕', sub: '骷髅与狼骑' },
          mix: [
            { kind: 'skeleton', weight: 3 },
            { kind: 'knight', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 800 },
            { kind: 'batch', atMs: 9000, squad: { count: 3, enemy: 'knight', elites: 1, at: { kind: 'gate', gate: 'wings' } }, banner: { title: '狼骑登台', sub: '从布景后面冲出来了' } },
          ],
          ends: [{ kind: 'event', event: 'act', count: 1 }],
        },
        {
          intro: { title: '第三幕', sub: '毒蘑菇、石像鬼与萨满' },
          mix: [
            { kind: 'mushroom', weight: 3 },
            { kind: 'gargoyle', weight: 1 },
            { kind: 'elf', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 800 }],
          ends: [{ kind: 'event', event: 'act', count: 1 }],
        },
        {
          intro: { title: '终幕', sub: '夜伯爵登场' },
          mix: [
            { kind: 'zombie', weight: 2 },
            { kind: 'skeleton', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1600 },
            { kind: 'batch', atMs: 6000, squad: { count: 1, enemy: 'eclipse', stats: { mul: { maxHp: 0.45 } } }, banner: { title: '夜伯爵', sub: '换幕也清不走它' } },
          ],
          ends: [{ kind: 'boss' }],
        },
      ],
    },
  },
  oneManShow: {
    emoji: '1f987',
    name: '独角戏',
    desc: '夜伯爵是主角，一直留在台上：小怪不断从活门和布景后面上台，每次换幕都把它们推下台，队伍也被吊起来喘一口气；打倒夜伯爵',
    note: '让地图给节奏：换幕是定时的清场加无敌，头目战按换幕切成一段一段',
    team: { slots: [{ tags: ['damage'] }, { tags: ['damage', 'ranged'] }, { tags: ['support'] }, { tags: ['defense'] }], level: 3 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'time', ms: 90_000 }],
    fight: {
      name: '独角戏',
      map: 'theater',
      clockSec: 120,
      phases: [
        {
          mix: [
            { kind: 'zombie', weight: 2 },
            { kind: 'skeleton', weight: 1 },
            { kind: 'elf', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1200 },
            { kind: 'batch', atMs: 1500, squad: { count: 1, enemy: 'eclipse', stats: { mul: { maxHp: 0.5 } } }, banner: { title: '独角戏', sub: '夜伯爵登场，换幕也赶不走它' } },
          ],
          ends: [{ kind: 'boss' }],
        },
      ],
    },
  },
} as const satisfies Record<string, ExperimentDef>
