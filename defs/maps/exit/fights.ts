import type { ExperimentDef } from '../../../src/types/runs'

/** 这张图的关卡：每个只试一种新玩法，靠这张图自己的机制成立 */
export const FIGHTS = {
  stationTour: {
    emoji: '1f504',
    name: '走遍迷宫',
    desc: '出口是一座单向的迷宫：每扇门只通往前面的一间，从哪扇门来，那一间就没有门通回去。到访每一间舱室，在入口站满 2.5 秒；顺着挂绿牌的「出口」一定走得完，抄近路可能漏掉几间、得再绕一圈。只有走过的三间亮着，追兵会顺着门跟过来',
    note: '到访当目标、地图本身是谜题：路只能往前，挑哪扇门决定要绕多远；黑着的舱室里看不见门，只能记住走过的路',
    team: { slots: [{ tags: ['mobile'] }, { tags: ['damage', 'ranged'] }, { tags: ['defense'] }], level: 2 },
    stars: [{ kind: 'time', ms: 70_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '走遍迷宫',
      map: 'exit',
      clockSec: 90,
      enemyMods: { mul: { maxHp: 0.45, damage: 0.7 } },
      phases: [
        {
          intro: { title: '走遍迷宫', sub: '在每一间舱室的入口站满 2.5 秒' },
          mix: [
            { kind: 'smiley', weight: 3 },
            { kind: 'mouthless', weight: 2 },
            { kind: 'commuter', weight: 2 },
            { kind: 'upsideDown', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 800 }],
          ends: [
            { kind: 'visit', mark: 'cabin', radius: 1.6, ms: 2500 },
            { kind: 'time', ms: 120_000, lose: true },
          ],
        },
      ],
    },
  },
  lockdown: {
    emoji: '1f512',
    name: '封站',
    desc: '前 25 秒门还开着，挑一间好守的舱室；之后门全锁死，哪也去不了：刚走过的两间还亮着，里面出的怪会顺着门，从你这间的入口涌进来。撑到第 90 秒',
    note: '把出口变成入口：锁门之前在哪儿停下，就定了接下来怪从哪儿来、来多少',
    team: { slots: [{ tags: ['area'] }, { tags: ['defense'] }, { tags: ['support'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'kills', count: 80 }],
    fight: {
      name: '封站',
      map: 'exit',
      clockSec: 90,
      enemyMods: { mul: { maxHp: 0.4, damage: 0.65 } },
      phases: [
        {
          intro: { title: '封站', sub: '25 秒后门全锁死' },
          mix: [
            { kind: 'mouthless', weight: 2 },
            { kind: 'upsideDown', weight: 2 },
            { kind: 'commuter', weight: 2 },
            { kind: 'smiley', weight: 2 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 500 },
            { kind: 'batch', atMs: 25_000, squad: { count: 8, eliteChance: 0.2 }, banner: { title: '封站', sub: '门全锁死了' } },
          ],
          cues: [{ cue: 'lock', atMs: 25_000 }],
          ends: [{ kind: 'time', ms: 90_000 }],
        },
      ],
    },
  },
  stationPurge: {
    emoji: '1f9f9',
    name: '逐间清剿',
    desc: '每穿过一道门，亮着的舱室里就冒出一队敌人，大多在新到的这一间，连开局这一间一共六队；清空全部就赢。只有走过的三间亮着：留在身后没清完的，灯一灭就定在黑暗里，得绕一圈回来收拾',
    note: '清场跨舱室：走得太快会把敌人甩在黑屋里，单向的门让回头路都变成绕远路',
    team: { slots: [{ tags: ['mobile'] }, { tags: ['area'] }, { tags: ['damage'] }], level: 2 },
    stars: [{ kind: 'time', ms: 120_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '逐间清剿',
      map: 'exit',
      clockSec: 100,
      enemyMods: { mul: { maxHp: 0.4, damage: 0.65 } },
      phases: [
        {
          intro: { title: '逐间清剿', sub: '每穿过一道门冒出一队，清掉全部六队' },
          mix: [
            { kind: 'mouthless', weight: 2 },
            { kind: 'upsideDown', weight: 1 },
            { kind: 'commuter', weight: 2 },
            { kind: 'smiley', weight: 2 },
          ],
          spawns: [
            { kind: 'batch', atMs: 1500, squad: { count: 8 }, banner: { title: '逐间清剿', sub: '这间藏着一队' } },
            { kind: 'batch', atMs: 800, on: 'jump', times: 5, squad: { count: 8, eliteChance: 0.15 }, banner: { title: '新的舱室', sub: '这里也藏着一队' } },
          ],
          ends: [
            { kind: 'cleared' },
            { kind: 'time', ms: 180_000, lose: true },
          ],
        },
      ],
    },
  },
  elitePatrol: {
    emoji: '1f46e',
    name: '精英巡逻',
    desc: '场上最多六只敌人，但只只都是精英，刚走过的两间舱室里出的也会顺着门追过来；队伍伤害提高两成半，两分钟内击杀 20 只',
    note: '数量少、质量高：全员精英加场上上限，换掉了割草的节奏；穿门能甩开它们，也会把它们引进新的舱室，在哪儿接战由你挑',
    team: { slots: [{ tags: ['damage'] }, { tags: ['damage'] }, { tags: ['support'] }], level: 3 },
    stars: [{ kind: 'time', ms: 90_000 }, { kind: 'downs', count: 0 }],
    fight: {
      name: '精英巡逻',
      map: 'exit',
      clockSec: 70,
      enemyMods: { mul: { maxHp: 0.4, damage: 0.7 } },
      rules: { mods: { mul: { damage: 1.25 } } },
      phases: [
        {
          intro: { title: '精英巡逻', sub: '只只都是精英，击杀 20 只' },
          mix: [
            { kind: 'commuter', weight: 2 },
            { kind: 'mouthless', weight: 2 },
            { kind: 'geodeling', weight: 1 },
            { kind: 'lavaGiant', weight: 1 },
          ],
          spawns: [{ kind: 'stream', intervalMs: 1500, eliteChance: 1, cap: 6 }],
          ends: [
            { kind: 'kills', count: 20 },
            { kind: 'time', ms: 120_000, lose: true },
          ],
        },
      ],
    },
  },
} as const satisfies Record<string, ExperimentDef>
