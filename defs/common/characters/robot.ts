import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import type { WeaponSource } from '../../../src/types/weapons'

const laserBeam = {
  trigger: 'auto',
  cooldownMs: 900,
  aim: 'nearest',
  fireSfx: 'zap',
  range: 8,
  damage: 14,
  knockback: 2.5,
  color: 0xff5252,
  piercesWalls: true,
  held: { look: { emoji: '1f526', size: 0.75, rotationOffsetDeg: 135 }, restOffset: 0.45 },
  shape: { kind: 'segment', reach: 8, radius: 0.22, ms: 0, beam: true },
} satisfies AbilityDef

const laserBeam2 = { ...laserBeam, repeat: { count: 2, spreadDeg: 360 } } satisfies AbilityDef

const laserBeam3 = {
  ...laserBeam,
  damage: laserBeam.damage * 0.6,
  repeat: { count: 8, spreadDeg: 360, delayMs: 60 },
} satisfies AbilityDef

const robotMirror = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'zap',
  shape: { kind: 'world' },
  onHit: [{ kind: 'barrier', shape: 'ring', length: 2.4, durationMs: 5000, bodies: 'none', shots: true, reflect: true, follow: true, color: 0x80deea }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  laserBeam,
  laserBeam2,
  laserBeam3,
  robotMirror,
} satisfies Record<string, AbilityDef>

/** 这名角色的武器 */
export const weapons = {
  laserBeam: {
    name: '贯穿激光',
    emoji: '1f526',
    base: 'laserBeam',
    upgrades: [
      { ability: 'laserBeam2', card: { icon: '1f52d', name: '双联光束', desc: '开火时向正后方同步射出第二道光束' } },
      { ability: 'laserBeam3', card: { icon: '1f4e1', name: '全域扫射', desc: '光束改为绕自身一周的 8 向扫射，每束 60% 伤害' } },
    ],
  },
} as const satisfies Record<string, WeaponSource>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 40 }, mul: { damage: 1.2 } }, { add: { maxHp: 90 }, mul: { damage: 1.4 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f916',
  name: '机器人',
  desc: '手持激光器，灼穿一条直线上的所有敌人',
  role: 'ranged',
  tags: ['damage', 'defense', 'ranged'],
  body: { drag: 5, mass: 1.4 },
  stats: { moveSpeed: 4.2, maxStamina: 150, staminaRegen: 40, exertion: 0.7, armor: 3 },
  skill: { name: '镜面力场', icon: '1fa9e', desc: '身周张开五秒镜面，敌方弹体碰到就被反弹回去、归我方所有', cdMs: 16_000, ability: 'robotMirror' },
  weapons: ['laserBeam'],
  innate: [],
} as const satisfies CharacterAuthoring
