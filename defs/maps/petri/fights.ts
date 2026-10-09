import type { ExperimentDef } from '../../../src/types/runs'

/** 这张图的关卡：每个只试一种新玩法，靠这张图自己的机制成立 */
export const FIGHTS = {
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
            { kind: 'sneezer', weight: 3 },
            { kind: 'mutant', weight: 2 },
            { kind: 'vomiter', weight: 1 },
            { kind: 'acidVial', weight: 1 },
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
            { kind: 'sneezer', weight: 3 },
            { kind: 'mutant', weight: 2 },
            { kind: 'vomiter', weight: 2 },
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
    desc: '菌落长过的金币被盖住，捡不到也吸不走，把那块清干净才露出来；柴郡猫却能把埋着的币挖走，打死它才吐出来：90 秒内捡到 80 金币',
    note: '掉落物会被地图藏起来：捡钱的时机由溶菌决定，柴郡猫既是对手也是挖掘机',
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
            { kind: 'sneezer', weight: 3 },
            { kind: 'mutant', weight: 2 },
            { kind: 'cheshire', weight: 2 },
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
} as const satisfies Record<string, ExperimentDef>
