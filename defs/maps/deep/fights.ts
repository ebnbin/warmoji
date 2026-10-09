import type { ExperimentDef } from '../../../src/types/runs'

/** 这张图的关卡：每个只试一种新玩法，靠这张图自己的机制成立 */
export const FIGHTS = {
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
      enemyMods: { mul: { maxHp: 0.7 } },
      phases: [
        {
          intro: { title: '跟艇', sub: '跟着潜艇，它落稳三次就赢' },
          mix: [
            { kind: 'conch', weight: 3 },
            { kind: 'shark', weight: 2 },
            { kind: 'doorCoral', weight: 1 },
            { kind: 'fishSchool', weight: 1 },
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
                  { kind: 'conch', weight: 2 },
                  { kind: 'fishSchool', weight: 1 },
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
            { kind: 'conch', weight: 2 },
            { kind: 'shark', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1600 },
            { kind: 'batch', atMs: 1500, squad: { count: 1, enemy: 'pearlClam', elites: 1, stats: { mul: { maxHp: 1.6 } }, drive: { kind: 'stay' }, at: { kind: 'gate', gate: 'bones' }, bounty: true, escort: { enemy: 'seepBubble', count: 3 } }, banner: { title: '悬赏发布', sub: '三名目标守在远处，一步也不挪' } },
            { kind: 'batch', atMs: 1500, squad: { count: 1, enemy: 'porcupineFish', elites: 1, stats: { mul: { maxHp: 1.2 } }, drive: { kind: 'stay' }, at: { kind: 'gate', gate: 'seep' }, bounty: true, escort: { enemy: 'seepBubble', count: 2 } } },
            { kind: 'batch', atMs: 1500, squad: { count: 1, enemy: 'shark', elites: 1, stats: { mul: { maxHp: 1.2 } }, drive: { kind: 'stay' }, at: { kind: 'gate', gate: 'rubble' }, bounty: true, escort: { enemy: 'conch', count: 3 } } },
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
      enemyMods: { mul: { maxHp: 0.6 } },
      chaseLeader: true,
      phases: [
        {
          intro: { title: '守门', sub: '队长在潜艇门口站满 40 秒' },
          mix: [
            { kind: 'conch', weight: 3 },
            { kind: 'shark', weight: 2 },
            { kind: 'doorCoral', weight: 2 },
            { kind: 'seepBubble', weight: 1 },
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
  slowSwap: {
    emoji: '1f40b',
    name: '换人要等',
    desc: '深海自己的头目深渊巨鲸从陡坎下浮上来，打倒它；换队长要冷却 8 秒，离开潜艇门口就得憋气，谁在前面顶着、什么时候换下来喘口气都得算好',
    note: '换人冷却让「轮着换人放技能」变成要算计的事；头目战加上换气点，站位和换人一起被地图卡住',
    team: { slots: [{ tags: ['defense'] }, { tags: ['damage', 'ranged'] }, { tags: ['support'] }, { tags: ['damage'] }], level: 3 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'time', ms: 90_000 }],
    fight: {
      name: '换人要等',
      map: 'deep',
      clockSec: 120,
      rules: { leader: { switchCdMs: 8000 } },
      phases: [
        {
          mix: [
            { kind: 'conch', weight: 2 },
            { kind: 'seepBubble', weight: 1 },
            { kind: 'fishSchool', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 2500 },
            { kind: 'batch', atMs: 1500, squad: { count: 1, enemy: 'abyssWhale', at: { kind: 'gate', gate: 'abyss' } }, banner: { title: '深渊巨鲸', sub: '深海的头目浮上来了' } },
          ],
          ends: [{ kind: 'boss' }],
        },
      ],
    },
  },
} as const satisfies Record<string, ExperimentDef>
