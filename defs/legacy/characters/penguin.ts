import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import { shot } from '../abilityKit.ts'

// 🐧 企鹅：冰面打滑，站久了会冻住
const icePatch = { radius: 1.7, durationMs: 4000, tickMs: 0, damage: 0, color: 0xb3e5fc, fillAlpha: 0.3, lineAlpha: 0.6, enterMs: 150, traction: 0.12 } as const

const penguinIce = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 18,
  knockback: 3,
  shape: { kind: 'bolt', projectile: shot('1f9ca', 10), lifeMs: 1800 },
  onHit: [{ kind: 'ground', def: icePatch }],
} satisfies AbilityDef

const penguinIce2 = { ...penguinIce, onHit: [{ kind: 'ground', def: { ...icePatch, dwell: { ms: 1500, effects: [{ kind: 'stun', durationMs: 1500 }] } } }] } satisfies AbilityDef

const penguinIce3 = { ...penguinIce, onHit: [{ kind: 'ground', def: { ...icePatch, pull: 1.2, dwell: { ms: 1500, effects: [{ kind: 'stun', durationMs: 1500 }] } } }] } satisfies AbilityDef

const penguinSlide = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  damage: 24,
  knockback: 8,
  color: 0x81d4fa,
  shape: { kind: 'sprint', distance: 6, ms: 600, radius: 0.8 },
  breach: 1,
  reactions: [{ on: 'cast', to: 'self', effects: [{ kind: 'cleanse' }, { kind: 'unstoppable', durationMs: 700 }] }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  penguinIce,
  penguinIce2,
  penguinIce3,
  penguinSlide,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 35 }, mul: { damage: 1.2 } }, { add: { maxHp: 70 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f427',
  name: '企鹅',
  desc: '冰球在地上铺冰，站在冰上谁都打滑；肚皮滑行撞开一切',
  role: 'controller',
  tags: ['control', 'area', 'mobile'],
  body: { drag: 4, mass: 1.1 },
  stats: { moveSpeed: 6, maxStamina: 100, staminaRegen: 60, exertion: 1.2 },
  skill: { name: '肚皮滑行', icon: '1f6f7', desc: '朝指定方向肚皮滑出六格，撞伤沿途敌人；出发时解除控制并霸体', cdMs: 10_000, ability: 'penguinSlide', aim: true },
  weapons: [],
  innate: [
    {
      name: '冰球',
      icon: '1f9ca',
      base: 'penguinIce',
      upgrades: [
        { ability: 'penguinIce2', card: { icon: '1f976', name: '冻结', desc: '在冰面上连续站满一秒半的敌人被冻住' } },
        { ability: 'penguinIce3', card: { icon: '1f300', name: '冰窝', desc: '冰面向中心倾斜，把敌人往中间带' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
