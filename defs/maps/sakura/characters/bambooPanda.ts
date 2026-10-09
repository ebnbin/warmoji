import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🐼 熊猫：竹棍一戳一扫轮着来，每一下都耗能量；技能太极挡下所有来招，晕住出手的并还手，还回能量
const poke = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'nearest',
  range: 2.4,
  damage: 22,
  cost: 15,
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
  cost: 15,
  fireSfx: 'whoosh',
  shape: { kind: 'sector', radius: 2, arcDeg: 160, ms: 200 },
} satisfies AbilityDef

const sweep2 = { ...sweep, onHit: [{ kind: 'knockup', durationMs: 600, height: 1.2 }] } satisfies AbilityDef

const poke3 = { ...poke, onHit: [{ kind: 'to', who: { side: 'self' }, then: [{ kind: 'healRatio', ratio: 0.02 }] }] } satisfies AbilityDef

const bambooPandaStaff = { ...poke, cycle: [sweep] } satisfies AbilityDef

const bambooPandaStaff2 = { ...poke, cycle: [sweep2] } satisfies AbilityDef

const bambooPandaStaff3 = { ...poke3, cycle: [sweep2] } satisfies AbilityDef

const bambooPandaTaiji = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  color: 0x81c784,
  shape: { kind: 'world' },
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [
        { kind: 'parry', durationMs: 1600, then: [{ kind: 'stun', durationMs: 1200 }, { kind: 'damage', amount: 30 }] },
        { kind: 'gain', amount: 50 },
      ],
    },
  ],
} satisfies AbilityDef

export const abilities = { bambooPandaStaff, bambooPandaStaff2, bambooPandaStaff3, bambooPandaTaiji } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 20, lifesteal: 0.03 }, mul: { damage: 1.2 } }, { add: { maxHp: 45, lifesteal: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f43c',
  name: '熊猫',
  desc: '抡着竹棍、练过太极的熊猫：一戳一扫轮着来，戳得远、扫得开，每一下耗 15 点能量，能量每秒回 12 点，不够就停手；技能太极 1.6 秒内挡下所有来招，晕住出手的并还手，还回 50 点能量',
  role: 'bruiser',
  tags: ['damage', 'defense', 'melee'],
  body: { drag: 5, mass: 1.5 },
  stats: { moveSpeed: 5.2, maxStamina: 130, staminaRegen: 60, exertion: 1 },
  skill: { name: '太极', icon: '262f', desc: '1.6 秒内挡下所有命中，每挡一下就让出手的晕 1.2 秒并还它 30 点伤害；放出时回 50 点能量', cdMs: 11_000, ability: 'bambooPandaTaiji' },
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
  resource: { kind: 'energy', max: 100, start: 100, regen: 12 },
} as const satisfies CharacterAuthoring
