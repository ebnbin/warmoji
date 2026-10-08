import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import type { WeaponSource } from '../../../src/types/weapons'

const pistol = {
  trigger: 'auto',
  cooldownMs: 600,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 16,
  knockback: 3,
  held: { look: { emoji: '1f52b', size: 0.75, rotationOffsetDeg: 180 }, restOffset: 0.45, mountGap: 0.32 },
  shape: {
    kind: 'bolt',
    projectile: { look: { emoji: '1f4a7', size: 0.45, rotationOffsetDeg: 90 }, radius: 0.15, speed: 13 },
    lifeMs: 2000,
  },
} satisfies AbilityDef

const pistolLeft = {
  ...pistol,
  held: { ...pistol.held, mountSide: -1 },
} satisfies AbilityDef

const pistolRight = {
  ...pistol,
  held: { ...pistol.held, mountSide: 1 },
} satisfies AbilityDef

const pistolLeft2 = { ...pistolLeft, shape: { ...pistol.shape, pierce: 2 } } satisfies AbilityDef

const pistolRight2 = { ...pistolRight, shape: { ...pistol.shape, pierce: 2 } } satisfies AbilityDef

const pistolLeft3 = {
  ...pistolLeft2,
  repeat: { everyN: 4, count: 5, spreadDeg: 32 },
} satisfies AbilityDef

const pistolRight3 = {
  ...pistolRight2,
  repeat: { everyN: 4, count: 5, spreadDeg: 32 },
} satisfies AbilityDef

const cowboyLasso = {
  trigger: 'manual',
  aim: 'nearest',
  range: 6.5,
  fireSfx: 'whoosh',
  damage: 20,
  color: 0xa1887f,
  shape: { kind: 'segment', reach: 6.5, radius: 0.45, ms: 220, beam: true },
  onHit: [{ kind: 'drag', ms: 2500 }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  pistolLeft,
  pistolLeft2,
  pistolLeft3,
  pistolRight,
  pistolRight2,
  pistolRight3,
  cowboyLasso,
} satisfies Record<string, AbilityDef>

/** 这名角色的武器 */
export const weapons = {
  pistolLeft: {
    name: '左轮水枪·左',
    emoji: '1f52b',
    base: 'pistolLeft',
    upgrades: [
      { ability: 'pistolLeft2', card: { icon: '1f3af', name: '贯穿弹', desc: '水弹贯穿敌人，沿途最多命中 3 名' } },
      { ability: 'pistolLeft3', card: { icon: '1f52b', name: '左轮风暴', desc: '每把枪每第 4 次射击变为 5 发扇形弹幕' } },
    ],
  },
  pistolRight: {
    name: '左轮水枪·右',
    emoji: '1f52b',
    base: 'pistolRight',
    upgrades: [
      { ability: 'pistolRight2', card: { icon: '1f3af', name: '贯穿弹', desc: '水弹贯穿敌人，沿途最多命中 3 名' } },
      { ability: 'pistolRight3', card: { icon: '1f52b', name: '左轮风暴', desc: '每把枪每第 4 次射击变为 5 发扇形弹幕' } },
    ],
  },
} as const satisfies Record<string, WeaponSource>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 15 }, mul: { cooldown: 0.88 } }, { add: { maxHp: 30 }, mul: { cooldown: 0.75, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f920',
  name: '牛仔',
  desc: '左右双枪齐发，射出高速水弹',
  role: 'ranged',
  tags: ['damage', 'control', 'ranged'],
  body: { drag: 5, mass: 1 },
  stats: { moveSpeed: 5.8, maxStamina: 120, staminaRegen: 60, exertion: 1 },
  skill: { name: '套索', icon: '1faa2', desc: '甩出六格半的套索，套住的敌人被拴在身后拖行两秒半，期间动弹不得', cdMs: 12_000, ability: 'cowboyLasso' },
  weapons: ['pistolLeft', 'pistolRight'],
  innate: [],
} as const satisfies CharacterAuthoring
