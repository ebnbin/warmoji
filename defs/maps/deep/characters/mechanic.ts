import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🧑‍🔧 潜艇技工：边走边焊下会射电火花的炮台；技能给全队应急维修，回血再挂一层护盾
const spark = {
  trigger: 'auto',
  cooldownMs: 700,
  aim: 'nearest',
  range: 6,
  damage: 8,
  fireSfx: 'zap',
  shape: { kind: 'bolt', projectile: shot('1f387', 10, 0.4), lifeMs: 700 },
} satisfies AbilityDef

const arc = {
  trigger: 'auto',
  cooldownMs: 700,
  aim: 'nearest',
  range: 6,
  damage: 8,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'chain', hops: 2, hopRange: 2.2, decay: 0.75 },
} satisfies AbilityDef

const turret = (ability: AbilityDef, maxAlive: number, lifeMs: number) =>
  ({
    trigger: 'auto',
    cooldownMs: 4500,
    aim: 'self',
    fireSfx: 'clank',
    shape: { kind: 'emplace', count: 1, maxAlive, lifeMs, look: { emoji: '1f529', size: 0.8 }, ability },
  }) satisfies AbilityDef

const mechanicTurret = turret(spark, 2, 12000)
const mechanicTurret2 = turret(spark, 3, 15000)
const mechanicTurret3 = turret(arc, 3, 15000)

const mechanicRepair = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  color: 0xffd54f,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies' },
  onHit: [{ kind: 'healRatio', ratio: 0.2 }, { kind: 'shield', amount: 0, ratio: 0.15, ms: 5000 }],
} satisfies AbilityDef

export const abilities = { mechanicTurret, mechanicTurret2, mechanicTurret3, mechanicRepair } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f527',
  name: '潜艇技工',
  element: 'thunder',
  desc: '潜艇上的技工：边走边焊下会射电火花的炮台，最多同时两座、每座撑 12 秒；技能给全队应急维修，回血再挂一层护盾',
  role: 'summoner',
  tags: ['damage', 'summon', 'support'],
  body: { drag: 5, mass: 1.1 },
  stats: { moveSpeed: 5, maxStamina: 120, staminaRegen: 60, exertion: 1 },
  skill: { name: '应急维修', icon: '1f9f0', desc: '全队回复 20% 生命，挂上生命 15% 的护盾 5 秒', cdMs: 16_000, ability: 'mechanicRepair' },
  weapons: [],
  innate: [
    {
      name: '焊接炮台',
      icon: '1f529',
      base: 'mechanicTurret',
      upgrades: [
        { ability: 'mechanicTurret2', card: { icon: '1f6e0', name: '加固', desc: '最多同时三座炮台，每座撑 15 秒' } },
        { ability: 'mechanicTurret3', card: { icon: '26a1', name: '电弧', desc: '炮台改射电弧，在敌人之间连跳两次' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
