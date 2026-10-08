import type { ExperimentDef } from '../../../src/types/runs'

/** 这张图的关卡：每个只试一种新玩法，靠这张图自己的机制成立 */
export const FIGHTS = {
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
  eventHorizon: {
    emoji: '1f9ff',
    name: '视界边缘',
    desc: '你操控的法师就是队长，不能换人，他倒下就输，被黑洞吞掉也算；所有敌人只追他，还会一阵阵围上来。撑过 60 秒',
    note: '队长倒下就输：玩家本人成了要护住的目标；黑洞把能退的路收窄，绕着视界放风筝又会被吸过去',
    team: { slots: ['mage', { tags: ['defense'] }, { tags: ['support'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'kills', count: 60 }],
    fight: {
      name: '视界边缘',
      map: 'nebula',
      clockSec: 60,
      chaseLeader: true,
      rules: { leader: { lock: true, critical: true } },
      phases: [
        {
          intro: { title: '视界边缘', sub: '你倒下就输，撑过 60 秒' },
          mix: [
            { kind: 'zombie', weight: 3 },
            { kind: 'alien', weight: 2 },
            { kind: 'chameleon', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMul: 1.2 },
            { kind: 'batch', atMs: 20_000, squad: { count: 8, elites: 1, at: { kind: 'ring', dist: 5 } }, banner: { title: '合围', sub: '敌人围住了你' } },
            { kind: 'batch', atMs: 40_000, squad: { count: 6, eliteChance: 0.15, at: { kind: 'behind', dist: 3 } }, banner: { title: '背后！', sub: '有东西摸到了身后' } },
          ],
          ends: [{ kind: 'time', ms: 60_000 }],
        },
      ],
    },
  },
} as const satisfies Record<string, ExperimentDef>
