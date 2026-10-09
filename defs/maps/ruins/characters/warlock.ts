import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🧙 巫师：以血施法，召鬼火灯要割自己的血，鬼火烧中敌人再补回来；技能以血为祭和身边的敌人结下亡灵契约，死了的替我方站起来
const drink = { kind: 'to', who: { side: 'self' }, then: [{ kind: 'heal', amount: 4 }] } as const

const sway = { kind: 'if', when: { kind: 'hpBelow', who: 'target', ratio: 0.35 }, then: [{ kind: 'deathMark', ms: 2000, then: [{ kind: 'summon', of: 'victim', count: 1, lifeMs: 8000, hpRatio: 0.4 }] }] } as const

const warlockWisps = {
  trigger: 'auto',
  cooldownMs: 1800,
  aim: 'self',
  damage: 10,
  hpCost: 6,
  fireSfx: 'ignite',
  shape: { kind: 'summon', count: 2, minion: { look: { emoji: '1f56f', size: 0.5 }, speed: 7, orbit: { radius: 0.9, spinRadPerSec: 3 } }, lifeMs: 5000 },
  onHit: [drink],
} satisfies AbilityDef

const warlockWisps2 = { ...warlockWisps, onHit: [drink, sway] } satisfies AbilityDef

// “target” 在换到自己身上以后指的是巫师自己
const warlockWisps3 = {
  ...warlockWisps,
  onHit: [{ kind: 'to', who: { side: 'self' }, then: [{ kind: 'heal', amount: 4 }, { kind: 'if', when: { kind: 'hpBelow', who: 'target', ratio: 0.5 }, then: [{ kind: 'heal', amount: 4 }] }] }, sway],
} satisfies AbilityDef

const warlockPact = {
  trigger: 'manual',
  aim: 'self',
  damage: 20,
  hpCost: 20,
  fireSfx: 'boom',
  color: 0x7e57c2,
  shape: { kind: 'disc', radius: 4, at: 'self' },
  onHit: [{ kind: 'deathMark', ms: 6000, then: [{ kind: 'summon', of: 'victim', count: 1, lifeMs: 15_000, hpRatio: 0.5 }] }],
} satisfies AbilityDef

export const abilities = { warlockWisps, warlockWisps2, warlockWisps3, warlockPact } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1, healing: 1.2 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2, healing: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d9',
  name: '巫师',
  element: 'dark',
  desc: '以血施法的巫师：每召一次绕身飞的鬼火灯就割掉自己 6 点生命，鬼火穿墙扑向敌人烧一下就灭，烧中了补回 4 点；技能付 20 点生命和身边的敌人结下亡灵契约，契约里死去的会替我方站起来',
  role: 'summoner',
  tags: ['damage', 'summon'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5, maxStamina: 100, staminaRegen: 60, exertion: 1 },
  skill: {
    name: '亡灵契约',
    icon: '1f4dc',
    desc: '付 20 点生命：4 格内的敌人各挨一下并挂上 6 秒死亡印记，期间死去的以一半生命替我方站起来，撑 15 秒（头目不会）',
    cdMs: 15_000,
    ability: 'warlockPact',
  },
  weapons: [],
  innate: [
    {
      name: '鬼火灯',
      icon: '1f56f',
      base: 'warlockWisps',
      upgrades: [
        { ability: 'warlockWisps2', card: { icon: '1f47b', name: '摄魂', desc: '鬼火烧中生命低于 35% 的敌人，给它挂上 2 秒印记：期间死去的以四成生命替我方站起来，撑 8 秒' } },
        { ability: 'warlockWisps3', card: { icon: '1fa78', name: '血偿', desc: '自己生命低于 50% 时，鬼火烧中敌人补回的生命翻倍，从 4 点变成 8 点' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
