import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, zoneLook } from '../../../kit.ts'

// 🐪 单峰驼：嚼着骆驼刺反刍，喷出一扇酸沫，扇面里的敌人各叠一层毒，每第三口留下一团毒云；技能卷起一场带酸的沙暴，是一大团毒云，火打进去会整团炸开
const ACID = 0x9ccc65

const dromedarySpray = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  range: 3,
  damage: 13,
  fireSfx: 'wash',
  color: ACID,
  shape: { kind: 'sector', radius: 3, arcDeg: 70, ms: 220 },
} satisfies AbilityDef

const dromedarySpray2 = { ...dromedarySpray, range: 3.8, shape: { kind: 'sector', radius: 3.8, arcDeg: 100, ms: 240 } } satisfies AbilityDef

const acidPool = { kind: 'to', who: { side: 'foes', radius: 3.8, sort: 'nearest', count: 1 }, then: [{ kind: 'each', then: [{ kind: 'ground', def: patch(1.5, 4000, ACID, undefined, 3, 500) }] }] } as const

const dromedarySpray3 = { ...dromedarySpray2, cycle: [dromedarySpray2, { ...dromedarySpray2, onHit: [acidPool] }] } satisfies AbilityDef

const dromedaryStorm = {
  trigger: 'manual',
  aim: 'self',
  damage: 7,
  fireSfx: 'gust',
  shape: { kind: 'zone', radius: 3.2, durationMs: 6000, tickMs: 500, visual: zoneLook(ACID) },
  onHit: [{ kind: 'disarm', durationMs: 600 }],
} satisfies AbilityDef

export const abilities = { dromedarySpray, dromedarySpray2, dromedarySpray3, dromedaryStorm } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2, dotDamage: 1.1 } }, { add: { maxHp: 25 }, mul: { damage: 1.45, dotDamage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f42a',
  name: '单峰驼',
  element: 'poison',
  desc: '嚼着骆驼刺长大的单峰驼，本身不会中毒：反刍出一扇酸沫，扇面里的敌人各挨一下、叠一层毒，中了毒什么回复都不管用；技能卷起一场带酸的沙暴，里面的敌人一直掉血、叠毒、睁不开眼；沙暴和酸洼都是毒云，火打进去会整团炸开',
  role: 'area',
  tags: ['damage', 'area'],
  body: { drag: 5, mass: 1.4 },
  stats: { moveSpeed: 4.8, maxStamina: 140, staminaRegen: 55, exertion: 0.7 },
  skill: {
    name: '毒沙暴',
    icon: '1f32c',
    desc: '在脚下卷起 3.2 格带酸的沙暴 6 秒：里面的敌人每半秒挨 7 点、叠一层毒，还睁不开眼、打不出手；火打在沙暴里的敌人身上，沙暴整团炸开，里面的敌人各吃那一下一倍半的伤害',
    cdMs: 15_000,
    ability: 'dromedaryStorm',
  },
  weapons: [],
  innate: [
    {
      name: '酸沫喷',
      icon: '1f42a',
      base: 'dromedarySpray',
      upgrades: [
        { ability: 'dromedarySpray2', card: { icon: '1f444', name: '大口', desc: '喷得更远更宽：3.8 格、100 度' } },
        { ability: 'dromedarySpray3', card: { icon: '1f9ea', name: '酸洼', desc: '每第三口在最近的敌人脚下留一洼 1.5 格的毒云 4 秒，每半秒蚀 3 点、叠一层毒；火打进去会炸开' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
