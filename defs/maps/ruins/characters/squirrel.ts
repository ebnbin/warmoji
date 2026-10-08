import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🐿️ 松鼠：远远抛出橡果，越过矮墙砸中敌人，落地还会裂开；技能下一阵松果雨
const squirrelAcorn = {
  trigger: 'auto',
  cooldownMs: 600,
  aim: 'nearest',
  range: 7.5,
  damage: 15,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: { ...shot('1f330', 9, 0.4), flight: { kind: 'arc', peakM: 1.5 } }, lifeMs: 900 },
} satisfies AbilityDef

const squirrelAcorn2 = {
  ...squirrelAcorn,
  shape: { kind: 'bolt', projectile: { ...shot('1f330', 9, 0.4), flight: { kind: 'arc', peakM: 1.5 }, split: { count: 3, spreadDeg: 60, ratio: 0.5 } }, lifeMs: 900 },
} satisfies AbilityDef

const squirrelAcorn3 = { ...squirrelAcorn2, repeat: { count: 2, delayMs: 150, reaim: 'nearest' } } satisfies AbilityDef

const squirrelRain = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  damage: 22,
  fireSfx: 'plip',
  shape: { kind: 'drop', targets: 6, look: { emoji: '1f330', size: 0.8 }, fromAbove: 3, dropMs: 450, staggerMs: 120 },
} satisfies AbilityDef

export const abilities = { squirrelAcorn, squirrelAcorn2, squirrelAcorn3, squirrelRain } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.04 }, mul: { damage: 1.2 } }, { add: { crit: 0.08, maxHp: 15 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f43f',
  name: '松鼠',
  element: 'wood',
  desc: '机灵的松鼠：远远抛出橡果，越过矮墙砸中敌人，囤够了橡果落地还会裂开；技能下一阵松果雨',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.2, mass: 0.5 },
  stats: { moveSpeed: 6.8, maxStamina: 90, staminaRegen: 85, exertion: 0.8 },
  skill: { name: '松果雨', icon: '1f332', desc: '在最近的六个敌人头上各砸下一颗松果', cdMs: 10_000, ability: 'squirrelRain' },
  weapons: [],
  innate: [
    {
      name: '橡果',
      icon: '1f330',
      base: 'squirrelAcorn',
      upgrades: [
        { ability: 'squirrelAcorn2', card: { icon: '1f95c', name: '囤粮', desc: '橡果砸中或落地时裂成三颗向前散开，每颗五成伤害' } },
        { ability: 'squirrelAcorn3', card: { icon: '1f501', name: '连珠', desc: '每次连扔两颗，隔 0.15 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
