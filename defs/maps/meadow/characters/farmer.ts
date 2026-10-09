import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 🧑‍🌾 农夫：种下会吐豆子的向日葵，丰收时向日葵顺带给队友回血；技能一口气种下三门玉米炮
const seedShot = {
  trigger: 'auto',
  cooldownMs: 900,
  aim: 'nearest',
  range: 6,
  damage: 9,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: shot('1fad8', 10, 0.36), lifeMs: 1400 },
} satisfies AbilityDef

const sunflower = (ability: AbilityDef, maxAlive: number, cooldownMs: number) =>
  ({
    trigger: 'auto',
    cooldownMs,
    aim: 'self',
    fireSfx: 'recruit',
    shape: { kind: 'emplace', count: 1, maxAlive, lifeMs: 14000, look: { emoji: '1f33b', size: 0.9 }, ability },
  }) satisfies AbilityDef

const farmerPlant = sunflower(seedShot, 2, 4500)
const farmerPlant2 = sunflower(seedShot, 3, 3500)
const harvest = { kind: 'to', who: { side: 'allies', radius: 3, filter: { kind: 'hpBelow', who: 'target', ratio: 1 } }, then: [{ kind: 'heal', amount: 2 }] } as const
const farmerPlant3 = sunflower({ ...seedShot, reactions: [{ on: 'fire', to: 'self', effects: [harvest] }] }, 3, 3500)

const cornShot = {
  trigger: 'auto',
  cooldownMs: 1400,
  aim: 'nearest',
  range: 7,
  damage: 14,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: { ...shot('1f33d', 7, 0.5), flight: { kind: 'arc', peakM: 1.6 }, split: { count: 3, spreadDeg: 90, ratio: 0.5 } }, lifeMs: 1600 },
} satisfies AbilityDef

const farmerCorn = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'recruit',
  shape: { kind: 'emplace', count: 3, spread: 1.4, maxAlive: 3, lifeMs: 8000, look: { emoji: '1f33d', size: 0.85 }, ability: cornShot },
} satisfies AbilityDef

export const abilities = { farmerPlant, farmerPlant2, farmerPlant3, farmerCorn } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f33e',
  name: '农夫',
  desc: '边走边种会吐豆子的向日葵，丰收时向日葵还给身边的队友回血；技能一口气种下三门玉米炮',
  role: 'summoner',
  tags: ['damage', 'summon'],
  body: { drag: 5, mass: 1.1 },
  stats: { moveSpeed: 5, maxStamina: 120, staminaRegen: 60, exertion: 1 },
  skill: { name: '玉米炮', icon: '1f33d', desc: '在身边种下三门玉米炮，8 秒内朝敌人抛玉米，落地裂成三粒', cdMs: 15_000, ability: 'farmerCorn' },
  weapons: [],
  innate: [
    {
      name: '种向日葵',
      icon: '1f33b',
      base: 'farmerPlant',
      upgrades: [
        { ability: 'farmerPlant2', card: { icon: '1f331', name: '多种', desc: '最多同时三株，种得更勤' } },
        { ability: 'farmerPlant3', card: { icon: '1f33e', name: '丰收', desc: '向日葵每吐一发豆子，就给身边 3 格内受伤的队友回 2 点血' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
