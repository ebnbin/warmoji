import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring } from '../../../kit.ts'

// 🧝 晶灵：从洞顶召下晶刺砸在几个敌人头上，落点再炸开一圈碎晶；技能立起一圈反弹弹体的晶环，走过圈线的敌人挨一下
const elfSpike = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'nearest',
  range: 7,
  damage: 14,
  fireSfx: 'tink',
  shape: { kind: 'drop', targets: 2, look: { emoji: '1f537', size: 0.8 }, fromAbove: 3, dropMs: 450, staggerMs: 120 },
  onHit: [{ kind: 'blast', radius: 1.2, ratio: 0.6, knockback: 1, ring: ring(0xb39ddb) }],
} satisfies AbilityDef

const elfSpike2 = { ...elfSpike, shape: { ...elfSpike.shape, targets: 3 } } satisfies AbilityDef

const elfSpike3 = { ...elfSpike2, onHit: [...elfSpike.onHit, { kind: 'slow', factor: 0.7, durationMs: 1500 }] } satisfies AbilityDef

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
      onCross: [{ kind: 'damage', amount: 20 }, { kind: 'stun', durationMs: 500 }],
      color: 0xb39ddb,
    },
  ],
} satisfies AbilityDef

export const abilities = { elfSpike, elfSpike2, elfSpike3, elfRing } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2, areaDamage: 1.1 } }, { add: { maxHp: 25 }, mul: { damage: 1.45, areaDamage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9dd',
  name: '晶灵',
  element: 'earth',
  desc: '晶洞里长出来的精灵：从洞顶召下晶刺砸在最近的两个敌人头上，落点再炸开一圈碎晶；危险时立起一圈晶环，敌方弹体撞上就被反弹回去，走过圈线的敌人挨一下并眩晕',
  role: 'area',
  tags: ['damage', 'area', 'ranged'],
  body: { drag: 5, mass: 0.8 },
  stats: { moveSpeed: 5.4, maxStamina: 100, staminaRegen: 70, exertion: 0.9 },
  skill: {
    name: '晶环',
    icon: '1f48d',
    desc: '以自己为心立起一圈 3.5 格的晶环 5 秒：敌方弹体撞上就被反弹回去；敌人每走过一次圈线就挨 20 点并眩晕 0.5 秒',
    cdMs: 14_000,
    ability: 'elfRing',
  },
  weapons: [],
  innate: [
    {
      name: '晶刺',
      icon: '1f537',
      base: 'elfSpike',
      upgrades: [
        { ability: 'elfSpike2', card: { icon: '1f536', name: '晶簇', desc: '一次落下三根晶刺' } },
        { ability: 'elfSpike3', card: { icon: '1f539', name: '碎晶', desc: '被晶刺砸中的敌人减速 30%，持续 1.5 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
