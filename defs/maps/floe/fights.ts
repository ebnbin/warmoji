import type { ExperimentDef } from '../../../src/types/runs'

/** 这张图的关卡：每个只试一种新玩法，靠这张图自己的机制成立 */
export const FIGHTS = {
  iceShove: {
    emoji: '1f9ca',
    name: '推下海',
    desc: '我方伤不了敌人，击退却格外有劲：把敌人推下冰缘，冰点上下的海水会把它们冻死；当心破墙犀也会把队员撞下海。让 20 只敌人被寒水冻死',
    note: '只能借地形杀敌：输出换成了击退，冰面打滑让一下推得更远，也让自己更容易掉下去',
    team: { slots: ['horse', 'owl', 'otter'], level: 2 },
    stars: [{ kind: 'time', ms: 90_000 }, { kind: 'hazard', by: 'coldWater', damage: 0 }],
    fight: {
      name: '推下海',
      map: 'floe',
      clockSec: 60,
      enemyMods: { mul: { maxHp: 0.55, damage: 0.8 } },
      rules: { harmless: true, mods: { mul: { knockback: 5 } } },
      phases: [
        {
          intro: { title: '推下海', sub: '让 20 只敌人被寒水冻死' },
          mix: [
            { kind: 'frostSwan', weight: 3 },
            { kind: 'iceBlock', weight: 1 },
            { kind: 'badSnowman', weight: 1 },
            { kind: 'curlingStone', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1200, cap: 30 },
            { kind: 'batch', atMs: 30_000, squad: { count: 3, enemy: 'wallRhino', at: { kind: 'gate', gate: 'drift' } }, banner: { title: '破墙犀', sub: '它们会把人撞下海' } },
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
      enemyMods: { mul: { maxHp: 0.5, damage: 0.75 } },
      phases: [
        {
          intro: { title: '风暴', sub: '阵风一来就躲到雪地上' },
          mix: [
            { kind: 'frostSwan', weight: 3 },
            { kind: 'curlingStone', weight: 2 },
            { kind: 'iceBlock', weight: 1 },
            { kind: 'badSnowman', weight: 1 },
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
      enemyMods: { mul: { maxHp: 0.55, damage: 0.8 } },
      phases: [
        {
          intro: { title: '冰心打捞', sub: '死在水里的金币会沉' },
          mix: [
            { kind: 'frostSwan', weight: 3 },
            { kind: 'iceBlock', weight: 1 },
            { kind: 'badSnowman', weight: 1 },
            { kind: 'curlingStone', weight: 1 },
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
  ironIce: {
    emoji: '26f8',
    name: '冰上铁人',
    desc: '撑过 60 秒，谁都不许倒下，被打倒、掉进海里冻僵都算；敌人伤害提高三成，身上带光圈的敌人陆续上场：打死带增益的掉下好东西，打死带减益的掉下的别让队长踩上去',
    note: '倒下即负：从「打得快」变成「不失误」，冰面打滑、阵风推人，护住脆皮比输出更要紧',
    team: { slots: [{ tags: ['defense'] }, { tags: ['support'] }, { tags: ['damage', 'ranged'] }], level: 2 },
    stars: [{ kind: 'kills', count: 60 }, { kind: 'skills', count: 0 }],
    fight: {
      name: '冰上铁人',
      map: 'floe',
      clockSec: 90,
      enemyMods: { mul: { maxHp: 0.65, damage: 1.3 } },
      phases: [
        {
          intro: { title: '冰上铁人', sub: '撑过 60 秒，谁都不许倒下' },
          mix: [
            { kind: 'frostSwan', weight: 3 },
            { kind: 'tusker', weight: 1 },
            { kind: 'badSnowman', weight: 1 },
            { kind: 'curlingStone', weight: 1 },
          ],
          spawns: [
            { kind: 'stream', intervalMs: 1300 },
            { kind: 'batch', atMs: 5000, squad: { count: 2, carry: 'buff' }, banner: { title: '带增益的敌人', sub: '打死它们，让队长去捡' } },
            { kind: 'batch', atMs: 18_000, squad: { count: 2, carry: 'debuff' }, banner: { title: '带减益的敌人', sub: '打死它们掉下的别去踩' } },
            { kind: 'batch', atMs: 32_000, squad: { count: 2, carry: 'buff' } },
            { kind: 'batch', atMs: 45_000, squad: { count: 2, carry: 'debuff' } },
          ],
          ends: [
            { kind: 'time', ms: 60_000 },
            { kind: 'downs', count: 1 },
          ],
        },
      ],
    },
  },
} as const satisfies Record<string, ExperimentDef>
