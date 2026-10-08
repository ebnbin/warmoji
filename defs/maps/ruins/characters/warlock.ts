import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🧙 巫师：召出绕身飞的鬼火灯去烧敌人；技能和身边的敌人结下亡灵契约，死了的替我方站起来
const warlockWisps = {
  trigger: 'auto',
  cooldownMs: 1800,
  aim: 'self',
  damage: 10,
  fireSfx: 'ignite',
  shape: { kind: 'summon', count: 2, minion: { look: { emoji: '1f56f', size: 0.5 }, speed: 7, orbit: { radius: 0.9, spinRadPerSec: 3 } }, lifeMs: 5000 },
} satisfies AbilityDef

const warlockWisps2 = { ...warlockWisps, shape: { ...warlockWisps.shape, count: 3 } } satisfies AbilityDef

const warlockWisps3 = { ...warlockWisps2, onHit: [{ kind: 'poison', damage: 0, ratio: 0.1, tickMs: 500, durationMs: 3000 }] } satisfies AbilityDef

const warlockPact = {
  trigger: 'manual',
  aim: 'self',
  damage: 20,
  fireSfx: 'boom',
  color: 0x7e57c2,
  shape: { kind: 'disc', radius: 4, at: 'self' },
  onHit: [{ kind: 'deathMark', ms: 6000, then: [{ kind: 'summon', of: 'victim', count: 1, lifeMs: 15_000, hpRatio: 0.5 }] }],
} satisfies AbilityDef

export const abilities = { warlockWisps, warlockWisps2, warlockWisps3, warlockPact } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d9',
  name: '巫师',
  element: 'dark',
  desc: '摆弄鬼火的巫师：召出绕身飞的鬼火灯，穿墙扑向敌人烧一下就灭；技能和身边的敌人结下亡灵契约，契约里死去的会替我方站起来',
  role: 'summoner',
  tags: ['damage', 'summon'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5, maxStamina: 100, staminaRegen: 60, exertion: 1 },
  skill: {
    name: '亡灵契约',
    icon: '1f4dc',
    desc: '4 格内的敌人各挨一下并挂上 6 秒死亡印记：期间死去的以一半生命替我方站起来，撑 15 秒（头目不会）',
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
        { ability: 'warlockWisps2', card: { icon: '1f3ee', name: '三灯', desc: '每次召出三盏鬼火' } },
        { ability: 'warlockWisps3', card: { icon: '1f47b', name: '噬魂', desc: '鬼火烧中的敌人中毒 3 秒，每半秒掉这一下一成的血' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
