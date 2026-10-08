import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import { RING } from '../abilityKit.ts'

// 🐻 拳王熊：左右开弓，把挨的打存起来还回去
const bearLeft = {
  trigger: 'auto',
  cooldownMs: 520,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 1.9,
  damage: 16,
  knockback: 2,
  shape: { kind: 'sector', radius: 1.7, arcDeg: 100, ms: 160 },
} satisfies AbilityDef

const bearRight = { ...bearLeft, damage: 20, knockback: 7 } satisfies AbilityDef

const bearEmpower = { kind: 'empower', hits: 1, then: [{ kind: 'stun', durationMs: 700 }] } as const

const bearHooks = { ...bearLeft, cycle: [bearRight] } satisfies AbilityDef

const bearHooks2 = { ...bearLeft, cycle: [{ ...bearRight, reactions: [{ on: 'fire', to: 'self', effects: [bearEmpower] }] }] } satisfies AbilityDef

const bearHooks3 = { ...bearLeft, onHit: [{ kind: 'pull', speed: 10, gap: 0.2 }], cycle: [{ ...bearRight, reactions: [{ on: 'fire', to: 'self', effects: [bearEmpower] }] }] } satisfies AbilityDef

const bearGrit = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'over',
  shape: { kind: 'world' },
  reactions: [{ on: 'fire', to: 'self', effects: [
    { kind: 'store', ms: 2500, ratio: 1.6, then: [{ kind: 'blast', radius: 3, ratio: 1, knockback: 10, ring: RING(0xff7043) }] },
    { kind: 'guard', mul: 0.5, durationMs: 2500 },
  ] }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  bearHooks,
  bearHooks2,
  bearHooks3,
  bearGrit,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 60 }, mul: { damage: 1.15 } }, { add: { maxHp: 140 }, mul: { damage: 1.32 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f43b',
  name: '拳王熊',
  desc: '左右勾拳轮流出手；硬吃一拳，把挨的打加倍还回去',
  role: 'bruiser',
  tags: ['damage', 'defense', 'melee'],
  body: { drag: 5, mass: 1.6 },
  stats: { moveSpeed: 4.6, maxStamina: 150, staminaRegen: 60, exertion: 1.2 },
  skill: { name: '硬吃一拳', icon: '1f94a', desc: '两秒半内受到的伤害减半并记下来，到时以记下的一倍六为伤害震开三格', cdMs: 13_000, ability: 'bearGrit' },
  weapons: [],
  innate: [
    {
      name: '左右勾拳',
      icon: '1f91c',
      base: 'bearHooks',
      upgrades: [
        { ability: 'bearHooks2', card: { icon: '1f4aa', name: '组合拳', desc: '右拳后的下一记左拳附带眩晕' } },
        { ability: 'bearHooks3', card: { icon: '1f9f2', name: '贴身缠打', desc: '左拳把敌人拽到身前' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
