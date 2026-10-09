import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, ring, shot } from '../../../kit.ts'

// 😷 口罩人：本身是冰；喷出一团团冷雾，挨一团加一层寒冷，叠满三层冻住、湿的一团就冻；技能在敌人那儿拉一圈隔离带，圈里冷雾弥漫
const MIST = 0x80deea
// 留在地上的冷雾不伤人，只每秒给里面的敌人加一层寒冷
const coldMist = (radius: number, ms: number) => patch(radius, ms, MIST, undefined, 0, 1000)
const burst = { kind: 'blast', radius: 1.2, ratio: 0.5, knockback: 0, ring: ring(MIST) } as const

const maskManMist = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 6.5,
  damage: 9,
  fireSfx: 'gust',
  shape: { kind: 'bolt', projectile: shot('1f32b', 9, 0.5), lifeMs: 1500 },
} satisfies AbilityDef

const maskManMist2 = { ...maskManMist, onHit: [burst] } satisfies AbilityDef

const maskManMist3 = { ...maskManMist, onHit: [burst, { kind: 'ground', def: coldMist(1.2, 3000) }] } satisfies AbilityDef

const maskManLockdown = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  fireSfx: 'clank',
  color: MIST,
  shape: { kind: 'disc', radius: 2.5, at: 'target' },
  onHit: [
    { kind: 'barrier', shape: 'ring', length: 2.5, durationMs: 4000, bodies: 'foes', shots: false, color: MIST },
    { kind: 'ground', def: coldMist(2.5, 4000) },
  ],
} satisfies AbilityDef

export const abilities = { maskManMist, maskManMist2, maskManMist3, maskManLockdown } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.45, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f637',
  name: '口罩人',
  element: 'ice',
  desc: '本身是冰，冻不住；捂着口罩喷出一团团冷雾，挨一团加一层寒冷、走得更慢，叠满三层冻住，湿的挨一团当场冻住；技能在最近的敌人那儿拉起一圈隔离带，把圈里的敌人关在冷雾里',
  role: 'controller',
  tags: ['control', 'ranged'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5.6, maxStamina: 100, staminaRegen: 75, exertion: 0.9 },
  skill: { name: '封控', icon: '1f6a7', desc: '以最近的敌人为心拉起一圈 2.5 格的隔离带，4 秒内敌人出不去也进不来；圈里冷雾弥漫，敌人每秒加一层寒冷，湿的当场冻住', cdMs: 13_000, ability: 'maskManLockdown' },
  weapons: [],
  innate: [
    {
      name: '冷雾',
      icon: '1f32b',
      base: 'maskManMist',
      upgrades: [
        { ability: 'maskManMist2', card: { icon: '2744', name: '寒雾', desc: '冷雾打中时炸开，1.2 格内别的敌人各挨半下、也加一层寒冷' } },
        { ability: 'maskManMist3', card: { icon: '1f9ca', name: '冷链', desc: '冷雾打中处再留下一团 1.2 格的冷雾 3 秒，待在里面的敌人每秒加一层寒冷' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
