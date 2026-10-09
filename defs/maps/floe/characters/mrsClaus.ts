import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 🤶 圣诞奶奶：烤一炉姜饼绕着自己转，见了敌人就扑上去撞一下；种下一棵会扔彩球、会给队友回血的圣诞树
const cookies = (count: number) => ({ kind: 'summon', count, minion: { look: { emoji: '1f36a', size: 0.5 }, speed: 7, orbit: { radius: 0.7, spinRadPerSec: 3 } }, lifeMs: 5000 }) as const

const mrsClausCookies = {
  trigger: 'auto',
  cooldownMs: 1800,
  aim: 'self',
  damage: 9,
  fireSfx: 'chirp',
  shape: cookies(2),
} satisfies AbilityDef

const mrsClausCookies2 = { ...mrsClausCookies, shape: cookies(3) } satisfies AbilityDef

const mrsClausCookies3 = { ...mrsClausCookies2, onHit: [{ kind: 'slow', factor: 0.75, durationMs: 1000 }] } satisfies AbilityDef

// 装置的能力里不能写 cycle（装置退场只撤掉第一式）也不能用 cast（从主人身上出手），扔与治只能并进一条总能出手的 world
const mrsClausTree = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'recruit',
  shape: {
    kind: 'emplace',
    count: 1,
    maxAlive: 1,
    lifeMs: 10000,
    look: { emoji: '1f384', size: 1.1 },
    ability: {
      trigger: 'auto',
      cooldownMs: 1200,
      aim: 'self',
      range: 6.5,
      damage: 12,
      shape: { kind: 'world' },
      onHit: [
        { kind: 'to', who: { side: 'foes', radius: 6.5, sort: 'nearest', count: 1 }, then: [{ kind: 'spawnProjectile', projectile: shot('1f38a', 9, 0.4), damage: 12, lifeMs: 1000, aim: 'nearest' }] },
        { kind: 'to', who: { side: 'allies', radius: 3, filter: { kind: 'hpBelow', who: 'target', ratio: 1 }, sort: 'weakest', count: 1 }, then: [{ kind: 'heal', amount: 8 }] },
      ],
    },
  },
} satisfies AbilityDef

export const abilities = { mrsClausCookies, mrsClausCookies2, mrsClausCookies3, mrsClausTree } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f936',
  name: '圣诞奶奶',
  element: 'ice',
  desc: '烤了一炉姜饼的圣诞奶奶：姜饼绕着她转，看见敌人就扑上去撞一下；技能种下一棵圣诞树，一边扔彩球一边给身边的队友回血',
  role: 'summoner',
  tags: ['damage', 'summon'],
  body: { drag: 5, mass: 0.8 },
  stats: { moveSpeed: 5.2, maxStamina: 100, staminaRegen: 65, exertion: 1 },
  skill: { name: '圣诞树', icon: '1f384', desc: '在身边立一棵圣诞树 10 秒：每 1.2 秒朝 6.5 格内最近的敌人扔一个彩球（12 点伤害），同时给树旁 3 格内最伤的队友回 8 点血；没有敌人就不扔，没人受伤就不回', cdMs: 15_000, ability: 'mrsClausTree' },
  weapons: [],
  innate: [
    {
      name: '姜饼',
      icon: '1f36a',
      base: 'mrsClausCookies',
      upgrades: [
        { ability: 'mrsClausCookies2', card: { icon: '1f9c1', name: '再烤一炉', desc: '一次召出三块姜饼' } },
        { ability: 'mrsClausCookies3', card: { icon: '1f36c', name: '糖霜', desc: '姜饼撞到的敌人减速 25%，持续 1 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
