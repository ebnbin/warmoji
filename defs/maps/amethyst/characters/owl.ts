import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🦉 猫头鹰：远远射出羽箭，射中的敌人显形，暗处的藏不住；技能打出一颗月光照明弹
const owlFeather = {
  trigger: 'auto',
  cooldownMs: 550,
  aim: 'nearest',
  range: 8,
  damage: 14,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1fab6', 12, 0.45, 45), lifeMs: 1000 },
  onHit: [{ kind: 'reveal', durationMs: 2000 }],
} satisfies AbilityDef

const owlFeather2 = { ...owlFeather, shape: { ...owlFeather.shape, pierce: 2 } } satisfies AbilityDef

const owlVolley = { ...owlFeather2, repeat: { count: 3, spreadDeg: 20 } } satisfies AbilityDef

const owlFeather3 = { ...owlFeather2, cycle: [owlFeather2, owlVolley] } satisfies AbilityDef

const owlFlare = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'ignite',
  color: 0xfff59d,
  shape: { kind: 'disc', radius: 8, at: 'self' },
  onHit: [
    { kind: 'reveal', durationMs: 6000 },
    { kind: 'status', status: 'exposed', ms: 5000, value: 1.25 },
    { kind: 'disarm', durationMs: 1000 },
  ],
} satisfies AbilityDef

export const abilities = { owlFeather, owlFeather2, owlFeather3, owlFlare } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, projSpeed: 1.1 } }, { add: { crit: 0.08 }, mul: { damage: 1.45, projSpeed: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f989',
  name: '猫头鹰',
  element: 'light',
  desc: '黑夜里也看得清的猫头鹰：远远射出羽箭，射中的敌人显形 2 秒，躲在暗处的也藏不住；技能打出一颗月光照明弹，照亮一大片敌人',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.5, mass: 0.7 },
  stats: { moveSpeed: 6, maxStamina: 95, staminaRegen: 75, exertion: 0.8 },
  skill: {
    name: '月光照明弹',
    icon: '1f387',
    desc: '打出一颗照明弹：8 格内的敌人显形 6 秒、受到的伤害 ×1.25 5 秒，并被晃得致盲 1 秒',
    cdMs: 13_000,
    ability: 'owlFlare',
  },
  weapons: [],
  innate: [
    {
      name: '羽箭',
      icon: '1fab6',
      base: 'owlFeather',
      upgrades: [
        { ability: 'owlFeather2', card: { icon: '1f453', name: '夜视', desc: '羽箭能穿过两个敌人继续飞' } },
        { ability: 'owlFeather3', card: { icon: '1f985', name: '鹰眼', desc: '每第三发改成一次射出三根，散开 20 度' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
