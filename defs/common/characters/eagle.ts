import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import { RING } from '../abilityKit.ts'

// 🦅 猎鹰：抓起敌人砸向另一个敌人
const eagleSlam = [{ kind: 'damage', amount: 0, ratio: 1 }, { kind: 'blast', radius: 1.4, ratio: 1.2, knockback: 6, ring: RING(0xa1887f) }] as const

const eagleGrab = {
  trigger: 'auto',
  cooldownMs: 1700,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 2.2,
  damage: 16,
  shape: { kind: 'segment', reach: 1.9, radius: 0.5, ms: 200, lungeDist: 1.2 },
  onHit: [{ kind: 'throw', to: 'foe', distance: 5, ms: 520, height: 1.8, onLand: eagleSlam }],
} satisfies AbilityDef

const eagleGrab2 = {
  ...eagleGrab,
  onHit: [{ kind: 'throw', to: 'foe', distance: 5, ms: 520, height: 1.8, onLand: [...eagleSlam, { kind: 'stun', durationMs: 1000 }] }],
} satisfies AbilityDef

const eagleGrab3 = {
  ...eagleGrab,
  onHit: [
    { kind: 'throw', to: 'foe', distance: 5, ms: 520, height: 1.8, onLand: [...eagleSlam, { kind: 'stun', durationMs: 1000 }, { kind: 'to', who: { side: 'foes', radius: 1.6 }, then: [{ kind: 'knockup', durationMs: 500, height: 1 }] }] },
  ],
} satisfies AbilityDef

const eagleDive = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  damage: 40,
  knockback: 8,
  color: 0x8d6e63,
  shape: { kind: 'leap', distance: 3, ms: 480, height: 2.2, radius: 1.6 },
  hold: { maxMs: 1500, reachMul: 2.4, damageMul: 2 },
  onHit: [{ kind: 'knockup', durationMs: 500, height: 1 }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  eagleGrab,
  eagleGrab2,
  eagleGrab3,
  eagleDive,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 20 }, mul: { damage: 1.25 } }, { add: { maxHp: 45 }, mul: { damage: 1.5 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f985',
  name: '猎鹰',
  desc: '一把抓起敌人砸到另一个敌人身上；蓄势越久俯冲越远越重',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4.5, mass: 0.8 },
  stats: { moveSpeed: 7.56, maxStamina: 90, staminaRegen: 70, exertion: 0.7 },
  skill: { name: '蓄势俯冲', icon: '1f3af', desc: '按住蓄力，松手朝指定方向俯冲，蓄满时距离与伤害翻倍，落地挑飞周围敌人', cdMs: 9_000, ability: 'eagleDive', aim: true },
  weapons: [],
  innate: [
    {
      name: '抓摔',
      icon: '1f985',
      base: 'eagleGrab',
      upgrades: [
        { ability: 'eagleGrab2', card: { icon: '1f4ab', name: '摔晕', desc: '被摔的敌人落地时眩晕一秒' } },
        { ability: 'eagleGrab3', card: { icon: '1f4a5', name: '连摔', desc: '落地震起周围的敌人' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
