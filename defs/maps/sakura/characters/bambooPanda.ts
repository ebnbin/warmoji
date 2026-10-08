import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🐼 熊猫：竹棍一戳一扫轮着来；技能抱成一团朝一个方向滚出去，把沿路的敌人撞上半空
const poke = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'nearest',
  range: 2.4,
  damage: 22,
  fireSfx: 'thud',
  shape: { kind: 'segment', reach: 2.2, radius: 0.45, ms: 150 },
} satisfies AbilityDef

const sweep = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'nearest',
  range: 2.4,
  damage: 17,
  knockback: 2.5,
  fireSfx: 'whoosh',
  shape: { kind: 'sector', radius: 2, arcDeg: 160, ms: 200 },
} satisfies AbilityDef

const sweep2 = { ...sweep, onHit: [{ kind: 'knockup', durationMs: 600, height: 1.2 }] } satisfies AbilityDef

const poke3 = { ...poke, onHit: [{ kind: 'to', who: { side: 'self' }, then: [{ kind: 'healRatio', ratio: 0.02 }] }] } satisfies AbilityDef

const bambooPandaStaff = { ...poke, cycle: [sweep] } satisfies AbilityDef

const bambooPandaStaff2 = { ...poke, cycle: [sweep2] } satisfies AbilityDef

const bambooPandaStaff3 = { ...poke3, cycle: [sweep2] } satisfies AbilityDef

const bambooPandaRoll = {
  trigger: 'manual',
  aim: 'stick',
  damage: 35,
  fireSfx: 'charge',
  color: 0x81c784,
  shape: { kind: 'sprint', distance: 5, ms: 500, radius: 0.9 },
  onHit: [{ kind: 'knockup', durationMs: 800, height: 1.5 }],
} satisfies AbilityDef

export const abilities = { bambooPandaStaff, bambooPandaStaff2, bambooPandaStaff3, bambooPandaRoll } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 20, lifesteal: 0.03 }, mul: { damage: 1.2 } }, { add: { maxHp: 45, lifesteal: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f43c',
  name: '熊猫',
  element: 'wood',
  desc: '抡着竹棍的熊猫：一戳一扫轮着来，戳得远、扫得开；技能抱成一团朝一个方向滚出去，把沿路的敌人撞上半空',
  role: 'bruiser',
  tags: ['damage', 'melee'],
  body: { drag: 5, mass: 1.5 },
  stats: { moveSpeed: 5.2, maxStamina: 130, staminaRegen: 60, exertion: 1 },
  skill: { name: '竹林卷', icon: '1f38d', desc: '朝摇杆方向滚出 5 格，沿路的敌人挨一下并被撞上半空 0.8 秒', cdMs: 10_000, ability: 'bambooPandaRoll', aim: true },
  weapons: [],
  innate: [
    {
      name: '竹棍',
      icon: '1f38b',
      base: 'bambooPandaStaff',
      upgrades: [
        { ability: 'bambooPandaStaff2', card: { icon: '1f938', name: '滚翻', desc: '扫中的敌人被挑上半空 0.6 秒' } },
        { ability: 'bambooPandaStaff3', card: { icon: '1f343', name: '竹叶', desc: '每戳中一下，回复自己 2% 的生命' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
