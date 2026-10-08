import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

const woodTurretShot = {
  trigger: 'auto',
  cooldownMs: 650,
  aim: 'nearest',
  fireSfx: 'shoot',
  range: 5.5,
  damage: 13,
  knockback: 2.5,
  shape: {
    kind: 'bolt',
    projectile: { look: { emoji: '1fab5', size: 0.42, rotationOffsetDeg: 0 }, radius: 0.15, speed: 11 },
    lifeMs: 2000,
  },
} satisfies AbilityDef

const woodTurret = {
  trigger: 'auto',
  cooldownMs: 4200,
  aim: 'self',
  fireSfx: 'recruit',
  shape: {
    kind: 'emplace',
    count: 1,
    maxAlive: 2,
    lifeMs: 0,
    look: { emoji: '1f3f9', size: 0.95 },
    ability: woodTurretShot,
  },
} satisfies AbilityDef

const quickBuild = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'recruit',
  shape: {
    kind: 'emplace',
    count: 3,
    spread: 1.2,
    maxAlive: 3,
    lifeMs: 8000,
    look: { emoji: '1f3f9', size: 0.95 },
    ability: {
      trigger: 'auto',
      cooldownMs: 650,
      aim: 'nearest',
      fireSfx: 'shoot',
      range: 5.5,
      damage: 10,
      knockback: 2,
      shape: {
        kind: 'bolt',
        projectile: { look: { emoji: '1f3f9', size: 0.5, rotationOffsetDeg: 45 }, radius: 0.16, speed: 14 },
        lifeMs: 1500,
      },
    },
  },
} satisfies AbilityDef

const woodTurret2 = {
  ...woodTurret,
  shape: { ...woodTurret.shape, maxAlive: woodTurret.shape.maxAlive + 1 },
} satisfies AbilityDef

const woodTurret3 = {
  ...woodTurret2,
  shape: { ...woodTurret2.shape, ability: { ...woodTurretShot, repeat: { count: 3, spreadDeg: 17 } } },
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  woodTurret,
  woodTurret2,
  woodTurret3,
  quickBuild,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 40 }, mul: { damage: 1.15 } }, { add: { maxHp: 100 }, mul: { damage: 1.3 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9ab',
  name: '河狸工程师',
  desc: '自己不动手，定期在脚下架起自动开火的弩塔',
  role: 'summoner',
  tags: ['damage', 'summon'],
  body: { drag: 5.5, mass: 1.1 },
  stats: { moveSpeed: 4, maxStamina: 120, staminaRegen: 55, exertion: 1 },
  skill: { name: '工程速建', icon: '1f3d7', desc: '立刻在周围架起三座弩塔，持续八秒', cdMs: 12_000, ability: 'quickBuild' },
  weapons: [],
  innate: [
    {
      name: '林木弩塔',
      icon: '1f3f9',
      base: 'woodTurret',
      upgrades: [
        { ability: 'woodTurret2', card: { icon: '1f3d7', name: '扩建工地', desc: '同时在场的弩塔上限 +1' } },
        { ability: 'woodTurret3', card: { icon: '1f3af', name: '三连弩', desc: '弩塔每次开火改为 3 发扇形连射' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
