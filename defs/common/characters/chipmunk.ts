import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import { shot } from '../abilityKit.ts'

// 🐿 松鼠：弹匣打空换弹，翻滚攒着次数用
const chipAcorn = {
  trigger: 'auto',
  cooldownMs: 180,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 11,
  knockback: 1,
  shape: { kind: 'bolt', projectile: shot('1f330', 13), lifeMs: 1400 },
  ammo: { count: 6, reloadMs: 1700 },
} satisfies AbilityDef

const chipAcorn2 = { ...chipAcorn, reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'refresh', what: 'skill' }] }] } satisfies AbilityDef

const chipAcorn3 = {
  ...chipAcorn2,
  shape: { ...chipAcorn.shape, pierce: 1 },
  ammo: { count: 6, reloadMs: 1700, last: [{ kind: 'stun', durationMs: 600 }] },
} satisfies AbilityDef

const chipRoll = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  charges: 3,
  shape: { kind: 'sprint', distance: 3, ms: 200 },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'invuln', ms: 250 }] }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  chipAcorn,
  chipAcorn2,
  chipAcorn3,
  chipRoll,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 15 }, mul: { damage: 1.2 } }, { add: { maxHp: 35 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f43f',
  name: '松鼠',
  desc: '六发橡果打空了要换弹；翻滚攒着三次随时用',
  role: 'ranged',
  tags: ['damage', 'ranged', 'mobile'],
  body: { drag: 4.5, mass: 0.6 },
  stats: { moveSpeed: 7.33, maxStamina: 70, staminaRegen: 95, exertion: 1 },
  skill: { name: '翻滚', icon: '1f4a8', desc: '朝指定方向翻滚三格、翻滚中无敌；可攒三次，每次单独恢复', cdMs: 3_500, ability: 'chipRoll', aim: true },
  weapons: [],
  innate: [
    {
      name: '橡果连射',
      icon: '1f330',
      base: 'chipAcorn',
      upgrades: [
        { ability: 'chipAcorn2', card: { icon: '1f504', name: '补给', desc: '橡果打死敌人补回一次翻滚' } },
        { ability: 'chipAcorn3', card: { icon: '1f95c', name: '硬壳弹', desc: '橡果贯穿一名敌人，每匣最后一发眩晕' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
