import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🐇 野兔：一蹬跃到敌人身上，专挑残血的补刀，踢死了立刻再跳
const hareKick = {
  trigger: 'auto',
  cooldownMs: 1500,
  aim: 'nearest',
  range: 3.6,
  damage: 30,
  fireSfx: 'jump',
  shape: { kind: 'leap', distance: 3.2, ms: 320, height: 0.8, radius: 0.9 },
} satisfies AbilityDef

const hareKick2 = {
  ...hareKick,
  onHit: [{ kind: 'if', when: { kind: 'hpBelow', who: 'target', ratio: 0.4 }, then: [{ kind: 'damage', amount: 0, ratio: 0.8 }] }],
} satisfies AbilityDef

const hareKick3 = { ...hareKick2, reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'refresh', what: 'this' }] }] } satisfies AbilityDef

const hareBurrow = {
  trigger: 'manual',
  aim: 'nearest',
  range: 7,
  damage: 60,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.6, strikeMs: 300 },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'stealth', durationMs: 2000 }] }],
} satisfies AbilityDef

export const abilities = { hareKick, hareKick2, hareKick3, hareBurrow } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.5 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f407',
  name: '野兔',
  element: 'wood',
  desc: '一蹬就跃到敌人身上，专挑残血的补刀，踢死了立刻再跳；危险了就钻进草里不见',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4, mass: 0.6 },
  stats: { moveSpeed: 7.6, maxStamina: 90, staminaRegen: 95, exertion: 0.8 },
  skill: { name: '狡兔三窟', icon: '1f573', desc: '闪到 7 格内最近的敌人身后重踹，随后潜行 2 秒', cdMs: 10_000, ability: 'hareBurrow' },
  weapons: [],
  innate: [
    {
      name: '蹬踹',
      icon: '1f407',
      base: 'hareKick',
      upgrades: [
        { ability: 'hareKick2', card: { icon: '1fa78', name: '补刀', desc: '对生命低于 40% 的敌人多打八成伤害' } },
        { ability: 'hareKick3', card: { icon: '1f504', name: '连跳', desc: '踹死敌人立刻可以再跳' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
