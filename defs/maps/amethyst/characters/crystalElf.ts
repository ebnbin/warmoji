import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, ring } from '../../../kit.ts'

// 🧝 晶灵：本身是冰，从洞顶召下寒晶刺砸在几个敌人头上，落点再炸开一圈碎冰，砸中的都叠一层寒冷；晶壳挡刀不挡火；技能立起一圈反弹弹体的冰晶环，走过圈线的敌人当场冻住
const elfSpike = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'nearest',
  range: 7,
  damage: 11,
  fireSfx: 'tink',
  shape: { kind: 'drop', targets: 2, look: { emoji: '1f537', size: 0.8 }, fromAbove: 3, dropMs: 450, staggerMs: 120 },
  onHit: [{ kind: 'blast', radius: 1.2, ratio: 0.6, knockback: 0, ring: ring(0x80deea) }],
} satisfies AbilityDef

const elfSpike2 = { ...elfSpike, shape: { ...elfSpike.shape, targets: 3 } } satisfies AbilityDef

const elfSpike3 = { ...elfSpike2, onHit: [...elfSpike.onHit, { kind: 'ground', def: patch(1, 2500, 0x80deea, undefined, 0, 1000) }] } satisfies AbilityDef

const elfRing = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'shatter',
  shape: { kind: 'world' },
  onHit: [
    {
      kind: 'barrier',
      shape: 'ring',
      length: 3.5,
      durationMs: 5000,
      bodies: 'none',
      shots: true,
      reflect: true,
      onCross: [{ kind: 'damage', amount: 12 }, { kind: 'status', status: 'frozen', ms: 1000 }],
      color: 0x80deea,
    },
  ],
} satisfies AbilityDef

export const abilities = { elfSpike, elfSpike2, elfSpike3, elfRing } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2, areaDamage: 1.1 } }, { add: { maxHp: 25 }, mul: { damage: 1.45, areaDamage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9dd',
  name: '晶灵',
  element: 'ice',
  desc: '晶洞里长出来的冰晶精灵，本身是冰，冻不住、不怕冰水：从洞顶召下寒晶刺砸在最近的两个敌人头上，落点再炸开一圈碎冰，砸中的都叠一层寒冷，叠满三层就冻住，冻住的交给队友一下敲碎；身上一层晶壳（护甲 3）挡得住刀砍，挡不住燃烧与中毒；危险时立起一圈冰晶环，敌方弹体撞上就被反弹回去，走过圈线的敌人当场冻住',
  role: 'area',
  tags: ['damage', 'area', 'ranged'],
  body: { drag: 5, mass: 0.8 },
  stats: { moveSpeed: 5.4, maxStamina: 100, staminaRegen: 70, exertion: 0.9, armor: 3 },
  skill: {
    name: '冰晶环',
    icon: '1f48d',
    desc: '以自己为心立起一圈 3.5 格的冰晶环 5 秒：敌方弹体撞上就被反弹回去；敌人每走过一次圈线就挨 12 点并当场冻住 1 秒',
    cdMs: 14_000,
    ability: 'elfRing',
  },
  weapons: [],
  innate: [
    {
      name: '寒晶刺',
      icon: '1f537',
      base: 'elfSpike',
      upgrades: [
        { ability: 'elfSpike2', card: { icon: '1f536', name: '晶簇', desc: '一次落下三根寒晶刺' } },
        { ability: 'elfSpike3', card: { icon: '2744', name: '霜地', desc: '寒晶刺落处结一片 1 格的霜 2.5 秒，每秒让站在上面的敌人再叠一层寒冷' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
