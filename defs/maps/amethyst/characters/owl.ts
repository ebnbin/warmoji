import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import type { WeaponSource } from '../../../../legacy/types/weapons'

// 🦉 猫头鹰：掷出沉甸甸的月牙镖，飞出去再飞回来，去程回程都把敌人打退，打中的显形；身子轻、飞得灵巧；技能打出一颗月光照明弹
const owlCrescent = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 5,
  damage: 18,
  knockback: 4.5,
  fireSfx: 'whoosh',
  held: { look: { emoji: '1f319', size: 0.75 }, restOffset: 0.5 },
  shape: { kind: 'flyer', range: 5, outMs: 550, returnSpeed: 10, radius: 0.5, spinDegPerSec: 800 },
  onHit: [{ kind: 'reveal', durationMs: 2000 }],
} satisfies AbilityDef

const owlCrescent2 = { ...owlCrescent, repeat: { count: 2, spreadDeg: 360 } } satisfies AbilityDef

const owlCrescent3 = {
  ...owlCrescent2,
  shape: { ...owlCrescent.shape, radius: 0.7, coinMagnetRadius: 1.6 },
  held: { ...owlCrescent.held, look: { ...owlCrescent.held.look, size: 1.05 } },
} satisfies AbilityDef

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

export const abilities = { owlCrescent, owlCrescent2, owlCrescent3, owlFlare } satisfies Record<string, AbilityDef>

export const weapons = {
  owlCrescent: {
    name: '月牙镖',
    emoji: '1f319',
    base: 'owlCrescent',
    upgrades: [
      { ability: 'owlCrescent2', card: { icon: '1f317', name: '双月', desc: '同时朝相反方向再掷出一枚月牙镖' } },
      { ability: 'owlCrescent3', card: { icon: '1f9f2', name: '磁月', desc: '月牙镖大 40%，沿途把 1.6 格内的金币吸过来' } },
    ],
  },
} as const satisfies Record<string, WeaponSource>

export const levels = [{ mul: { damage: 1.2 } }, { add: { crit: 0.08 }, mul: { damage: 1.45, range: 1.15 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f989',
  name: '猫头鹰',
  desc: '黑夜里也看得清的猫头鹰：爪里攥着一枚沉甸甸的月牙镖，掷出 5 格再飞回来，去程回程都打得中、都把敌人远远打退，冻住的挨一下就碎冰，打中的显形 2 秒，躲在暗处的也藏不住；身子轻，生命只有 85，可飞得灵巧，单发的攻击一成五扑空，范围与持续伤害躲不开；技能打出一颗月光照明弹，照亮一大片敌人',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.5, mass: 0.7 },
  stats: { moveSpeed: 6, maxStamina: 95, staminaRegen: 75, exertion: 0.8, maxHp: 85, dodge: 0.15 },
  skill: {
    name: '月光照明弹',
    icon: '1f387',
    desc: '打出一颗照明弹：8 格内的敌人显形 6 秒、受到的伤害 ×1.25 5 秒，并被晃得致盲 1 秒',
    cdMs: 13_000,
    ability: 'owlFlare',
  },
  weapons: ['owlCrescent'],
  innate: [],
} as const satisfies CharacterAuthoring
