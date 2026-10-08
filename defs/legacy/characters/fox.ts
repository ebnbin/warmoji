import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import { shot } from '../abilityKit.ts'

// 🦊 灵狐：迷惑，让敌人不由自主地走向你
const foxCharm = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 18,
  knockback: 1,
  shape: { kind: 'bolt', projectile: shot('1f496', 10), lifeMs: 1600 },
  onHit: [{ kind: 'charm', durationMs: 1300 }],
} satisfies AbilityDef

const foxKiss = [
  { kind: 'if', when: { kind: 'marked', who: 'target', mark: 'charm' }, then: [{ kind: 'stun', durationMs: 1200 }, { kind: 'damage', amount: 0, ratio: 1 }], else: [{ kind: 'charm', durationMs: 1300 }] },
] as const

const foxCharm2 = { ...foxCharm, onHit: foxKiss } satisfies AbilityDef

const foxCharm3 = {
  ...foxCharm,
  onHit: [...foxKiss, { kind: 'deathMark', ms: 1500, then: [{ kind: 'to', who: { side: 'foes', radius: 2.2 }, then: [{ kind: 'charm', durationMs: 1000 }] }] }],
} satisfies AbilityDef

const foxClones = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'whoosh',
  shape: { kind: 'world' },
  reactions: [{ on: 'fire', to: 'self', effects: [
    { kind: 'summon', of: { clone: { dmgRatio: 0.5 } }, count: 2, lifeMs: 6000, hpRatio: 0.4, onDeath: [{ kind: 'to', who: { side: 'foes', radius: 2.5 }, then: [{ kind: 'charm', durationMs: 1500 }] }] },
    { kind: 'hide', durationMs: 1500 },
  ] }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  foxCharm,
  foxCharm2,
  foxCharm3,
  foxClones,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 15 }, mul: { damage: 1.25 } }, { add: { maxHp: 35 }, mul: { damage: 1.5 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f98a',
  name: '灵狐',
  desc: '媚眼让敌人不由自主地走向她；九尾分身替她挨打',
  role: 'controller',
  tags: ['control', 'ranged', 'summon'],
  body: { drag: 5, mass: 0.7 },
  stats: { moveSpeed: 6.2, maxStamina: 90, staminaRegen: 80, exertion: 0.9 },
  skill: { name: '九尾分身', icon: '1f3ad', desc: '身边化出两只分身六秒，带着她一半威力的媚眼，分身被打散时魅惑周围敌人；本体隐匿一秒半', cdMs: 15_000, ability: 'foxClones' },
  weapons: [],
  innate: [
    {
      name: '媚眼',
      icon: '1f496',
      base: 'foxCharm',
      upgrades: [
        { ability: 'foxCharm2', card: { icon: '1f48b', name: '心醉', desc: '媚眼命中已被魅惑的敌人改为眩晕它并追加伤害' } },
        { ability: 'foxCharm3', card: { icon: '1f494', name: '勾魂', desc: '被媚眼打中的敌人一秒半内死去，魅惑它身边的敌人' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
