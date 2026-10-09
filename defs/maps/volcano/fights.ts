import type { ExperimentDef } from '../../../src/types/runs'

/** 这张图的关卡：每个只试一种新玩法，靠这张图自己的机制成立 */
export const FIGHTS = {
  lavaLure: {
    emoji: '1f525',
    name: '引火烧身',
    desc: '我方伤不了敌人，击退却格外有劲：火山隔一阵就喷发，熔岩顺着地势漫下来，敌人追人时会直直穿过熔岩；让 15 只敌人被熔岩烧死',
    note: '只能借地形杀敌：熔岩敌我都烫，要算着喷发的节奏，把敌人引进去、自己站在岩石上',
    team: { slots: ['boxRoo', 'horse', 'owl'], level: 2 },
    stars: [{ kind: 'hazard', by: 'lava', damage: 0 }, { kind: 'time', ms: 110_000 }],
    fight: {
      name: '引火烧身',
      map: 'volcano',
      clockSec: 60,
      enemyMods: { mul: { maxHp: 0.45 } },
      rules: { harmless: true, mods: { mul: { knockback: 4 } } },
      phases: [
        {
          intro: { title: '引火烧身', sub: '让 15 只敌人被熔岩烧死' },
          mix: [
            { kind: 'bison', weight: 4 },
            { kind: 'tusker', weight: 1 },
            { kind: 'quaker', weight: 1 },
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
    desc: '火山每 45 秒喷发一次，每次喷发都从火山口抛出熔岩巨人与火流星，熔岩随后漫过盆地；撑到第三次喷发',
    note: '让地图事件刷怪：每次喷发既是一波敌人也是一片熔岩，平静的那段是喘息也是准备',
    team: { slots: [{ tags: ['defense'] }, { tags: ['area'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    stars: [{ kind: 'downs', count: 0 }, { kind: 'hazard', by: 'lava', damage: 100 }],
    fight: {
      name: '喷发周期',
      map: 'volcano',
      clockSec: 100,
      enemyMods: { mul: { maxHp: 0.45, damage: 0.8 } },
      phases: [
        {
          intro: { title: '喷发周期', sub: '撑到第三次喷发' },
          mix: [
            { kind: 'bison', weight: 3 },
            { kind: 'meltling', weight: 1 },
            { kind: 'chili', weight: 1 },
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
                  { kind: 'lavaGiant', weight: 1 },
                  { kind: 'fireMeteor', weight: 2 },
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
    desc: '在每一个喷气孔上站满 3 秒，熔岩巨人会从喷气孔里钻出来；第 20 秒火山喷发，熔岩顺着地势漫下来，可能正好淹过还没去的那几个',
    note: '到访当目标、地图改写路线：熔岩会封住一些去处，又在凉透后重新放行，先去哪个得看熔岩往哪流',
    team: { slots: [{ tags: ['mobile'] }, { tags: ['defense'] }, { tags: ['area'] }], level: 2 },
    stars: [{ kind: 'time', ms: 60_000 }, { kind: 'skills', count: 0 }],
    fight: {
      name: '喷气孔巡查',
      map: 'volcano',
      clockSec: 90,
      enemyMods: { mul: { maxHp: 0.5, damage: 0.7 } },
      phases: [
        {
          intro: { title: '喷气孔巡查', sub: '站上每一个喷气孔' },
          mix: [
            { kind: 'bison', weight: 3 },
            { kind: 'meltling', weight: 1 },
            { kind: 'tusker', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1000 },
            {
              kind: 'stream',
              intervalMs: 4000,
              mix: [
                { kind: 'lavaGiant', weight: 1 },
                { kind: 'chili', weight: 1 },
              ],
              at: { kind: 'gate', gate: 'vent' },
            },
          ],
          cues: [{ cue: 'erupt', atMs: 10_000 }],
          ends: [
            { kind: 'visit', mark: 'vent', radius: 1.2, ms: 3000 },
            { kind: 'time', ms: 100_000, lose: true },
          ],
        },
      ],
    },
  },
} as const satisfies Record<string, ExperimentDef>
