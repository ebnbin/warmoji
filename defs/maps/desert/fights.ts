import type { ExperimentDef } from '../../../src/types/runs'

/** 这张图的关卡：每个只试一种新玩法，靠这张图自己的机制成立 */
export const FIGHTS = {
  circumnavigate: {
    emoji: '1f9ed',
    name: '环游沙海',
    desc: '沙海四边首尾相接：沿一个方向走满四圈；被甩在身后的怪会从前面迎上来，爬沙丘最累，踩着脚印走省力',
    note: '环面当赛道：往哪走都是回头路，避怪只能绕，体力按坡度扣，路线比输出要紧',
    team: { slots: [{ tags: ['mobile'] }, { tags: ['damage', 'ranged'] }, { tags: ['support'] }], level: 2 },
    stars: [{ kind: 'time', ms: 90_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '环游沙海',
      map: 'desert',
      clockSec: 90,
      phases: [
        {
          intro: { title: '环游沙海', sub: '沿一个方向走满四圈' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'locust', weight: 2 },
            { kind: 'snake', weight: 1 },
            { kind: 'skeleton', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 900 }],
          ends: [
            { kind: 'event', event: 'lap', count: 4 },
            { kind: 'time', ms: 120_000, lose: true },
          ],
        },
      ],
    },
  },
  twinMarks: {
    emoji: '1faa7',
    name: '双生标志',
    desc: '沙海里每个标志物都有一个一模一样的孪生，连周围的沙地都一样，背阴处还会钻出敌人：两分钟内在每一处标志物旁站满 1.5 秒，孪生的两处各算一处',
    note: '认路当目标：分不清回到了原地还是到了另一处，只能靠箭头和自己记的路线；要站的地方正是敌人钻出来的地方',
    team: { slots: [{ tags: ['mobile'] }, { tags: ['damage'] }, { tags: ['defense'] }], level: 2 },
    stars: [{ kind: 'time', ms: 90_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '双生标志',
      map: 'desert',
      clockSec: 90,
      phases: [
        {
          intro: { title: '双生标志', sub: '在每一处标志物旁站满 1.5 秒' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'snake', weight: 2 },
            { kind: 'skeleton', weight: 1 },
            { kind: 'rat', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1100 },
            {
              kind: 'stream',
              intervalMs: 2400,
              mix: [
                { kind: 'snake', weight: 2 },
                { kind: 'skeleton', weight: 1 },
              ],
              at: { kind: 'gate', gate: 'marker' },
            },
          ],
          ends: [
            { kind: 'visit', mark: 'marker', radius: 1.6, ms: 1500 },
            { kind: 'time', ms: 120_000, lose: true },
          ],
        },
      ],
    },
  },
  sandHunt: {
    emoji: '1f43e',
    name: '沙海追猎',
    desc: '两名怪盗在沙海里逃窜，第 30 秒又追加一名狼骑：沙海首尾相接，没有墙角能把它们逼进去，只能追上去打倒；只看得见队长身边 8 格',
    note: '环面上的追逐：逃跑的目标永远有路可走，追不上就只能抄近路截它',
    team: { slots: [{ tags: ['mobile', 'damage'] }, { tags: ['ranged'] }, { tags: ['control'] }], level: 2 },
    stars: [{ kind: 'time', ms: 80_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '沙海追猎',
      map: 'desert',
      clockSec: 100,
      rules: { vision: 8 },
      phases: [
        {
          intro: { title: '沙海追猎', sub: '击倒全部悬赏目标，它们会逃' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'locust', weight: 2 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1400 },
            {
              kind: 'batch',
              atMs: 2000,
              squad: { count: 2, enemy: 'raccoon', elites: 2, drive: { kind: 'flee', range: 7 }, at: { kind: 'far' }, bounty: true },
              banner: { title: '悬赏发布', sub: '两名怪盗在沙海里逃窜' },
            },
            {
              kind: 'batch',
              atMs: 30_000,
              squad: { count: 1, enemy: 'knight', elites: 1, drive: { kind: 'flee', range: 7 }, at: { kind: 'far' }, bounty: true },
              banner: { title: '追加悬赏', sub: '一名狼骑也上了榜' },
            },
          ],
          ends: [
            { kind: 'bounty' },
            { kind: 'time', ms: 120_000, lose: true },
          ],
        },
      ],
    },
  },
  bareHands: {
    emoji: '270a',
    name: '赤手空拳',
    desc: '不能放主动技能，只剩普攻、走位和换人；第 30 到 50 秒怪一下子多起来，丘顶还会翻下一群。沙丘坡度耗体力，踩着脚印走省力，撑过 75 秒',
    note: '把技能锁住：打法只剩走位和站位，沙丘、脚印和首尾相接的沙海就是手里仅有的工具',
    team: { slots: [{ tags: ['damage'] }, { tags: ['defense'] }, { tags: ['mobile'] }], level: 2 },
    stars: [{ kind: 'switches', count: 0 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '赤手空拳',
      map: 'desert',
      clockSec: 90,
      rules: { skills: false },
      phases: [
        {
          intro: { title: '赤手空拳', sub: '不能放主动技能，撑过 75 秒' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'locust', weight: 2 },
            { kind: 'snake', weight: 1 },
            { kind: 'skeleton', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMul: 1.3 },
            { kind: 'stream', fromMs: 30_000, untilMs: 50_000, intervalMul: 1 },
            { kind: 'batch', atMs: 40_000, squad: { count: 8, eliteChance: 0.2, at: { kind: 'gate', gate: 'crest' } }, banner: { title: '丘顶', sub: '一群从沙丘顶上翻下来' } },
          ],
          ends: [{ kind: 'time', ms: 75_000 }],
        },
      ],
    },
  },
} as const satisfies Record<string, ExperimentDef>
