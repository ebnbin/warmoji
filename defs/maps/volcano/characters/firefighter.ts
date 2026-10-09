import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🧑‍🚒 消防员：喷淋给最伤的队友回血、水柱冲开敌人，两样轮着来；技能放下水幕，全队回血减伤，敌方的弹体被弹回去
const hurt = { kind: 'hpBelow', who: 'target', ratio: 1 } as const

const firefighterSpray = {
  trigger: 'auto',
  cooldownMs: 1250,
  aim: 'self',
  fireSfx: 'splash',
  shape: { kind: 'world' },
  onHit: [{ kind: 'to', who: { side: 'allies', radius: 4, filter: hurt, sort: 'weakest', count: 1 }, then: [{ kind: 'heal', amount: 12 }] }],
} satisfies AbilityDef

const jet = {
  trigger: 'manual',
  class: 'attack',
  aim: 'nearest',
  range: 4.3,
  damage: 11,
  knockback: 1.5,
  color: 0x4fc3f7,
  fireSfx: 'wash',
  shape: { kind: 'segment', reach: 4, radius: 0.45, ms: 200, beam: true },
} satisfies AbilityDef

const firefighterJet = { trigger: 'auto', cooldownMs: 1250, aim: 'self', shape: { kind: 'world' }, onHit: [{ kind: 'cast', ability: jet }] } satisfies AbilityDef

const firefighterHose = { ...firefighterSpray, cycle: [firefighterJet] } satisfies AbilityDef

const firefighterSpray2 = {
  ...firefighterSpray,
  onHit: [
    ...firefighterSpray.onHit,
    { kind: 'to', who: { side: 'allies', radius: 4, filter: hurt }, then: [{ kind: 'shield', amount: 0, ratio: 0.06, ms: 3000 }, { kind: 'cleanse' }] },
  ],
} satisfies AbilityDef
const firefighterHose2 = { ...firefighterSpray2, cycle: [firefighterJet] } satisfies AbilityDef

const firefighterJet3 = { ...firefighterJet, onHit: [{ kind: 'cast', ability: { ...jet, onHit: [{ kind: 'attune', element: 'water', ms: 4000 }] } }] } satisfies AbilityDef
const firefighterHose3 = { ...firefighterSpray2, cycle: [firefighterJet3] } satisfies AbilityDef

const firefighterCurtain = {
  trigger: 'manual',
  aim: 'self',
  color: 0x4fc3f7,
  fxRadius: 1.25,
  fireSfx: 'wash',
  shape: { kind: 'all', of: 'allies' },
  onHit: [
    { kind: 'healRatio', ratio: 0.25 },
    { kind: 'guard', mul: 0.7, durationMs: 4000 },
  ],
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [{ kind: 'barrier', shape: 'ring', length: 2.5, durationMs: 4000, bodies: 'none', shots: true, reflect: true, follow: true, color: 0x4fc3f7 }],
    },
  ],
} satisfies AbilityDef

export const abilities = { firefighterHose, firefighterHose2, firefighterHose3, firefighterCurtain } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { healing: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { healing: 1.45, damage: 1.25 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f692',
  name: '消防员',
  element: 'water',
  desc: '扛着水带的消防员：喷淋与水柱轮着来，喷淋给身周 4 格内最伤的队友回血，水柱冲开前方一排敌人，没人受伤或没有敌人时那一下就落空；技能放下水幕，全队回血减伤，敌方的弹体被弹回去',
  role: 'support',
  tags: ['support', 'ranged'],
  body: { drag: 5, mass: 1.2 },
  stats: { moveSpeed: 5.4, maxStamina: 130, staminaRegen: 65, exertion: 0.9 },
  skill: {
    name: '水幕',
    icon: '1f30a',
    desc: '全队回复 25% 的生命，4 秒内受到的伤害 ×0.7；身周立起一圈 2.5 格、跟着自己的水幕 4 秒，把敌方的弹体弹回去',
    cdMs: 16_000,
    ability: 'firefighterCurtain',
  },
  weapons: [],
  innate: [
    {
      name: '水枪',
      icon: '1f692',
      base: 'firefighterHose',
      upgrades: [
        { ability: 'firefighterHose2', card: { icon: '1f9ef', name: '灭火', desc: '喷淋还给身周 4 格内受伤的队友各挂一层生命 6% 的护盾 3 秒，并解除控制与减速' } },
        { ability: 'firefighterHose3', card: { icon: '1f4a6', name: '高压', desc: '水柱冲中的敌人 4 秒内变成水元素，雷与冰打它更疼' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
