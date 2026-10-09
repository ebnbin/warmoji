import type { AbilityDef, Effect } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🦣 猛犸：长鼻卷雪给最伤的队友敷伤、象牙挑开身前的敌人，两样轮着来；技能把全队护进长毛里
const tusk = {
  trigger: 'manual',
  class: 'attack',
  aim: 'nearest',
  range: 2.1,
  damage: 12,
  knockback: 2,
  fireSfx: 'thud',
  shape: { kind: 'sector', radius: 2, arcDeg: 120, ms: 200 },
} satisfies AbilityDef

// 轮流里有一式出不了手整套就停住，所以两式都用 world：没人受伤、身前没敌人时这一式空过
const tuskTurn = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'self',
  shape: { kind: 'world' },
  onHit: [{ kind: 'cast', ability: tusk }],
} satisfies AbilityDef

const trunk = (then: readonly Effect[]) =>
  ({
    trigger: 'auto',
    cooldownMs: 1100,
    aim: 'self',
    fireSfx: 'chirp',
    shape: { kind: 'world' },
    onHit: [{ kind: 'to', who: { side: 'allies', radius: 4.5, filter: { kind: 'hpBelow', who: 'target', ratio: 1 }, sort: 'weakest', count: 1 }, then }],
    cycle: [tuskTurn],
  }) satisfies AbilityDef

const mammothTrunk = trunk([{ kind: 'heal', amount: 11 }])
const mammothTrunk2 = trunk([{ kind: 'heal', amount: 11 }, { kind: 'shield', amount: 0, ratio: 0.06, ms: 3000 }])
const mammothTrunk3 = trunk([{ kind: 'heal', amount: 11 }, { kind: 'shield', amount: 0, ratio: 0.06, ms: 3000 }, { kind: 'mend', amount: 3, tickMs: 500, durationMs: 3000 }])

const mammothShelter = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'rumble',
  color: 0xbcaaa4,
  fxRadius: 1.5,
  shape: { kind: 'all', of: 'allies' },
  onHit: [{ kind: 'cleanse' }, { kind: 'healRatio', ratio: 0.2 }, { kind: 'guard', mul: 0.6, durationMs: 5000 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'barrier', shape: 'ring', length: 3, durationMs: 5000, bodies: 'foes', shots: false, follow: true, color: 0xbcaaa4 }] }],
} satisfies AbilityDef

export const abilities = { mammothTrunk, mammothTrunk2, mammothTrunk3, mammothShelter } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { healing: 1.2 } }, { add: { maxHp: 30 }, mul: { healing: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9a3',
  name: '猛犸',
  element: 'earth',
  desc: '披着长毛的猛犸：长鼻卷雪给 4.5 格内最伤的队友回 11 点血，再用象牙把身前 2 格内的敌人挑开，两样轮着来，没人受伤时敷伤落空、身前没敌人时象牙挑空；技能把全队护进长毛里',
  role: 'support',
  tags: ['support', 'melee'],
  body: { drag: 5.5, mass: 1.7 },
  stats: { moveSpeed: 4.2, maxStamina: 150, staminaRegen: 45, exertion: 1.3 },
  skill: {
    name: '冰河庇护',
    icon: '1f3d4',
    desc: '全队解除控制与减速、回复 20% 生命，5 秒内受到的伤害 ×0.6；身周立起一圈 3 格的长毛屏障跟着自己 5 秒，敌人进不来也出不去',
    cdMs: 17_000,
    ability: 'mammothShelter',
  },
  weapons: [],
  innate: [
    {
      name: '长鼻',
      icon: '1f9a3',
      base: 'mammothTrunk',
      upgrades: [
        { ability: 'mammothTrunk2', card: { icon: '1f9f6', name: '长毛', desc: '敷伤时再给那名队友挂上生命 6% 的护盾 3 秒' } },
        { ability: 'mammothTrunk3', card: { icon: '1f9e3', name: '暖意', desc: '敷伤时再给那名队友回春：3 秒里每半秒回 3 点' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
