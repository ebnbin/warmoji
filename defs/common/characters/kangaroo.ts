import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import type { WeaponSource } from '../../../src/types/weapons'

const boomerang = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  fireSfx: 'whoosh',
  damage: 18,
  knockback: 4.5,
  held: { look: { emoji: '1fa83', size: 0.75, rotationOffsetDeg: 0 }, restOffset: 0.5 },
  shape: { kind: 'flyer', range: 4, outMs: 500, returnSpeed: 10, radius: 0.5, spinDegPerSec: 800 },
} satisfies AbilityDef

const bounceStomp = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  damage: 40,
  knockback: 12,
  color: 0xffb74d,
  shape: { kind: 'leap', distance: 4, ms: 520, height: 1.6, radius: 1.8 },
} satisfies AbilityDef

const boomerang2 = { ...boomerang, repeat: { count: 2, spreadDeg: 360 } } satisfies AbilityDef

const boomerang3 = {
  ...boomerang2,
  shape: { ...boomerang.shape, radius: boomerang.shape.radius * 1.4, coinMagnetRadius: 1.6 },
  held: { ...boomerang.held, look: { ...boomerang.held.look, size: boomerang.held.look.size * 1.4 } },
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  boomerang,
  boomerang2,
  boomerang3,
  bounceStomp,
} satisfies Record<string, AbilityDef>

/** 这名角色的武器 */
export const weapons = {
  boomerang: {
    name: '回旋镖',
    emoji: '1fa83',
    base: 'boomerang',
    upgrades: [
      { ability: 'boomerang2', card: { icon: '1fa83', name: '双子回旋', desc: '同时向相反方向掷出第二枚回旋镖' } },
      { ability: 'boomerang3', card: { icon: '1f9f2', name: '磁力巨镖', desc: '回旋镖增大 40%，并沿途吸取金币' } },
    ],
  },
} as const satisfies Record<string, WeaponSource>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 25 }, mul: { damage: 1.2 } }, { add: { maxHp: 55 }, mul: { damage: 1.45, range: 1.15 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f998',
  name: '袋鼠',
  desc: '掷出回旋镖，去程回程皆可伤敌',
  role: 'ranged',
  tags: ['damage', 'ranged', 'mobile'],
  body: { drag: 4, mass: 0.9 },
  stats: { moveSpeed: 7, maxStamina: 100, staminaRegen: 65, exertion: 0.6 },
  skill: { name: '弹跳践踏', icon: '1f4a5', desc: '朝指定方向跃出四格，落地时范围伤害并击退', cdMs: 9000, ability: 'bounceStomp', aim: true },
  weapons: ['boomerang'],
  innate: [],
} as const satisfies CharacterAuthoring
