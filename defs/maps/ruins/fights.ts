import type { ExperimentDef } from '../../../src/types/runs'

/** 这张图的关卡：每个只试一种新玩法，靠这张图自己的机制成立 */
export const FIGHTS = {
  demolition: {
    emoji: '1f3d7',
    name: '拆迁',
    desc: '自爆怪专找队长，在墙边炸开就能把墙炸塌，企鹅滑过去、树懒的炸弹也能拆墙：100 秒内把残墙拆掉一半',
    note: '地形当目标：要做的不是守住院子，而是把它拆掉，落石敌我通吃，扬起的尘雾一阵看不穿',
    team: { slots: ['penguin', 'sloth', { tags: ['defense'] }], level: 2 },
    stars: [{ kind: 'time', ms: 70_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '拆迁',
      map: 'ruins',
      clockSec: 90,
      phases: [
        {
          intro: { title: '拆迁', sub: '把残墙拆掉一半' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'skeleton', weight: 2 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1300 },
            { kind: 'stream', intervalMs: 2400, enemy: 'creeper', huntLeader: true },
          ],
          ends: [
            { kind: 'gauge', gauge: 'walls', below: 0.5 },
            { kind: 'time', ms: 100_000, lose: true },
          ],
        },
      ],
    },
  },
  towerHold: {
    emoji: '1f3f0',
    name: '守塔',
    desc: '塔楼是院落一角最高的一间：队长在塔楼里累计站满 45 秒；怪物从门洞涌进来，石像鬼和骷髅兵还会翻墙',
    note: '把据点放进墙里：高墙挡子弹也挡视线，守的是门口，翻墙进来的却从背后落下',
    team: { slots: [{ tags: ['defense'] }, { tags: ['area'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    stars: [{ kind: 'switches', count: 0 }, { kind: 'time', ms: 80_000 }],
    fight: {
      name: '守塔',
      map: 'ruins',
      clockSec: 100,
      chaseLeader: true,
      phases: [
        {
          intro: { title: '守塔', sub: '队长在塔楼里站满 45 秒' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'skeleton', weight: 2 },
            { kind: 'snake', weight: 1 },
            { kind: 'ghost', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 800 },
            { kind: 'batch', atMs: 25_000, squad: { count: 3, enemy: 'knight', elites: 1, at: { kind: 'gate', gate: 'door' } }, banner: { title: '狼骑', sub: '从门洞冲进来了' } },
            { kind: 'batch', atMs: 40_000, squad: { count: 4, enemy: 'gargoyle', at: { kind: 'gate', gate: 'wall' } }, banner: { title: '石像鬼翻墙', sub: '当心背后' } },
          ],
          ends: [
            { kind: 'hold', ms: 45_000, radius: 2.5, points: [{ mark: 'tower' }] },
            { kind: 'time', ms: 110_000, lose: true },
          ],
        },
      ],
    },
  },
  aftershock: {
    emoji: '1faa8',
    name: '余震',
    desc: '每隔 6 秒来一次余震，队伍附近总有一截墙塌下来：落石敌我通吃，碎石堆走得慢，扬起的尘雾一阵看不穿；撑过 70 秒',
    note: '让地图主动出手：危险不是敌人带来的，而是定时砸下来的，站位要离开高墙',
    team: { slots: [{ tags: ['mobile'] }, { tags: ['defense'] }, { tags: ['support'] }], level: 2 },
    stars: [{ kind: 'hazard', by: 'collapse', damage: 150 }, { kind: 'kills', count: 60 }],
    fight: {
      name: '余震',
      map: 'ruins',
      clockSec: 90,
      phases: [
        {
          intro: { title: '余震', sub: '离高墙远一点' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'skeleton', weight: 2 },
            { kind: 'snake', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 700 }],
          cues: [{ cue: 'quake', atMs: 4000, every: 6000 }],
          ends: [{ kind: 'time', ms: 70_000 }],
        },
      ],
    },
  },
  rubbleRescue: {
    emoji: '26d1',
    name: '废墟救援',
    desc: '五轮敌人轮番上阵，最后一轮暴龙亲自撞进来，余震一阵接一阵：倒下的队员不会自己起来，队长到身边站 2.5 秒才扶得起，军医的急救包也能救；全队累计倒下 4 次就输',
    note: '倒下不再是等时间：扶人要顶着火力和落石，能倒下的次数有限，减员成了要管的资源',
    team: { slots: ['medic', 'guard', { tags: ['area'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    stars: [{ kind: 'downs', count: 1 }, { kind: 'time', ms: 150_000 }],
    fight: {
      name: '废墟救援',
      map: 'ruins',
      clockSec: 90,
      rules: { revive: false, rescue: { ms: 2500, radius: 1.2 } },
      phases: [
        {
          intro: { title: '废墟救援', sub: '倒下要队长去扶，累计倒下 4 次就输' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'skeleton', weight: 2 },
            { kind: 'knight', weight: 1 },
          ],
          spawns: [
            {
              kind: 'waves',
              atMs: 3000,
              gapMs: 3000,
              squads: [
                { count: 8, banner: { title: '第一轮', sub: '热身' } },
                { count: 12, elites: 1, banner: { title: '第二轮', sub: '来了个精英' } },
                { count: 14, eliteChance: 0.1, banner: { title: '第三轮', sub: '越来越多' } },
                { count: 10, elites: 3, banner: { title: '第四轮', sub: '精英小队' } },
                { count: 1, enemy: 'rhino', stats: { mul: { maxHp: 0.4 } }, banner: { title: '最后一轮', sub: '暴龙撞进来了' } },
              ],
            },
          ],
          cues: [{ cue: 'quake', atMs: 8000, every: 10_000 }],
          ends: [
            { kind: 'cleared' },
            { kind: 'downs', count: 4 },
          ],
        },
      ],
    },
  },
} as const satisfies Record<string, ExperimentDef>
