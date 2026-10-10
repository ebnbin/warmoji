import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot, zoneLook } from '../../../kit.ts'

// ⛄ 雪人：边走边堆扔雪球的小雪人，硬雪团砸得碎冻住的敌人；技能刮起一场暴风雪，圈里的敌人一层层冷下去，冷透就冻住
const snowball = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'nearest',
  range: 6,
  element: 'physical',
  damage: 8,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: shot('26aa', 9, 0.32), lifeMs: 1000 },
} satisfies AbilityDef

const iceLump = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'nearest',
  range: 6,
  damage: 7,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: shot('1f9ca', 9, 0.36), lifeMs: 1000 },
} satisfies AbilityDef

const hail = { ...snowball, cycle: [snowball, iceLump] } satisfies AbilityDef

const snowmen = (ability: AbilityDef, maxAlive: number) =>
  ({
    trigger: 'auto',
    cooldownMs: 4200,
    aim: 'self',
    fireSfx: 'recruit',
    shape: { kind: 'emplace', count: 1, maxAlive, lifeMs: 12000, look: { emoji: '2603', size: 0.9 }, ability },
  }) satisfies AbilityDef

const frostmanBuild = snowmen(snowball, 2)
const frostmanBuild2 = snowmen(snowball, 3)
const frostmanBuild3 = snowmen(hail, 3)

const frostmanBlizzard = {
  trigger: 'manual',
  aim: 'self',
  damage: 10,
  fireSfx: 'gust',
  shape: { kind: 'zone', radius: 4, durationMs: 5000, tickMs: 1000, visual: zoneLook(0xb3e5fc) },
} satisfies AbilityDef

export const abilities = { frostmanBuild, frostmanBuild2, frostmanBuild3, frostmanBlizzard } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '26c4',
  name: '雪人',
  element: 'ice',
  desc: '在火山脚下的雪地里站岗的雪人，冻不住：边走边堆会扔雪球的小雪人，雪球是捏实的硬雪团，砸在冻住的敌人身上能把冰敲碎；技能刮起一场暴风雪，圈里的敌人一层层冷下去，冷透了就冻住',
  role: 'summoner',
  tags: ['damage', 'summon', 'control'],
  body: { drag: 5, mass: 1.3 },
  stats: { moveSpeed: 4.6, maxStamina: 120, staminaRegen: 55, exertion: 1 },
  skill: {
    name: '暴风雪',
    icon: '1f328',
    desc: '在身边刮起 4 格的暴风雪 5 秒：圈里的敌人每秒挨一下、冷一层，冷满三层冻住 1.5 秒，湿的一沾就冻',
    cdMs: 14_000,
    ability: 'frostmanBlizzard',
  },
  weapons: [],
  innate: [
    {
      name: '堆雪人',
      icon: '2603',
      base: 'frostmanBuild',
      upgrades: [
        { ability: 'frostmanBuild2', card: { icon: '26c4', name: '雪人军团', desc: '最多同时三个小雪人' } },
        { ability: 'frostmanBuild3', card: { icon: '1f9ca', name: '冰雹', desc: '小雪人每扔两个雪球就扔一块冰坨，砸中的冷一层，冷满三层冻住' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
