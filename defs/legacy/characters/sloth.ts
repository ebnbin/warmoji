import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import { RING, shot } from '../abilityKit.ts'

// 🦥 树懒：时间差——延时炸弹与倒带
const slothFuse = { kind: 'fuse', ms: 2500, then: [{ kind: 'blast', radius: 1.6, ratio: 4, knockback: 6, ring: RING(0xffb74d), breach: 0.6 }] } as const

const slothBomb = {
  trigger: 'auto',
  cooldownMs: 1700,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 8,
  knockback: 1,
  shape: { kind: 'bolt', projectile: shot('23f0', 8), lifeMs: 1800 },
  onHit: [slothFuse],
} satisfies AbilityDef

const slothBomb2 = {
  ...slothBomb,
  onHit: [{ kind: 'if', when: { kind: 'marked', who: 'target', mark: 'fuse' }, then: [{ kind: 'detonate', mark: 'fuse' }], else: [slothFuse] }],
} satisfies AbilityDef

const slothBomb3 = {
  ...slothBomb,
  onHit: [{ kind: 'if', when: { kind: 'marked', who: 'target', mark: 'fuse' }, then: [{ kind: 'detonate', mark: 'fuse' }], else: [{ ...slothFuse, jump: true }] }],
} satisfies AbilityDef

const slothRewind = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'whoosh',
  shape: { kind: 'world' },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'rewind', ms: 3000 }, { kind: 'cleanse' }] }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  slothBomb,
  slothBomb2,
  slothBomb3,
  slothRewind,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 30 }, mul: { damage: 1.25 } }, { add: { maxHp: 60 }, mul: { damage: 1.5 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9a5',
  name: '树懒',
  desc: '往敌人身上挂定时炸弹，自己出事了就倒带回三秒前',
  role: 'area',
  tags: ['damage', 'ranged', 'area'],
  body: { drag: 5, mass: 1.2 },
  stats: { moveSpeed: 4, maxStamina: 60, staminaRegen: 30, exertion: 0.5 },
  skill: { name: '倒带', icon: '23ea', desc: '沿直线闪回三秒前的位置，途中无敌，生命取那时与现在的较高者，并解除控制', cdMs: 12_000, ability: 'slothRewind' },
  weapons: [],
  innate: [
    {
      name: '定时炸弹',
      icon: '23f0',
      base: 'slothBomb',
      upgrades: [
        { ability: 'slothBomb2', card: { icon: '1f4a5', name: '连环引信', desc: '再打中挂着炸弹的敌人立刻引爆' } },
        { ability: 'slothBomb3', card: { icon: '1f9e8', name: '延时连爆', desc: '挂弹的敌人先死了，炸弹跳到最近的敌人身上接着计时' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
