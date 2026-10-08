import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import { shot } from '../abilityKit.ts'

// 😇 天使：拿自己的生命换圣光，救赎倒下的敌人
const vampBlade = {
  trigger: 'auto',
  cooldownMs: 700,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 20,
  knockback: 1.5,
  hpCost: 3,
  shape: { kind: 'bolt', projectile: shot('1f31f', 12), lifeMs: 1600 },
  onHit: [{ kind: 'to', who: { side: 'self' }, then: [{ kind: 'heal', amount: 5 }] }],
} satisfies AbilityDef

const vampMark = { kind: 'if', when: { kind: 'hpBelow', who: 'target', ratio: 0.35 }, then: [{ kind: 'deathMark', ms: 2000, then: [{ kind: 'summon', of: 'victim', count: 1, lifeMs: 8000, hpRatio: 0.4 }] }] } as const

const vampBlade2 = { ...vampBlade, onHit: [{ kind: 'to', who: { side: 'self' }, then: [{ kind: 'heal', amount: 5 }] }, vampMark] } satisfies AbilityDef

const vampBlade3 = {
  ...vampBlade,
  onHit: [{ kind: 'to', who: { side: 'self' }, then: [{ kind: 'heal', amount: 5 }, { kind: 'if', when: { kind: 'hpBelow', who: 'target', ratio: 0.5 }, then: [{ kind: 'heal', amount: 5 }] }] }, vampMark],
} satisfies AbilityDef

const vampRaise = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'boom',
  color: 0xffe082,
  damage: 25,
  hpCost: 20,
  shape: { kind: 'disc', radius: 4.5, at: 'self' },
  onHit: [{ kind: 'deathMark', ms: 5000, then: [{ kind: 'summon', of: 'victim', count: 1, lifeMs: 12000, hpRatio: 0.6 }] }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  vampBlade,
  vampBlade2,
  vampBlade3,
  vampRaise,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 30 }, mul: { damage: 1.2, healing: 1.2 } }, { add: { maxHp: 60 }, mul: { damage: 1.45, healing: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f607',
  name: '天使',
  desc: '每支圣光箭都耗自己的生命，射中了再补回来；倒下的敌人被救赎，站起来为天使而战',
  role: 'ranged',
  tags: ['damage', 'ranged', 'summon'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5.6, maxStamina: 100, staminaRegen: 65, exertion: 0.8 },
  skill: { name: '救赎', icon: '1f54a', desc: '付 20 生命在四格半内洒下圣光，五秒内死去的敌人被救赎，站起来为天使而战十二秒', cdMs: 16_000, ability: 'vampRaise' },
  weapons: [],
  innate: [
    {
      name: '圣光箭',
      icon: '1f31f',
      base: 'vampBlade',
      upgrades: [
        { ability: 'vampBlade2', card: { icon: '1f64f', name: '感化', desc: '圣光箭打中残血敌人留下光印，它两秒内死去就被感化，站起来为天使而战' } },
        { ability: 'vampBlade3', card: { icon: '1f47c', name: '神佑', desc: '自己生命低于一半时，圣光箭补回的生命翻倍' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
