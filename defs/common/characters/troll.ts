import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import type { WeaponSource } from '../../../src/types/weapons'

const axeSweep = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  fireSfx: 'whoosh',
  damage: 30,
  knockback: 7,
  held: { look: { emoji: '1fa93', size: 0.85, rotationOffsetDeg: 135 }, restOffset: 0.6 },
  shape: { kind: 'sector', radius: 2.2, arcDeg: 150, ms: 260 },
} satisfies AbilityDef

const trollRoar = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'over',
  color: 0xef5350,
  shape: { kind: 'disc', radius: 4.5, at: 'self' },
  onHit: [{ kind: 'taunt', durationMs: 2500 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'guard', mul: 0.6, durationMs: 2500 }] }],
} satisfies AbilityDef

const axeSweep2 = {
  ...axeSweep,
  shape: { ...axeSweep.shape, arcDeg: 360, ms: Math.round(axeSweep.shape.ms * 1.35) },
} satisfies AbilityDef

const axeSweep3 = {
  ...axeSweep2,
  onHit: [{ kind: 'slow', factor: 0.55, durationMs: 1200 }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  axeSweep,
  axeSweep2,
  axeSweep3,
  trollRoar,
} satisfies Record<string, AbilityDef>

/** 这名角色的武器 */
export const weapons = {
  axe: {
    name: '消防斧',
    emoji: '1fa93',
    base: 'axeSweep',
    upgrades: [
      { ability: 'axeSweep2', card: { icon: '1f300', name: '全周横扫', desc: '消防斧扫过整整一圈，攻击四面八方的敌人' } },
      { ability: 'axeSweep3', card: { icon: '1f976', name: '震慑余波', desc: '被横扫命中的敌人减速 45%，持续 1.2 秒' } },
    ],
  },
} as const satisfies Record<string, WeaponSource>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 70 }, mul: { damage: 1.12 } }, { add: { maxHp: 170 }, mul: { damage: 1.28 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f692',
  name: '消防员',
  desc: '抡起消防斧，横扫身前扇形范围',
  role: 'tank',
  tags: ['defense', 'melee', 'area'],
  body: { drag: 4.5, mass: 1.8 },
  stats: { moveSpeed: 3.78, maxStamina: 140, staminaRegen: 45, exertion: 1.3 },
  skill: { name: '吸引火力', icon: '1f4e2', desc: '举起喇叭大喊一声，四格半内的敌人两秒半内只追消防员，期间自己受到的伤害减四成', cdMs: 12_000, ability: 'trollRoar' },
  weapons: ['axe'],
  innate: [],
} as const satisfies CharacterAuthoring
