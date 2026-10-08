import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { patch, shot } from '../../../kit.ts'

// 🤠 牛仔：一口气打空左轮，每匣最后一发点着敌人；技能扇着击锤朝一个方向连开六枪
const bullet = shot('1f538', 14, 0.32)

const ignite = { kind: 'poison', damage: 0, ratio: 0.12, tickMs: 500, durationMs: 3000 } as const

const gunslingerRevolver = {
  trigger: 'auto',
  cooldownMs: 350,
  aim: 'nearest',
  range: 7,
  damage: 14,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: bullet, lifeMs: 600 },
  ammo: { count: 6, reloadMs: 1500, last: [ignite] },
} satisfies AbilityDef

const gunslingerRevolver2 = { ...gunslingerRevolver, ammo: { count: 8, reloadMs: 1200, last: [ignite] } } satisfies AbilityDef

const gunslingerRevolver3 = {
  ...gunslingerRevolver2,
  ammo: { ...gunslingerRevolver2.ammo, last: [ignite, { kind: 'ground', def: patch(1.2, 3000, 0xff7043, undefined, 4, 500) }] },
} satisfies AbilityDef

const gunslingerFan = {
  trigger: 'manual',
  aim: 'stick',
  damage: 18,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: bullet, lifeMs: 600 },
  repeat: { count: 6, spreadDeg: 60 },
} satisfies AbilityDef

export const abilities = { gunslingerRevolver, gunslingerRevolver2, gunslingerRevolver3, gunslingerFan } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2 } }, { add: { crit: 0.08 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f920',
  name: '牛仔',
  element: 'fire',
  desc: '腰里别着左轮的牛仔：一匣 6 发一口气打完，最后一发点着敌人，3 秒里每半秒烧掉这一发一成二的血；打空了得停 1.5 秒换弹；技能扇着击锤朝一个方向连开六枪',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.5, mass: 1 },
  stats: { moveSpeed: 5.8, maxStamina: 100, staminaRegen: 70, exertion: 1 },
  skill: { name: '扇射', icon: '1faad', desc: '朝摇杆方向一口气打出散开 60 度的 6 发子弹', cdMs: 9_000, ability: 'gunslingerFan', aim: true },
  weapons: [],
  innate: [
    {
      name: '左轮',
      icon: '1f52b',
      base: 'gunslingerRevolver',
      upgrades: [
        { ability: 'gunslingerRevolver2', card: { icon: '23f1', name: '快拔', desc: '一匣装 8 发，换弹只要 1.2 秒' } },
        { ability: 'gunslingerRevolver3', card: { icon: '1f9e8', name: '燃烧弹', desc: '每匣最后一发打中的地方再烧起 1.2 格的火 3 秒，每半秒烫一下' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
