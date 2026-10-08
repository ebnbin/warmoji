import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🧑‍🎓 研究生：边走边放下会射孢子的培养皿；技能拉着全队熬夜赶论文，大家出手都快起来
const sporeShot = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'nearest',
  range: 6,
  damage: 8,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: shot('1f7e1', 9, 0.34), lifeMs: 1500 },
} satisfies AbilityDef

const toxicSpore = { ...sporeShot, onHit: [{ kind: 'poison', damage: 0, ratio: 0.1, tickMs: 500, durationMs: 2000 }] } satisfies AbilityDef

const culture = (ability: AbilityDef, maxAlive: number) =>
  ({
    trigger: 'auto',
    cooldownMs: 4300,
    aim: 'self',
    fireSfx: 'recruit',
    shape: { kind: 'emplace', count: 1, maxAlive, lifeMs: 12000, look: { emoji: '1f9eb', size: 0.8 }, ability },
  }) satisfies AbilityDef

const gradStudentCulture = culture(sporeShot, 2)
const gradStudentCulture2 = culture(sporeShot, 3)
const gradStudentCulture3 = culture(toxicSpore, 3)

const gradStudentAllNighter = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  color: 0xa5d6a7,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies' },
  onHit: [{ kind: 'status', status: 'cd', ms: 6000, value: 0.75 }],
} satisfies AbilityDef

export const abilities = { gradStudentCulture, gradStudentCulture2, gradStudentCulture3, gradStudentAllNighter } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f393',
  name: '研究生',
  element: 'wood',
  desc: '走到哪儿接种到哪儿：边走边放下会朝敌人射孢子的培养皿；技能拉着全队熬夜赶论文，一阵子里大家出手都快了',
  role: 'summoner',
  tags: ['damage', 'summon'],
  body: { drag: 5, mass: 1 },
  stats: { moveSpeed: 5, maxStamina: 110, staminaRegen: 60, exertion: 1.1 },
  skill: { name: '熬夜赶论文', icon: '2615', desc: '全体队友 6 秒内出手的冷却 ×0.75', cdMs: 15_000, ability: 'gradStudentAllNighter' },
  weapons: [],
  innate: [
    {
      name: '培养菌种',
      icon: '1f9eb',
      base: 'gradStudentCulture',
      upgrades: [
        { ability: 'gradStudentCulture2', card: { icon: '1f4c8', name: '扩培', desc: '培养皿最多同时放三只' } },
        { ability: 'gradStudentCulture3', card: { icon: '2620', name: '菌毒', desc: '孢子打中的敌人中毒 2 秒，每半秒掉这一发一成的血' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
