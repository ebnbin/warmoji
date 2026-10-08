import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot, zoneLook } from '../../../kit.ts'

// ⛄ 雪人：边走边堆会扔雪球的小雪人；技能刮起一场暴风雪，圈里的敌人又慢又钝
const snowball = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'nearest',
  range: 6,
  damage: 8,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: shot('26aa', 9, 0.32), lifeMs: 1000 },
  onHit: [{ kind: 'slow', factor: 0.8, durationMs: 1000 }],
} satisfies AbilityDef

const sleet = { ...snowball, onHit: [...snowball.onHit, { kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'status', status: 'frozen', ms: 800 }] }] } satisfies AbilityDef

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
const frostmanBuild3 = snowmen(sleet, 3)

const frostmanBlizzard = {
  trigger: 'manual',
  aim: 'self',
  damage: 6,
  fireSfx: 'gust',
  shape: { kind: 'zone', radius: 4, durationMs: 5000, tickMs: 500, visual: zoneLook(0xb3e5fc) },
  onHit: [
    { kind: 'slow', factor: 0.6, durationMs: 600 },
    { kind: 'attackSlow', mul: 1.3, durationMs: 600 },
  ],
} satisfies AbilityDef

export const abilities = { frostmanBuild, frostmanBuild2, frostmanBuild3, frostmanBlizzard } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '26c4',
  name: '雪人',
  element: 'ice',
  desc: '在火山脚下的雪地里站岗的雪人：边走边堆会扔雪球的小雪人，雪球砸中的走不快；技能刮起一场暴风雪，圈里的敌人又慢又钝',
  role: 'summoner',
  tags: ['damage', 'summon', 'control'],
  body: { drag: 5, mass: 1.3 },
  stats: { moveSpeed: 4.6, maxStamina: 120, staminaRegen: 55, exertion: 1 },
  skill: {
    name: '暴风雪',
    icon: '1f328',
    desc: '在身边刮起 4 格的暴风雪 5 秒：圈里的敌人每半秒挨一下，移速 ×0.6、出手变慢 ×1.3',
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
        { ability: 'frostmanBuild3', card: { icon: '1f327', name: '冻雨', desc: '同一个敌人 3 秒内挨满 3 个雪球就冻住 0.8 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
