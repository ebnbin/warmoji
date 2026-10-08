import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import { RING, shot } from '../abilityKit.ts'

// 🐥 丑小鸭：长够了就变成白天鹅
const caterSilk = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 11,
  knockback: 0.5,
  shape: { kind: 'bolt', projectile: shot('1f4a6', 10), lifeMs: 1800 },
  onHit: [{ kind: 'slow', factor: 0.6, durationMs: 1500 }],
} satisfies AbilityDef

const silkBind = { kind: 'stack', max: 2, durationMs: 3000, then: [{ kind: 'root', durationMs: 1500 }] } as const

const caterSilk2 = { ...caterSilk, onHit: [{ kind: 'slow', factor: 0.6, durationMs: 1500 }, silkBind] } satisfies AbilityDef

const caterSilk3 = { ...caterSilk2, reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'grow', mul: 1.04, max: 1.35 }] }] } satisfies AbilityDef

const caterCocoon = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  damage: 30,
  shape: { kind: 'world' },
  reactions: [{ on: 'fire', to: 'self', effects: [
    { kind: 'stasis', durationMs: 2500 },
    { kind: 'healRatio', ratio: 0.35 },
    { kind: 'fuse', ms: 2500, then: [{ kind: 'blast', radius: 2.6, ratio: 1.5, knockback: 12, ring: RING(0xfff9c4) }] },
  ] }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  caterSilk,
  caterSilk2,
  caterSilk3,
  caterCocoon,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 30 }, mul: { damage: 1.2 } }, { add: { maxHp: 60 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f425',
  name: '丑小鸭',
  desc: '扑腾水花溅敌人一身，打倒 25 个敌人就长成白天鹅，这一局都不再变回去',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 5, mass: 1.1 },
  stats: { moveSpeed: 3.8, maxStamina: 70, staminaRegen: 70, exertion: 1.3 },
  skill: { name: '缩回蛋壳', icon: '1f423', desc: '缩回蛋壳两秒半：期间无敌不可选中、不能行动，回三成半生命，破壳时震开周围敌人', cdMs: 15_000, ability: 'caterCocoon' },
  weapons: [],
  innate: [
    {
      name: '扑水花',
      icon: '1f4a6',
      base: 'caterSilk',
      upgrades: [
        { ability: 'caterSilk2', card: { icon: '1f33f', name: '水草缠身', desc: '三秒内被水花溅中两次的敌人被水草缠住一秒半' } },
        { ability: 'caterSilk3', card: { icon: '1f35e', name: '贪吃', desc: '水花打死敌人时体型长大一点、这一波都不消退，最多一倍三五' } },
      ],
    },
  ],
  resource: { kind: 'growth', max: 25, onKill: 1, keep: true, full: { effects: [{ kind: 'form', to: 0 }] } },
  forms: [
    {
      emoji: '1f9a2',
      name: '白天鹅',
      stats: { mul: { scale: 1.15, moveSpeed: 1.2, exertion: 0.6 } },
      abilities: [
        {
          trigger: 'auto',
          cooldownMs: 700,
          aim: 'nearest',
          fireSfx: 'shoot',
          damage: 14,
          knockback: 1,
          shape: { kind: 'bolt', projectile: { look: { emoji: '1fabd', size: 0.45, rotationOffsetDeg: 0 }, radius: 0.16, speed: 7, flight: { kind: 'homing', degPerSec: 240 } }, lifeMs: 2500 },
          repeat: { count: 3, spreadDeg: 60 },
          onHit: [{ kind: 'slow', factor: 0.7, durationMs: 1000 }],
        },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
