import type { ExperimentDef } from '../src/types/runs'

/** 实验：每个只试一种新玩法，都打在沙盒的新地图上，靠这张图自己的机制成立 */
export const EXPERIMENTS = {
  bankRaid: {
    emoji: '26f0',
    name: '坡顶来敌',
    desc: '草甸一边的陡坡上面是更高的一层草甸，敌人全都从坡顶被抛下来，落在坡脚一带；撑过 75 秒',
    note: '出怪口当变量：敌人只从一处进场，落点就是战线，守在坡脚截住刚落地的，还是退到开阔处等它们追过来',
    team: { slots: [{ tags: ['defense'] }, { tags: ['area'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'kills', count: 90 }],
    fight: {
      name: '坡顶来敌',
      map: 'meadow',
      clockSec: 120,
      phases: [
        {
          intro: { title: '坡顶来敌', sub: '敌人只从坡顶被抛下来' },
          mix: [
            { kind: 'zombie', weight: 4 },
            { kind: 'boar', weight: 2 },
            { kind: 'locust', weight: 2 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 700, ramp: { toMs: 380, overMs: 60_000 }, at: { kind: 'gate', gate: 'bank' } },
            { kind: 'batch', atMs: 40_000, squad: { count: 6, enemy: 'boar', elites: 1, at: { kind: 'gate', gate: 'bank' } }, banner: { title: '野猪群', sub: '一群野猪从坡顶冲下来' } },
          ],
          ends: [{ kind: 'time', ms: 75_000 }],
        },
      ],
    },
  },
  gateGuard: {
    emoji: '1f411',
    name: '守栅门',
    desc: '闩着的栅栏门外就是羊圈：怪物从林子里钻出来，不理队伍，直奔栅栏门去拱羊；放过去 6 只就输，撑过 90 秒',
    note: '敌人朝一处行进、不追队伍：从「别被打倒」变成「拦住它们」，站位要卡在林子和栅栏门之间',
    team: { slots: [{ tags: ['control'] }, { tags: ['area'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'kills', count: 70 }],
    fight: {
      name: '守栅门',
      map: 'meadow',
      clockSec: 60,
      phases: [
        {
          intro: { title: '守栅门', sub: '别让怪物摸到栅栏门' },
          spawns: [
            { kind: 'stream', intervalMs: 1300, ramp: { toMs: 750, overMs: 80_000 }, enemy: 'zombie', drive: { kind: 'march', mark: 'gate' }, at: { kind: 'gate', gate: 'woods' } },
            { kind: 'stream', fromMs: 20_000, intervalMs: 5000, enemy: 'boar', drive: { kind: 'march', mark: 'gate' }, at: { kind: 'gate', gate: 'woods' } },
            {
              kind: 'stream',
              intervalMs: 3200,
              mix: [
                { kind: 'snake', weight: 2 },
                { kind: 'rat', weight: 1 },
              ],
              at: { kind: 'gate', gate: 'brush' },
            },
          ],
          ends: [
            { kind: 'time', ms: 90_000 },
            { kind: 'leak', mark: 'gate', radius: 1.5, count: 6 },
          ],
        },
      ],
    },
  },
  relay: {
    emoji: '1f3c3',
    name: '接力',
    desc: '队长每 10 秒自动交给名单上的下一名队员，手动换不了；一分半内击杀 80 只',
    note: '强制轮换：每名队员都要轮到当队长，近战、远程、辅助各自怎么走位都得会，草地开阔没有别的规矩干扰',
    team: { slots: [{ tags: ['melee'] }, { tags: ['ranged'] }, { tags: ['area'] }, { tags: ['support'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'time', ms: 70_000 }],
    fight: {
      name: '接力',
      map: 'meadow',
      clockSec: 90,
      rules: { relay: 10_000, leader: { lock: true } },
      phases: [
        {
          intro: { title: '接力', sub: '每 10 秒换下一名队员当队长' },
          mix: [
            { kind: 'zombie', weight: 4 },
            { kind: 'locust', weight: 2 },
            { kind: 'boar', weight: 1 },
            { kind: 'snake', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 600 }],
          ends: [
            { kind: 'kills', count: 80 },
            { kind: 'time', ms: 90_000, lose: true },
          ],
        },
      ],
    },
  },
  bridgeHold: {
    emoji: '1f309',
    name: '守桥',
    desc: '溪上只有一座木桥：队长在桥上累计站满 40 秒；敌人从两岸扑过来，想蹚水抄近路的会被溪水冲走，幽灵却能飘过溪面',
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
            { kind: 'zombie', weight: 4 },
            { kind: 'blob', weight: 2 },
            { kind: 'slime', weight: 2 },
            { kind: 'snake', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 900 },
            { kind: 'batch', atMs: 25_000, squad: { count: 8, enemy: 'ghost', at: { kind: 'gate', gate: 'grove' } }, banner: { title: '幽灵', sub: '飘过溪面的不怕水' } },
            { kind: 'batch', atMs: 45_000, squad: { count: 6, enemy: 'crab', elites: 1, at: { kind: 'gate', gate: 'bank' } }, banner: { title: '铁甲虫上岸', sub: '从溪里爬上来了' } },
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
                { kind: 'snake', weight: 2 },
                { kind: 'crab', weight: 2 },
                { kind: 'turtle', weight: 1 },
                { kind: 'puffer', weight: 1 },
              ],
              loot: { coins: 2 },
              at: { kind: 'gate', gate: 'bank' },
            },
            {
              kind: 'stream',
              intervalMs: 1800,
              mix: [
                { kind: 'zombie', weight: 2 },
                { kind: 'slime', weight: 1 },
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
    team: { slots: ['unicorn', 'mage', 'kangaroo'], level: 2 },
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
            { kind: 'slime', weight: 3 },
            { kind: 'snake', weight: 2 },
            { kind: 'blob', weight: 2 },
            { kind: 'zombie', weight: 1 },
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
    desc: '四名悬赏目标在沙海里逃窜：沙海首尾相接，没有墙角能把它们逼进去，只能追上去打倒；只看得见队长身边 8 格',
    note: '环面上的追逐：逃跑的目标永远有路可走，追不上就只能抄近路截它',
    team: { slots: [{ tags: ['mobile', 'damage'] }, { tags: ['ranged'] }, { tags: ['control'] }], level: 2 },
    stars: [{ kind: 'time', ms: 70_000 }, { kind: 'downs', count: 0 }],
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
              squad: { count: 4, enemy: 'raccoon', elites: 4, drive: { kind: 'flee', range: 7 }, at: { kind: 'far' }, bounty: true },
              banner: { title: '悬赏发布', sub: '四名怪盗在沙海里逃窜' },
            },
          ],
          ends: [
            { kind: 'bounty' },
            { kind: 'time', ms: 100_000, lose: true },
          ],
        },
      ],
    },
  },
  followSub: {
    emoji: '1f6a2',
    name: '跟艇',
    desc: '潜艇每隔 25 秒就开走一次、换个地方落下，开走的那十来秒哪里都喘不上气，每次开走都有一群怪从陡坎下翻上来；跟着它落稳三次',
    note: '把换气点变成会搬家的营地：不能守死一处，得算着潜艇的节奏跟过去',
    team: { slots: [{ tags: ['mobile'] }, { tags: ['defense'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'hazard', by: 'drown', damage: 0 }],
    fight: {
      name: '跟艇',
      map: 'deep',
      clockSec: 90,
      phases: [
        {
          intro: { title: '跟艇', sub: '跟着潜艇，它落稳三次就赢' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'skeleton', weight: 2 },
            { kind: 'crab', weight: 1 },
            { kind: 'snake', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1100 },
            {
              kind: 'batch',
              atMs: 1500,
              on: 'depart',
              squad: {
                count: 6,
                mix: [
                  { kind: 'zombie', weight: 2 },
                  { kind: 'snake', weight: 1 },
                ],
                at: { kind: 'gate', gate: 'abyss' },
              },
              banner: { title: '离艇潮', sub: '潜艇一走，陡坎下翻上来一群' },
            },
          ],
          cues: [{ cue: 'depart', atMs: 15_000, every: 25_000 }],
          ends: [{ kind: 'event', event: 'dock', count: 3 }],
        },
      ],
    },
  },
  deepTreasure: {
    emoji: '1f9ad',
    name: '憋气寻宝',
    desc: '三名悬赏目标守在远处的冷泉、鲸骨和岩堆边，一步也不挪；离开潜艇门口就得憋气，这一回气还更短：一口气游过去打倒，再回门口换气',
    note: '把体力当航程：每一趟出击都要算好来回的气，打不完就先回去喘一口',
    team: { slots: [{ tags: ['damage', 'ranged'] }, { tags: ['mobile'] }, { tags: ['support'] }], level: 2 },
    stars: [{ kind: 'time', ms: 90_000 }, { kind: 'hazard', by: 'drown', damage: 0 }],
    fight: {
      name: '憋气寻宝',
      map: 'deep',
      clockSec: 90,
      rules: { mods: { mul: { maxStamina: 0.6 } } },
      phases: [
        {
          intro: { title: '憋气寻宝', sub: '击倒守在远处的三名悬赏目标' },
          mix: [
            { kind: 'zombie', weight: 2 },
            { kind: 'skeleton', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1600 },
            { kind: 'batch', atMs: 1500, squad: { count: 1, enemy: 'snake', elites: 1, stats: { mul: { maxHp: 1.6 } }, drive: { kind: 'stay' }, at: { kind: 'gate', gate: 'bones' }, bounty: true, escort: { enemy: 'slime', count: 3 } }, banner: { title: '悬赏发布', sub: '三名目标守在远处，一步也不挪' } },
            { kind: 'batch', atMs: 1500, squad: { count: 1, enemy: 'blob', elites: 1, stats: { mul: { maxHp: 1.2 } }, drive: { kind: 'stay' }, at: { kind: 'gate', gate: 'seep' }, bounty: true, escort: { enemy: 'puffer', count: 2 } } },
            { kind: 'batch', atMs: 1500, squad: { count: 1, enemy: 'skeleton', elites: 1, stats: { mul: { maxHp: 1.2 } }, drive: { kind: 'stay' }, at: { kind: 'gate', gate: 'rubble' }, bounty: true, escort: { enemy: 'zombie', count: 3 } } },
          ],
          ends: [
            { kind: 'bounty' },
            { kind: 'time', ms: 120_000, lose: true },
          ],
        },
      ],
    },
  },
  doorHold: {
    emoji: '1f6aa',
    name: '守门',
    desc: '潜艇门口那片是唯一喘得上气的地方，怪物全挤过来抢：队长在门口累计站满 40 秒；潜艇开走时，门口跟着换到新落点',
    note: '据点就是换气点：守住它才喘得上气，潜艇一走据点也跟着搬家',
    team: { slots: [{ tags: ['defense'] }, { tags: ['area'] }, { tags: ['support'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'time', ms: 75_000 }],
    fight: {
      name: '守门',
      map: 'deep',
      clockSec: 100,
      chaseLeader: true,
      phases: [
        {
          intro: { title: '守门', sub: '队长在潜艇门口站满 40 秒' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'skeleton', weight: 2 },
            { kind: 'crab', weight: 2 },
            { kind: 'slime', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 700 }],
          cues: [{ cue: 'depart', atMs: 25_000 }],
          ends: [
            { kind: 'hold', ms: 40_000, radius: 2.4, points: [{ mark: 'door' }] },
            { kind: 'time', ms: 110_000, lose: true },
          ],
        },
      ],
    },
  },
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
    stars: [{ kind: 'downs', count: 0 }, { kind: 'time', ms: 80_000 }],
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
      clockSec: 15,
      phases: [
        {
          intro: { title: '日落前寻晶', sub: '天黑之前走遍每一颗小晶洞' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'skeleton', weight: 2 },
            { kind: 'rat', weight: 1 },
            { kind: 'crab', weight: 1 },
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
      phases: [
        {
          intro: { title: '守夜', sub: '撑到日出' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'skeleton', weight: 2 },
            { kind: 'chameleon', weight: 1 },
            { kind: 'rat', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 800 },
            { kind: 'batch', atMs: 30_000, squad: { count: 8, mix: [{ kind: 'gargoyle', weight: 1 }, { kind: 'skeleton', weight: 2 }], at: { kind: 'gate', gate: 'rift' } }, banner: { title: '顶缝', sub: '有东西从顶缝里落下来了' } },
            { kind: 'batch', atMs: 45_000, squad: { count: 6, enemy: 'crab', elites: 1, at: { kind: 'gate', gate: 'geode' } }, banner: { title: '晶洞', sub: '地上的晶洞里爬出来了' } },
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
      phases: [
        {
          intro: { title: '晶洞深处', sub: '击倒躲在小晶洞里的悬赏目标' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'skeleton', weight: 2 },
            { kind: 'rat', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1000, at: { kind: 'gate', gate: 'tunnel' } },
            {
              kind: 'batch',
              atMs: 1500,
              squad: { count: 3, enemy: 'gargoyle', elites: 3, stats: { mul: { maxHp: 2 } }, drive: { kind: 'stay' }, at: { kind: 'gate', gate: 'tunnel' }, bounty: true },
              banner: { title: '悬赏发布', sub: '三只石像鬼守在小晶洞里' },
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
  iceShove: {
    emoji: '1f9ca',
    name: '推下海',
    desc: '我方伤不了敌人，击退却格外有劲：把敌人推下冰缘，冰点上下的海水会把它们冻死；当心狼骑也会把队员撞下海。让 20 只敌人被寒水冻死',
    note: '只能借地形杀敌：输出换成了击退，冰面打滑让一下推得更远，也让自己更容易掉下去',
    team: { slots: ['unicorn', 'mage', 'kangaroo'], level: 2 },
    stars: [{ kind: 'time', ms: 90_000 }, { kind: 'hazard', by: 'coldWater', damage: 0 }],
    fight: {
      name: '推下海',
      map: 'floe',
      clockSec: 60,
      rules: { harmless: true, mods: { mul: { knockback: 2.5 } } },
      phases: [
        {
          intro: { title: '推下海', sub: '让 20 只敌人被寒水冻死' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'crab', weight: 1 },
            { kind: 'snake', weight: 1 },
            { kind: 'blob', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1200, cap: 30 },
            { kind: 'batch', atMs: 30_000, squad: { count: 3, enemy: 'knight', at: { kind: 'gate', gate: 'drift' } }, banner: { title: '狼骑', sub: '它们会把人撞下海' } },
          ],
          ends: [
            { kind: 'kills', count: 20, by: 'coldWater' },
            { kind: 'time', ms: 120_000, lose: true },
          ],
        },
      ],
    },
  },
  gale: {
    emoji: '1f32c',
    name: '风暴',
    desc: '每隔 10 秒刮一阵大风：站在新冰上会被吹着往下风滑，光冰上个子小的也站不稳，躲到雪地上才站得稳；撑过 75 秒',
    note: '让天气定节奏：阵风是可预见的危险，雪堆是避风港，敌人一样会被吹下海',
    team: { slots: [{ tags: ['defense'] }, { tags: ['ranged'] }, { tags: ['support'] }], level: 2 },
    stars: [{ kind: 'hazard', by: 'coldWater', damage: 0 }, { kind: 'kills', count: 50 }],
    fight: {
      name: '风暴',
      map: 'floe',
      clockSec: 90,
      phases: [
        {
          intro: { title: '风暴', sub: '阵风一来就躲到雪地上' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'blob', weight: 2 },
            { kind: 'crab', weight: 1 },
            { kind: 'snake', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 800 }],
          cues: [{ cue: 'gust', atMs: 3000, every: 10_000 }],
          ends: [{ kind: 'time', ms: 75_000 }],
        },
      ],
    },
  },
  floeCoins: {
    emoji: '1fa99',
    name: '冰心打捞',
    desc: '从海里爬上来的敌人带着双倍金币，可死在水里的，金币直接沉进海底：90 秒内捡到 50 金币，就得在冰面中间打',
    note: '水是吞钱的：和击退流反着来，打得越猛越容易把钱打进海里',
    team: { slots: [{ tags: ['area'] }, { tags: ['control'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    stars: [{ kind: 'time', ms: 70_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '冰心打捞',
      map: 'floe',
      clockSec: 80,
      phases: [
        {
          intro: { title: '冰心打捞', sub: '死在水里的金币会沉' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'crab', weight: 1 },
            { kind: 'snake', weight: 1 },
            { kind: 'blob', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 900, loot: { coins: 2 }, at: { kind: 'gate', gate: 'edge' } }],
          ends: [
            { kind: 'coins', count: 50 },
            { kind: 'time', ms: 90_000, lose: true },
          ],
        },
      ],
    },
  },
  lavaLure: {
    emoji: '1f525',
    name: '引火烧身',
    desc: '我方伤不了敌人，击退却格外有劲：火山隔一阵就喷发，熔岩顺着地势漫下来，敌人追人时会直直穿过熔岩；让 15 只敌人被熔岩烧死',
    note: '只能借地形杀敌：熔岩敌我都烫，要算着喷发的节奏，把敌人引进去、自己站在岩石上',
    team: { slots: ['bear', 'mage', 'kangaroo'], level: 2 },
    stars: [{ kind: 'hazard', by: 'lava', damage: 0 }, { kind: 'time', ms: 110_000 }],
    fight: {
      name: '引火烧身',
      map: 'volcano',
      clockSec: 60,
      rules: { harmless: true, mods: { mul: { knockback: 2 } } },
      phases: [
        {
          intro: { title: '引火烧身', sub: '让 15 只敌人被熔岩烧死' },
          mix: [
            { kind: 'zombie', weight: 4 },
            { kind: 'boar', weight: 1 },
            { kind: 'skeleton', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 900, cap: 40 }],
          cues: [{ cue: 'erupt', atMs: 8000, every: 45_000 }],
          ends: [
            { kind: 'kills', count: 15, by: 'lava' },
            { kind: 'time', ms: 150_000, lose: true },
          ],
        },
      ],
    },
  },
  eruptionCycle: {
    emoji: '1f30b',
    name: '喷发周期',
    desc: '火山每 45 秒喷发一次，每次喷发都从火山口抛出火山怪与流星，熔岩随后漫过盆地；撑到第三次喷发',
    note: '让地图事件刷怪：每次喷发既是一波敌人也是一片熔岩，平静的那段是喘息也是准备',
    team: { slots: [{ tags: ['defense'] }, { tags: ['area'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'hazard', by: 'lava', damage: 100 }],
    fight: {
      name: '喷发周期',
      map: 'volcano',
      clockSec: 100,
      phases: [
        {
          intro: { title: '喷发周期', sub: '撑到第三次喷发' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'skeleton', weight: 1 },
            { kind: 'creeper', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1100 },
            {
              kind: 'batch',
              atMs: 1500,
              on: 'erupt',
              squad: {
                count: 7,
                mix: [
                  { kind: 'turtle', weight: 1 },
                  { kind: 'comet', weight: 2 },
                ],
                at: { kind: 'gate', gate: 'crater' },
              },
              banner: { title: '火山口', sub: '喷发抛出了一群' },
            },
          ],
          cues: [{ cue: 'erupt', atMs: 5000, every: 45_000 }],
          ends: [{ kind: 'event', event: 'erupt', count: 3 }],
        },
      ],
    },
  },
  ventWalk: {
    emoji: '2668',
    name: '喷气孔巡查',
    desc: '在每一个喷气孔上站满 5 秒，火山怪会从喷气孔里钻出来；第 20 秒火山喷发，熔岩顺着地势漫下来，可能正好淹过还没去的那几个',
    note: '到访当目标、地图改写路线：熔岩会封住一些去处，又在凉透后重新放行，先去哪个得看熔岩往哪流',
    team: { slots: [{ tags: ['mobile'] }, { tags: ['defense'] }, { tags: ['area'] }], level: 2 },
    stars: [{ kind: 'time', ms: 60_000 }, { kind: 'hazard', by: 'lava', damage: 0 }],
    fight: {
      name: '喷气孔巡查',
      map: 'volcano',
      clockSec: 90,
      phases: [
        {
          intro: { title: '喷气孔巡查', sub: '站上每一个喷气孔' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'skeleton', weight: 1 },
            { kind: 'boar', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1000 },
            {
              kind: 'stream',
              intervalMs: 4000,
              mix: [
                { kind: 'turtle', weight: 1 },
                { kind: 'creeper', weight: 1 },
              ],
              at: { kind: 'gate', gate: 'vent' },
            },
          ],
          cues: [{ cue: 'erupt', atMs: 10_000 }],
          ends: [
            { kind: 'visit', mark: 'vent', radius: 1.2, ms: 5000 },
            { kind: 'time', ms: 100_000, lose: true },
          ],
        },
      ],
    },
  },
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
  stationTour: {
    emoji: '1f504',
    name: '环站巡礼',
    desc: '跃迁站四间房连成单向的一圈：限时 120 秒，整队跃迁 8 次、绕站两圈；离开的房间里的追兵，会一批批从你到站的那座传送台涌出来',
    note: '传送当目标：到站的台子要冷却，得走到下一座台子去，追兵却总是跟着你的路线来',
    team: { slots: [{ tags: ['mobile'] }, { tags: ['damage', 'ranged'] }, { tags: ['defense'] }], level: 2 },
    stars: [{ kind: 'time', ms: 90_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '环站巡礼',
      map: 'warp',
      clockSec: 90,
      phases: [
        {
          intro: { title: '环站巡礼', sub: '整队跃迁 8 次' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'ghost', weight: 2 },
            { kind: 'alien', weight: 2 },
            { kind: 'crab', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 700 }],
          ends: [
            { kind: 'event', event: 'jump', count: 8 },
            { kind: 'time', ms: 120_000, lose: true },
          ],
        },
      ],
    },
  },
  lockdown: {
    emoji: '1f512',
    name: '封站',
    desc: '传送台全被锁住，哪也去不了：另外三间房的怪越聚越多，每隔几秒就坐班车从你脚下的传送台涌进来；撑过 75 秒',
    note: '把出口变成入口：怪不从四周来，而是定时从一处整批涌出，守住台口就是守住房间',
    team: { slots: [{ tags: ['area'] }, { tags: ['defense'] }, { tags: ['support'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'kills', count: 80 }],
    fight: {
      name: '封站',
      map: 'warp',
      clockSec: 90,
      phases: [
        {
          intro: { title: '封站', sub: '传送台都锁住了' },
          mix: [
            { kind: 'ghost', weight: 2 },
            { kind: 'crab', weight: 2 },
            { kind: 'alien', weight: 2 },
            { kind: 'zombie', weight: 2 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 450 }],
          cues: [{ cue: 'lock', atMs: 0 }],
          ends: [{ kind: 'time', ms: 75_000 }],
        },
      ],
    },
  },
  stationPurge: {
    emoji: '1f9f9',
    name: '全站清剿',
    desc: '四间房各藏着一队敌人：清空整座跃迁站；你不在的房间里，敌人会往传送台聚，坐班车追过来',
    note: '清场跨房间：敌人分在四处又会自己流动，什么时候去下一间、什么时候守着台口等它们送上门',
    team: { slots: [{ tags: ['mobile'] }, { tags: ['area'] }, { tags: ['damage'] }], level: 2 },
    stars: [{ kind: 'time', ms: 100_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '全站清剿',
      map: 'warp',
      clockSec: 100,
      phases: [
        {
          intro: { title: '全站清剿', sub: '清空四间房' },
          spawns: [
            {
              kind: 'batch',
              atMs: 1000,
              squad: {
                count: 8,
                mix: [
                  { kind: 'ghost', weight: 2 },
                  { kind: 'chameleon', weight: 1 },
                  { kind: 'siren', weight: 1 },
                ],
                at: { kind: 'gate', gate: 'ghosts' },
              },
              banner: { title: '全站清剿', sub: '四间房各有一队' },
            },
            {
              kind: 'batch',
              atMs: 1000,
              squad: {
                count: 7,
                mix: [
                  { kind: 'crab', weight: 2 },
                  { kind: 'gargoyle', weight: 1 },
                  { kind: 'turtle', weight: 1 },
                ],
                at: { kind: 'gate', gate: 'tanks' },
              },
            },
            {
              kind: 'batch',
              atMs: 1000,
              squad: {
                count: 12,
                mix: [
                  { kind: 'alien', weight: 2 },
                  { kind: 'locust', weight: 2 },
                  { kind: 'blob', weight: 1 },
                ],
                at: { kind: 'gate', gate: 'swarm' },
              },
            },
            {
              kind: 'batch',
              atMs: 1000,
              squad: {
                count: 8,
                mix: [
                  { kind: 'zombie', weight: 2 },
                  { kind: 'invader', weight: 1 },
                  { kind: 'ufo', weight: 1 },
                ],
                at: { kind: 'gate', gate: 'mixed' },
              },
            },
          ],
          ends: [
            { kind: 'cleared' },
            { kind: 'time', ms: 150_000, lose: true },
          ],
        },
      ],
    },
  },
  sterile: {
    emoji: '1f9eb',
    name: '无菌操作',
    desc: '菌落一刻不停地往外长，子弹伤不了它，只有怪死在哪里，哪里的菌落才溶开一圈；菌落盖满八成就输，撑过 90 秒',
    note: '把击杀当清洁工：杀得快不够，还得把怪引到菌最厚的地方再杀',
    team: { slots: [{ tags: ['area'] }, { tags: ['damage', 'ranged'] }, { tags: ['control'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'kills', count: 90 }],
    fight: {
      name: '无菌操作',
      map: 'petri',
      clockSec: 60,
      phases: [
        {
          intro: { title: '无菌操作', sub: '别让菌落盖满八成' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'blob', weight: 2 },
            { kind: 'slime', weight: 1 },
            { kind: 'mushroom', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 600 }],
          ends: [
            { kind: 'time', ms: 90_000 },
            { kind: 'gauge', gauge: 'colony', above: 0.8, lose: true },
          ],
        },
      ],
    },
  },
  lysisRoad: {
    emoji: '1f9ec',
    name: '溶菌开路',
    desc: '菌是按 1 到 4 区的次序划上去的，1 区最厚、4 区最稀，菌落一刻不停地往外长：队长按区号依次在每一区的中心各站满 8 秒；我方踩进菌落几乎走不动，敌人却照常追过来，只有在它们死的地方菌落才溶开',
    note: '用击杀铺路：要去的地方被菌落封死，路是一只只怪死出来的；越往后菌越厚，先去哪儿由不得你',
    team: { slots: [{ tags: ['area'] }, { tags: ['ranged'] }, { tags: ['mobile'] }], level: 2 },
    stars: [{ kind: 'time', ms: 80_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '溶菌开路',
      map: 'petri',
      clockSec: 70,
      chaseLeader: true,
      phases: [
        {
          intro: { title: '溶菌开路', sub: '依次在每一区的中心各站满 8 秒' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'blob', weight: 2 },
            { kind: 'slime', weight: 2 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 800 }],
          ends: [
            {
              kind: 'hold',
              ms: 32_000,
              radius: 2,
              points: [
                { mark: 'sector', nth: 0 },
                { mark: 'sector', nth: 1 },
                { mark: 'sector', nth: 2 },
                { mark: 'sector', nth: 3 },
              ],
            },
            { kind: 'time', ms: 120_000, lose: true },
          ],
        },
      ],
    },
  },
  buriedGold: {
    emoji: '1f400',
    name: '菌下藏金',
    desc: '菌落长过的金币被盖住，捡不到也吸不走，把那块清干净才露出来；偷币鼠却能把埋着的币挖走，打死它才吐出来：90 秒内捡到 80 金币',
    note: '掉落物会被地图藏起来：捡钱的时机由溶菌决定，偷币鼠既是对手也是挖掘机',
    team: { slots: [{ tags: ['damage', 'area'] }, { tags: ['mobile'] }, { tags: ['ranged'] }], level: 2 },
    stars: [{ kind: 'time', ms: 70_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '菌下藏金',
      map: 'petri',
      clockSec: 80,
      phases: [
        {
          intro: { title: '菌下藏金', sub: '捡到 80 金币' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'blob', weight: 2 },
            { kind: 'rat', weight: 2 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 800, loot: { coins: 2 } }],
          ends: [
            { kind: 'coins', count: 80 },
            { kind: 'time', ms: 90_000, lose: true },
          ],
        },
      ],
    },
  },
  feedHole: {
    emoji: '1f573',
    name: '喂黑洞',
    desc: '我方伤不了敌人，击退却格外有劲：黑洞的引力会把靠近的东西拖进视界吞掉，敌人往往比你先被吸走；让 35 只敌人被黑洞吞掉，它每吞一只就更重一分',
    note: '只能借地形杀敌：站到黑洞边上当诱饵，自己又不能越过那圈走不出来的光环',
    team: { slots: ['frog', 'bear', 'mage'], level: 2 },
    stars: [{ kind: 'time', ms: 75_000 }, { kind: 'hazard', by: 'blackhole', damage: 0 }],
    fight: {
      name: '喂黑洞',
      map: 'nebula',
      clockSec: 60,
      rules: { harmless: true, mods: { mul: { knockback: 2 } } },
      phases: [
        {
          intro: { title: '喂黑洞', sub: '让 35 只敌人被黑洞吞掉' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'alien', weight: 2 },
            { kind: 'chameleon', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 900, cap: 40 }],
          ends: [
            { kind: 'kills', count: 35, by: 'blackhole' },
            { kind: 'time', ms: 120_000, lose: true },
          ],
        },
      ],
    },
  },
  accretion: {
    emoji: '1f30c',
    name: '别让它长大',
    desc: '黑洞每吞下一样东西就长大一点，长得越大引力越强：被吸进去的敌人、金币、流星都是它的食物；黑洞长到八成就输，撑过 90 秒',
    note: '把地图的状态当失败条件：要赶在敌人漂进视界之前打倒它们，战线得拉到远离黑洞的地方',
    team: { slots: [{ tags: ['damage', 'ranged'] }, { tags: ['area'] }, { tags: ['control'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'kills', count: 60 }],
    fight: {
      name: '别让它长大',
      map: 'nebula',
      clockSec: 90,
      phases: [
        {
          intro: { title: '别让它长大', sub: '黑洞长到八成就输' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'alien', weight: 2 },
            { kind: 'ufo', weight: 1 },
            { kind: 'siren', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 700 }],
          ends: [
            { kind: 'time', ms: 90_000 },
            { kind: 'gauge', gauge: 'mass', above: 0.8, lose: true },
          ],
        },
      ],
    },
  },
  meteorShower: {
    emoji: '2604',
    name: '流星雨',
    desc: '我方伤不了敌人，来的都是蝗虫、外星人这些一砸就死的小东西：壳层每 4 秒甩出一颗流星横穿空腔，照着队长身边砸过来，被黑洞加速后撞得更狠；把敌人引到流星的路上，让流星砸死 8 只',
    note: '借会动的危害杀敌：流星有预警、走直线又被引力弯过，诱敌的站位要跟着每一颗流星变',
    team: { slots: [{ tags: ['mobile'] }, { tags: ['control'] }, { tags: ['defense'] }], level: 2 },
    stars: [{ kind: 'hazard', by: 'meteor', damage: 60 }, { kind: 'time', ms: 90_000 }],
    fight: {
      name: '流星雨',
      map: 'nebula',
      clockSec: 0,
      rules: { harmless: true },
      phases: [
        {
          intro: { title: '流星雨', sub: '让流星砸死 8 只' },
          mix: [
            { kind: 'locust', weight: 3 },
            { kind: 'alien', weight: 2 },
            { kind: 'rat', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 700, cap: 40 }],
          cues: [{ cue: 'meteor', atMs: 2000, every: 4000 }],
          ends: [
            { kind: 'kills', count: 8, by: 'meteor' },
            { kind: 'time', ms: 120_000, lose: true },
          ],
        },
      ],
    },
  },
} as const satisfies Record<string, ExperimentDef>
