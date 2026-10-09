import type { ExperimentDef } from '../../../src/types/runs'

/** 这张图的关卡：每个只试一种新玩法，靠这张图自己的机制成立 */
export const FIGHTS = {
  bridgeHold: {
    emoji: '1f309',
    name: '守桥',
    desc: '溪上只有一座木桥：队长在桥上累计站满 40 秒；敌人从两岸扑过来，想蹚水抄近路的会被溪水冲走，游魂却能飘过溪面',
    note: '地形当关口：溪水替你挡住大半的路，敌人只能挤上桥，桥面就是最窄的战线',
    team: { slots: [{ tags: ['defense'] }, { tags: ['area'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'time', ms: 80_000 }],
    fight: {
      name: '守桥',
      map: 'sakura',
      clockSec: 100,
      chaseLeader: true,
      phases: [
        {
          intro: { title: '守桥', sub: '队长在桥上站满 40 秒' },
          mix: [
            { kind: 'templeGoose', weight: 4 },
            { kind: 'umbrella', weight: 2 },
            { kind: 'cursedDoll', weight: 2 },
            { kind: 'templeMonkey', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 900 },
            { kind: 'batch', atMs: 25_000, squad: { count: 8, enemy: 'wisp', at: { kind: 'gate', gate: 'grove' } }, banner: { title: '游魂', sub: '飘过溪面的不怕水' } },
            { kind: 'batch', atMs: 45_000, squad: { count: 6, enemy: 'crayfish', elites: 1, at: { kind: 'gate', gate: 'bank' } }, banner: { title: '溪虾上岸', sub: '从溪里爬上来了' } },
          ],
          ends: [
            { kind: 'hold', ms: 40_000, radius: 2, points: [{ mark: 'bridge' }] },
            { kind: 'time', ms: 120_000, lose: true },
          ],
        },
      ],
    },
  },
  weirGold: {
    emoji: '1f38b',
    name: '竹栅拾金',
    desc: '从溪里爬上岸的敌人带着双倍金币：在溪里、溪边打死的，金币顺水漂到下游的竹栅前堆着；90 秒内捡到 60 金币',
    note: '水流搬运掉落物：钱不掉在打死的地方，而是往一个危险的角落里攒，捞钱要顶着林缘',
    team: { slots: [{ tags: ['damage', 'ranged'] }, { tags: ['mobile'] }, { tags: ['area'] }], level: 2 },
    stars: [{ kind: 'time', ms: 70_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '竹栅拾金',
      map: 'sakura',
      clockSec: 80,
      phases: [
        {
          intro: { title: '竹栅拾金', sub: '金币会顺水漂到竹栅前' },
          spawns: [
            {
              kind: 'stream',
              intervalMs: 1000,
              mix: [
                { kind: 'templeMonkey', weight: 2 },
                { kind: 'crayfish', weight: 2 },
                { kind: 'lantern', weight: 2 },
              ],
              loot: { coins: 2 },
              at: { kind: 'gate', gate: 'bank' },
            },
            {
              kind: 'stream',
              intervalMs: 1800,
              mix: [
                { kind: 'templeGoose', weight: 2 },
                { kind: 'cursedDoll', weight: 1 },
              ],
              at: { kind: 'gate', gate: 'grove' },
            },
          ],
          ends: [
            { kind: 'coins', count: 60 },
            { kind: 'time', ms: 90_000, lose: true },
          ],
        },
      ],
    },
  },
  sweptAway: {
    emoji: '1f30a',
    name: '冲走他们',
    desc: '溪深而急，站不住的会顺水漂走：把敌人打进溪里冲走，个子小的一下水就浮起来；让 25 只敌人被溪水冲走',
    note: '把水流当武器：目标不是打死，而是用击退和站位把敌人送进深水，打不打死都不算数',
    team: { slots: ['otter', 'rocker', 'owl'], level: 2 },
    stars: [{ kind: 'time', ms: 70_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '冲走他们',
      map: 'sakura',
      clockSec: 60,
      rules: { mods: { mul: { knockback: 1.6 } } },
      phases: [
        {
          intro: { title: '冲走他们', sub: '把敌人打进溪里' },
          mix: [
            { kind: 'cursedDoll', weight: 3 },
            { kind: 'templeMonkey', weight: 2 },
            { kind: 'umbrella', weight: 2 },
            { kind: 'templeGoose', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 800 }],
          ends: [
            { kind: 'event', event: 'swept', count: 25 },
            { kind: 'time', ms: 100_000, lose: true },
          ],
        },
      ],
    },
  },
  pincer: {
    emoji: '1f38f',
    name: '两岸夹击',
    desc: '五批敌人轮流从樱林、寺墙、溪岸和林缘压过来，最后一批四面合围，清完一批才来下一批；溪水挡住大半的路，桥是两岸之间的咽喉。清空全部就赢，不限时',
    note: '清场当胜利条件、成组的敌人定好来向：节奏跟着清怪的速度走，每批之间有喘息，迎下一批之前先想好站在哪一岸',
    team: { slots: [{ tags: ['defense'] }, { tags: ['damage', 'area'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'time', ms: 120_000 }],
    fight: {
      name: '两岸夹击',
      map: 'sakura',
      clockSec: 90,
      phases: [
        {
          intro: { title: '两岸夹击', sub: '清空五批敌人' },
          mix: [
            { kind: 'templeGoose', weight: 3 },
            { kind: 'umbrella', weight: 1 },
            { kind: 'cursedDoll', weight: 1 },
            { kind: 'templeMonkey', weight: 1 },
          ],
          spawns: [
            {
              kind: 'waves',
              atMs: 3000,
              gapMs: 2500,
              squads: [
                { count: 10, at: { kind: 'gate', gate: 'grove' }, banner: { title: '第一批', sub: '樱林里钻出来了' } },
                {
                  count: 12,
                  mix: [
                    { kind: 'wisp', weight: 2 },
                    { kind: 'templeGoose', weight: 1 },
                  ],
                  at: { kind: 'gate', gate: 'wall' },
                  banner: { title: '第二批', sub: '翻过寺墙来了' },
                },
                {
                  count: 14,
                  elites: 2,
                  mix: [
                    { kind: 'templeMonkey', weight: 2 },
                    { kind: 'lantern', weight: 1 },
                    { kind: 'crayfish', weight: 1 },
                  ],
                  at: { kind: 'gate', gate: 'bank' },
                  banner: { title: '第三批', sub: '从溪里爬上岸，带着精英' },
                },
                { count: 18, eliteChance: 0.15, at: { kind: 'gate', gate: 'thicket' }, banner: { title: '第四批', sub: '林缘一圈都是' } },
                { count: 24, elites: 3, spreadMs: 3000, at: { kind: 'ring', dist: 7 }, banner: { title: '最后一批', sub: '四面合围' } },
              ],
            },
          ],
          ends: [{ kind: 'cleared' }],
        },
      ],
    },
  },
} as const satisfies Record<string, ExperimentDef>
